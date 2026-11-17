using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using NUnit.Framework;
using Scry.Api.Storage;
using Shouldly;
using static Scry.Api.Tests.ScryApiFactory;

namespace Scry.Api.Tests;

[TestFixture]
public sealed class IngestTests
{
    private static readonly string[] IdKey = ["id"];

    private static readonly object Orders = new
    {
        columns = new object[]
        {
            new { name = "id", type = "Int64" },
            new { name = "amount", type = "Decimal", precision = 10, scale = 2 },
            new { name = "day", type = "Date" },
        },
        primaryKey = IdKey,
    };

    private ScryApiFactory _factory = null!;
    private HttpClient _client = null!;

    [SetUp]
    public void SetUp()
    {
        _factory = new ScryApiFactory();
        _client = _factory.SignedIn();
    }

    [TearDown]
    public void TearDown()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    [Test]
    public async Task A_key_is_shown_once_and_kept_only_as_its_hash()
    {
        var made = await MakeKey("Nexus");

        var key = made.GetProperty("key").GetString()!;
        key.ShouldStartWith("scry_");
        made.GetProperty("prefix").GetString().ShouldBe(key[..12]);
        var listed = (await _client.GetFromJsonAsync<JsonElement>($"{InDefault}/keys")).EnumerateArray().Single();
        listed.TryGetProperty("key", out _).ShouldBeFalse();

        using var scope = _factory.Services.CreateScope();
        var stored = await scope.ServiceProvider.GetRequiredService<ScryDbContext>().IngestKeys.SingleAsync();
        stored.Hash.ShouldNotBe(key);
        stored.Hash.ShouldNotContain(key[5..]);
    }

