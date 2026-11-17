using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using NUnit.Framework;
using Shouldly;

namespace Scry.Api.Tests;

[TestFixture]
public sealed class SettingsTests
{
    [Test]
    public async Task Shows_the_addresses_and_database_and_moves_CORS_with_the_client_address()
    {
        using var factory = new ScryApiFactory();
        using var client = factory.SignedIn();

        var before = await client.GetFromJsonAsync<JsonElement>("/settings");
        using var refused = await client.PutAsJsonAsync("/settings/addresses", new { clientOrigin = "scry.example.test", apiOrigin = ScryApiFactory.ApiOrigin });
        using var saved = await client.PutAsJsonAsync("/settings/addresses", new { clientOrigin = "https://scry.example.test/", apiOrigin = "https://api.scry.example.test" });
        using var fromNew = await GetWithOriginAsync(client, "https://scry.example.test");
        using var fromOld = await GetWithOriginAsync(client, ScryApiFactory.ClientOrigin);

        before.GetProperty("clientOrigin").GetString().ShouldBe(ScryApiFactory.ClientOrigin);
        before.GetProperty("apiOrigin").GetString().ShouldBe(ScryApiFactory.ApiOrigin);
        before.GetProperty("database").GetProperty("host").GetString().ShouldBe("db.scry.test");
        before.GetRawText().ShouldNotContain("stored-password");
        refused.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var view = await saved.Content.ReadFromJsonAsync<JsonElement>();
        view.GetProperty("clientOrigin").GetString().ShouldBe("https://scry.example.test");
        view.GetProperty("apiOrigin").GetString().ShouldBe("https://api.scry.example.test");
        fromNew.Headers.GetValues("Access-Control-Allow-Origin").ShouldBe(["https://scry.example.test"]);
        fromOld.Headers.Contains("Access-Control-Allow-Origin").ShouldBeFalse();
    }

    [Test]
    public async Task Keeps_a_new_database_only_once_it_opens_and_a_blank_password_keeps_the_stored_one()
    {
        using var factory = new ScryApiFactory();
        using var client = factory.SignedIn();
        factory.Database.Refusal = "Unknown MySQL server host 'db.moved.test'";

        using var refused = await client.PutAsJsonAsync("/settings/database", new { host = "db.moved.test", port = 3306, name = "scry", user = "scry", password = "new-password" });
        var afterRefusal = factory.NewInstanceFile().Database;
        factory.Database.Refusal = null;
        using var samePlace = await client.PutAsJsonAsync("/settings/database", new { host = "db.scry.test", port = 3306, name = "scry", user = "scry", password = "" });
        var afterSamePlace = factory.NewInstanceFile().Database;
        using var moved = await client.PutAsJsonAsync("/settings/database", new { host = "db.moved.test", port = 3306, name = "scry", user = "scry", password = "new-password" });

        refused.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await InstallTests.DetailAsync(refused)).ShouldBe("Unknown MySQL server host 'db.moved.test'");
        afterRefusal.ShouldBe(ScryApiFactory.StoredDatabase);
        samePlace.StatusCode.ShouldBe(HttpStatusCode.OK);
        afterSamePlace.ShouldBe(ScryApiFactory.StoredDatabase);
        moved.StatusCode.ShouldBe(HttpStatusCode.OK);
        factory.NewInstanceFile().Database.ShouldBe(new DatabaseSettings("db.moved.test", 3306, "scry", "scry", "new-password"));
        (await client.GetAsync(new Uri("/sources", UriKind.Relative))).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Test]
    public async Task A_value_set_by_configuration_is_shown_and_cannot_be_changed()
    {
        using var factory = new ScryApiFactory();
        using var configured = factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("ConnectionStrings:Scry", "Server=configured.test;Database=scry;User ID=ops");
            builder.UseSetting("Scry:ApiOrigin", "https://api.configured.test");
        });
        using var client = configured.SignedIn();

        var view = await client.GetFromJsonAsync<JsonElement>("/settings");
        using var database = await client.PutAsJsonAsync("/settings/database", new { host = "db.moved.test", port = 3306, name = "scry", user = "scry", password = "p" });
        using var api = await client.PutAsJsonAsync("/settings/addresses", new { clientOrigin = ScryApiFactory.ClientOrigin, apiOrigin = "https://api.other.test" });

        view.GetProperty("databaseConfigured").GetBoolean().ShouldBeTrue();
        view.GetProperty("database").GetProperty("host").GetString().ShouldBe("configured.test");
        view.GetProperty("apiOriginConfigured").GetBoolean().ShouldBeTrue();
        view.GetProperty("apiOrigin").GetString().ShouldBe("https://api.configured.test");
        database.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        api.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await InstallTests.DetailAsync(api)).ShouldBe("The API's address is set by Scry's configuration, in Scry:ApiOrigin.");
    }

    private static async Task<HttpResponseMessage> GetWithOriginAsync(HttpClient client, string origin)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/settings");
        request.Headers.Add("Origin", origin);
        return await client.SendAsync(request);
    }
}
