using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using NUnit.Framework;
using Scry.Api.Data;
using Shouldly;

namespace Scry.Api.Tests;

[TestFixture]
public sealed class DatabaseTests
{
    private static readonly Dictionary<string, string?> Right = new() { ["host"] = "db", ["password"] = "right" };

    private ScryApiFactory _factory = null!;
    private HttpClient _client = null!;

    [SetUp]
    public void SetUp()
    {
        _factory = new ScryApiFactory();
        _client = _factory.CreateClient();
    }

    [TearDown]
    public void TearDown()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    [Test]
    public async Task Lists_CSV_then_each_database_with_its_description_and_settings()
    {
        var connectors = (await _client.GetFromJsonAsync<JsonElement>("/connectors")).EnumerateArray().ToList();

        connectors.Select(connector => connector.GetProperty("id").GetString()).ShouldBe(["csv", FakeDatabase.Id]);
        connectors[0].GetProperty("description").GetString().ShouldNotBeNullOrWhiteSpace();
        var fake = connectors[1];
        fake.GetProperty("description").GetString().ShouldBe("Reads two tables the tests control.");
        fake.GetProperty("fields").EnumerateArray()
            .Select(field => (field.GetProperty("name").GetString(), field.GetProperty("kind").GetString()))
            .ShouldBe([("host", "Text"), ("password", "Secret")]);
    }

    [Test]
    public async Task Lists_a_databases_tables_and_says_why_a_connection_fails()
    {
        using var wrong = await _client.PostAsJsonAsync(
            "/databases/tables",
            new { connector = FakeDatabase.Id, settings = new { host = "db", password = "wrong" } });
        var tables = await _client.PostAsJsonAsync("/databases/tables", new { connector = FakeDatabase.Id, settings = Right });

        wrong.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await wrong.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("detail").GetString().ShouldBe("The password is wrong.");
        (await tables.Content.ReadFromJsonAsync<JsonElement>()).EnumerateArray()
            .Select(table => table.GetProperty("name").GetString())
            .ShouldBe(["public.orders", "public.people"]);
    }

    [Test]
    public async Task Adds_picked_tables_as_sources_and_keeps_the_connection_encrypted()
    {
        var added = await Add(("public.orders", "orders"), ("public.people", "people"));

        added.Select(source => (source.GetProperty("name").GetString(), source.GetProperty("stream").GetString()))
            .ShouldBe([("orders", "public.orders"), ("people", "public.people")]);
        added[0].GetProperty("connector").GetString().ShouldBe(FakeDatabase.Id);
        added[0].GetProperty("rowCount").GetInt64().ShouldBe(2);

        var rows = await _client.GetFromJsonAsync<JsonElement>(
            $"/sources/{added[0].GetProperty("id").GetInt32()}/rows?offset=0&limit=25");
        rows.GetProperty("values").EnumerateArray().Select(row => row[0].GetString()).ShouldBe(["10.00", "5.00"]);

        using var scope = _factory.Services.CreateScope();
        var connection = await scope.ServiceProvider.GetRequiredService<ScryDbContext>().Connections.SingleAsync();
        connection.Settings.ShouldNotContain("right");
    }

    [Test]
    public async Task Syncs_a_database_table_again_with_what_it_holds_now()
    {
        var id = (await Add(("public.orders", "orders")))[0].GetProperty("id").GetInt32();
        _factory.Database.Orders.Add(7m);

        using var response = await _client.PostAsync(new Uri($"/sources/{id}/sync", UriKind.Relative), null);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("rowCount").GetInt64().ShouldBe(3);
    }

    [Test]
    public async Task Does_not_sync_an_uploaded_file_again()
    {
        using var content = new MultipartFormDataContent();
        content.Add(new StringContent("orders"), "name");
        var file = new ByteArrayContent(Encoding.UTF8.GetBytes("day,amount\n2026-01-01,10\n"));
        file.Headers.ContentType = new MediaTypeHeaderValue("text/csv");
        content.Add(file, "file", "orders.csv");
        using var upload = await _client.PostAsync(new Uri("/sources", UriKind.Relative), content);
        var id = (await upload.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        using var response = await _client.PostAsync(new Uri($"/sources/{id}/sync", UriKind.Relative), null);

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [TestCase("Orders!", HttpStatusCode.BadRequest)]
    [TestCase("people", HttpStatusCode.Conflict)]
    public async Task A_bad_or_taken_name_adds_nothing(string name, HttpStatusCode status)
    {
        await Add(("public.people", "people"));

        using var response = await _client.PostAsJsonAsync(
            "/databases",
            new { connector = FakeDatabase.Id, settings = Right, tables = new[] { new { table = "public.orders", name } } });

        response.StatusCode.ShouldBe(status);
        using var scope = _factory.Services.CreateScope();
        (await scope.ServiceProvider.GetRequiredService<ScryDbContext>().Connections.CountAsync()).ShouldBe(1);
    }

    private async Task<JsonElement[]> Add(params (string Table, string Name)[] tables)
    {
        using var response = await _client.PostAsJsonAsync(
            "/databases",
            new { connector = FakeDatabase.Id, settings = Right, tables = tables.Select(t => new { table = t.Table, name = t.Name }) });
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).EnumerateArray().ToArray();
    }
}