    [Test]
    public async Task Names_the_key_a_request_carries()
    {
        var made = await MakeKey("Nexus");
        using var client = Client(made.GetProperty("key").GetString());

        var named = await client.GetFromJsonAsync<JsonElement>("/ingest");

        named.GetProperty("name").GetString().ShouldBe("Nexus");
        named.GetProperty("prefix").GetString().ShouldBe(made.GetProperty("prefix").GetString());
        using var unknown = Client("scry_not-a-key-Scry-made");
        (await unknown.GetAsync("/ingest")).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [TestCase(null)]
    [TestCase("scry_not-a-key-Scry-made")]
    public async Task A_request_without_a_key_Scry_made_is_refused(string? key)
    {
        using var client = Client(key);

        using var response = await client.PutAsJsonAsync("/ingest/sources/orders", Orders);

        response.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        (await Detail(response)).ShouldBe("Send a push API key as 'Authorization: Bearer <key>'. Make one on a workspace's Settings page in Scry.");
    }

    [Test]
    public async Task Appends_rows_then_merges_them_by_the_key()
    {
        using var client = Client(await KeyFor("Nexus"));
        (await client.PutAsJsonAsync("/ingest/sources/orders", Orders)).StatusCode.ShouldBe(HttpStatusCode.OK);

        var appended = await Batch(client, "orders", null, "append", [[1, "10.00", "2026-11-01"], [2, "5.00", "2026-11-02"]]);
        var merged = await Batch(client, "orders", null, "merge", [[1, "12.50", "2026-11-01"], [3, "7.25", "2026-11-03"]]);

        appended.GetProperty("rowCount").GetInt64().ShouldBe(2);
        merged.GetProperty("rowCount").GetInt64().ShouldBe(3);
        var source = await Listed("orders");
        (source.GetProperty("kind").GetString(), source.GetProperty("pushedBy").GetString()).ShouldBe(("Push", "Nexus"));
        (await Rows(source)).ShouldBe(["1 12.50", "2 5.00", "3 7.25"], ignoreOrder: true);
    }

    [Test]
    public async Task A_batch_sent_twice_is_kept_once()
    {
        using var client = Client(await KeyFor("Nexus"));
        await client.PutAsJsonAsync("/ingest/sources/orders", Orders);

        await Batch(client, "orders", "batch-1", "append", [[1, "10.00", "2026-11-01"]]);
        var again = await Batch(client, "orders", "batch-1", "append", [[1, "10.00", "2026-11-01"]]);

        again.GetProperty("skipped").GetBoolean().ShouldBeTrue();
        again.GetProperty("rowCount").GetInt64().ShouldBe(1);
    }

    [Test]
    public async Task A_replacement_takes_new_columns_and_shows_only_once_committed()
    {
        using var client = Client(await KeyFor("Nexus"));
        await client.PutAsJsonAsync("/ingest/sources/orders", Orders);
        await Batch(client, "orders", null, "append", [[1, "10.00", "2026-11-01"]]);

        using var replace = await client.PostAsJsonAsync("/ingest/sources/orders/replace", new
        {
            columns = new object[] { new { name = "id", type = "String" }, new { name = "region", type = "String" } },
            primaryKey = IdKey,
        });
        await Batch(client, "orders", null, "append", [["a", "east"], ["b", "west"]]);
        var before = await Listed("orders");

        using var commit = await client.PostAsync(new Uri("/ingest/sources/orders/commit", UriKind.Relative), null);

        (await replace.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("replacing").GetBoolean().ShouldBeTrue();
        before.GetProperty("rowCount").GetInt64().ShouldBe(1);
        var committed = await commit.Content.ReadFromJsonAsync<JsonElement>();
        committed.GetProperty("rowCount").GetInt64().ShouldBe(2);
        committed.GetProperty("replacing").GetBoolean().ShouldBeFalse();
        committed.GetProperty("columns").EnumerateArray().Select(c => c.GetProperty("name").GetString()).ShouldBe(["id", "region"]);
        (await Rows(await Listed("orders"))).ShouldBe(["a east", "b west"], ignoreOrder: true);
    }

    [Test]
    public async Task Adds_a_column_but_takes_a_replacement_to_change_one()
    {
        using var client = Client(await KeyFor("Nexus"));
        await client.PutAsJsonAsync("/ingest/sources/orders", Orders);

        using var added = await client.PutAsJsonAsync("/ingest/sources/orders", new
        {
            columns = new object[]
            {
                new { name = "id", type = "Int64" },
                new { name = "amount", type = "Decimal", precision = 10, scale = 2 },
                new { name = "day", type = "Date" },
                new { name = "note", type = "String" },
            },
            primaryKey = IdKey,
        });
        using var changed = await client.PutAsJsonAsync("/ingest/sources/orders", new
        {
            columns = new object[] { new { name = "id", type = "String" } },
            primaryKey = IdKey,
        });

        added.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await added.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("columns").GetArrayLength().ShouldBe(4);
        await Batch(client, "orders", null, "append", [[1, "10.00", "2026-11-01", "first"]]);
        changed.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await Detail(changed)).ShouldBe(
            "Changing or removing column 'id' takes a replacement: POST /ingest/sources/orders/replace with the new columns.");
    }

    [Test]
    public async Task A_key_writes_only_to_the_sources_it_made()
    {
        using var nexus = Client(await KeyFor("Nexus"));
        using var script = Client(await KeyFor("Script"));
        await nexus.PutAsJsonAsync("/ingest/sources/orders", Orders);
        using (var form = new MultipartFormDataContent())
        {
            form.Add(new StringContent("customers"), "name");
            form.Add(new ByteArrayContent(Encoding.UTF8.GetBytes("name\nAda\n")), "file", "customers.csv");
            (await _client.PostAsync(new Uri($"{InDefault}/sources", UriKind.Relative), form)).StatusCode.ShouldBe(HttpStatusCode.Created);
        }

        using var other = await script.PostAsJsonAsync("/ingest/sources/orders/batches", new { rows = new[] { new object[] { 1, "1.00", "2026-11-01" } } });
        using var upload = await script.PutAsJsonAsync("/ingest/sources/customers", Orders);

        other.StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (await Detail(other)).ShouldBe("This key did not make 'orders', so it cannot write to it.");
        upload.StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (await Detail(upload)).ShouldBe("'customers' was not made through the push API, so no key writes to it.");
    }

    [TestCase("[[1, 10.5, \"2026-11-01\"], [2, true, \"2026-11-02\"]]", "Row 2, column 'amount': expected a decimal number, best sent as a string to keep its digits.")]
    [TestCase("[[1, \"10.00\"]]", "Row 1 holds 2 values, and the source has 3 columns.")]
    [TestCase("[[null, \"10.00\", \"2026-11-01\"]]", "Row 1, column 'id': a key column cannot be null.")]
    [TestCase("[[1, \"10.00\", \"November 1\"]]", "Row 1, column 'day': expected a date such as 2026-11-15.")]
    public async Task Refuses_a_batch_whose_rows_do_not_fit_and_writes_none_of_it(string rows, string detail)
    {
        using var client = Client(await KeyFor("Nexus"));
        await client.PutAsJsonAsync("/ingest/sources/orders", Orders);

        using var response = await client.PostAsync(
            new Uri("/ingest/sources/orders/batches", UriKind.Relative),
            new StringContent($$"""{"rows": {{rows}}}""", Encoding.UTF8, "application/json"));

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await Detail(response)).ShouldBe(detail);
        (await Listed("orders")).GetProperty("rowCount").GetInt64().ShouldBe(0);
    }

    [Test]
    public async Task Keeps_where_a_pushed_sources_rows_come_from_and_the_key_that_pushes_them()
    {
        var made = await MakeKey("Nexus at nexus.test");
        using var client = Client(made.GetProperty("key").GetString());
        const string Shop = "Nexus workspace Acme, connection Shop (MySQL), stream shop.orders";
        var columns = new object[] { new { name = "id", type = "Int64" }, new { name = "item", type = "String" } };

        (await client.PutAsJsonAsync("/ingest/sources/orders", new { columns, primaryKey = IdKey, origin = Shop })).StatusCode.ShouldBe(HttpStatusCode.OK);
        var listed = await Listed("orders");
        listed.GetProperty("origin").GetString().ShouldBe(Shop);
        listed.GetProperty("pushedBy").GetString().ShouldBe("Nexus at nexus.test");
        listed.GetProperty("pushKeyPrefix").GetString().ShouldBe(made.GetProperty("prefix").GetString());

        (await client.PutAsJsonAsync("/ingest/sources/orders", new { columns, primaryKey = IdKey })).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await Listed("orders")).GetProperty("origin").GetString().ShouldBe(Shop);
        const string Warehouse = "Nexus workspace Acme, connection Warehouse (MySQL), stream wh.orders";
        (await client.PostAsJsonAsync("/ingest/sources/orders/replace", new { columns, primaryKey = IdKey, origin = Warehouse })).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await Listed("orders")).GetProperty("origin").GetString().ShouldBe(Warehouse);

        using var tooLong = await client.PutAsJsonAsync("/ingest/sources/orders", new { columns, primaryKey = IdKey, origin = new string('x', 501) });
        tooLong.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await Detail(tooLong)).ShouldBe("An origin is 500 characters at most.");
    }

    [Test]
    public async Task A_key_takes_over_a_pushed_source_whose_key_was_revoked()
    {
        var first = await MakeKey("Nexus at old.test");
        using (var old = Client(first.GetProperty("key").GetString()))
        {
            await old.PutAsJsonAsync("/ingest/sources/orders", Orders);
            await Batch(old, "orders", null, "append", [[1, "10.00", "2026-11-01"]]);
        }

        (await _client.DeleteAsync(new Uri($"{InDefault}/keys/{first.GetProperty("id").GetInt32()}", UriKind.Relative))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        using var next = Client(await KeyFor("Nexus at new.test"));
        using var other = Client(await KeyFor("Script"));

        (await next.PostAsJsonAsync("/ingest/sources/orders/replace", Orders)).StatusCode.ShouldBe(HttpStatusCode.OK);
        await Batch(next, "orders", null, "append", [[2, "20.00", "2026-11-02"]]);
        (await next.PostAsync(new Uri("/ingest/sources/orders/commit", UriKind.Relative), null)).StatusCode.ShouldBe(HttpStatusCode.OK);

        var listed = await Listed("orders");
        listed.GetProperty("pushedBy").GetString().ShouldBe("Nexus at new.test");
        listed.GetProperty("rowCount").GetInt64().ShouldBe(1);
        using var refused = await other.PutAsJsonAsync("/ingest/sources/orders", Orders);
        refused.StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (await Detail(refused)).ShouldBe("This key did not make 'orders', so it cannot write to it.");
    }

    [Test]
    public async Task Removing_a_pushed_source_drops_its_table_and_the_same_name_pushed_again_starts_empty()
    {
        using var client = Client(await KeyFor("Nexus"));
        await client.PutAsJsonAsync("/ingest/sources/orders", Orders);
        await Batch(client, "orders", "b1", "append", [[1, "10.00", "2026-11-01"]]);
        var id = (await Listed("orders")).GetProperty("id").GetInt32();

        (await _client.DeleteAsync(new Uri($"{InDefault}/sources/{id}", UriKind.Relative))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await client.PutAsJsonAsync("/ingest/sources/orders", Orders)).StatusCode.ShouldBe(HttpStatusCode.OK);
        var again = await Batch(client, "orders", "b1", "append", [[2, "20.00", "2026-11-02"]]);

        again.GetProperty("skipped").GetBoolean().ShouldBeFalse();
        again.GetProperty("rowCount").GetInt64().ShouldBe(1);
    }

    [Test]
    public async Task A_new_pushed_source_replaces_a_table_left_without_a_source()
    {
        using var client = Client(await KeyFor("Nexus"));
        await client.PutAsJsonAsync("/ingest/sources/orders", Orders);
        await Batch(client, "orders", null, "append", [[1, "10.00", "2026-11-01"]]);
        using (var scope = _factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<ScryDbContext>().Sources.Where(s => s.Name == "orders").ExecuteDeleteAsync();
        }

        (await client.PutAsJsonAsync("/ingest/sources/orders", Orders)).StatusCode.ShouldBe(HttpStatusCode.OK);

        (await Rows(await Listed("orders"))).ShouldBeEmpty();
    }

    [Test]
    public async Task Revoking_a_key_keeps_its_sources_and_stops_its_writes()
    {
        var made = await MakeKey("Nexus");
        using var client = Client(made.GetProperty("key").GetString());
        await client.PutAsJsonAsync("/ingest/sources/orders", Orders);

        using var revoked = await _client.DeleteAsync(new Uri($"{InDefault}/keys/{made.GetProperty("id").GetInt32()}", UriKind.Relative));
        using var refused = await client.PostAsJsonAsync("/ingest/sources/orders/batches", new { rows = Array.Empty<object>() });

        revoked.StatusCode.ShouldBe(HttpStatusCode.NoContent);
        refused.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        var source = await Listed("orders");
        source.GetProperty("kind").GetString().ShouldBe("Push");
        source.GetProperty("pushedBy").ValueKind.ShouldBe(JsonValueKind.Null);
    }

    [Test]
    public async Task A_chart_reads_a_pushed_source_like_any_other()
    {
        using var client = Client(await KeyFor("Nexus"));
        await client.PutAsJsonAsync("/ingest/sources/orders", Orders);
        await Batch(client, "orders", null, "append", [[1, "10.00", "2026-11-01"], [2, "5.00", "2026-11-01"], [3, "7.00", "2026-11-02"]]);
        var id = (await Listed("orders")).GetProperty("id").GetInt32();

        var series = await _client.GetFromJsonAsync<JsonElement>($"{InDefault}/sources/{id}/series?x=day&y=amount&aggregate=sum");

        series.GetProperty("points").EnumerateArray().Select(point => point[1].GetDecimal()).ShouldBe([15m, 7m]);
    }

    private static async Task<string?> Detail(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("detail").GetString();

    private HttpClient Client(string? key)
    {
        var client = _factory.CreateClient();
        if (key is not null)
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", key);
        }

        return client;
    }

    private async Task<JsonElement> MakeKey(string name)
    {
        using var response = await _client.PostAsJsonAsync($"{InDefault}/keys", new { name });
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    private async Task<string> KeyFor(string name) => (await MakeKey(name)).GetProperty("key").GetString()!;

    private static async Task<JsonElement> Batch(HttpClient client, string source, string? id, string mode, object[][] rows)
    {
        using var response = await client.PostAsJsonAsync($"/ingest/sources/{source}/batches", new { id, mode, rows });
        response.StatusCode.ShouldBe(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    private async Task<JsonElement> Listed(string name) =>
        (await _client.GetFromJsonAsync<JsonElement>($"{InDefault}/sources")).EnumerateArray().Single(s => s.GetProperty("name").GetString() == name);

    // Each row's first two values, joined by a space.
    private async Task<List<string>> Rows(JsonElement source)
    {
        var rows = await _client.GetFromJsonAsync<JsonElement>($"{InDefault}/sources/{source.GetProperty("id").GetInt32()}/rows?offset=0&limit=25");
        return [.. rows.GetProperty("values").EnumerateArray().Select(row => $"{row[0].GetString()} {row[1].GetString()}")];
    }
}
