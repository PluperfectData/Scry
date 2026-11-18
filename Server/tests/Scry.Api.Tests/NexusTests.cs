using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using NUnit.Framework;
using Scry.Api.Storage;
using Shouldly;
using static Scry.Api.Tests.ScryApiFactory;

namespace Scry.Api.Tests;

[TestFixture]
public sealed class NexusTests
{
    private const string Settings = "http://localhost:6160/workspaces/1/settings";

    private const string Viewer = "viewer@scry.test";

    private static readonly string[] OneAccount = ["…1234"];

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
    public async Task Pairing_trades_a_push_key_for_an_app_key_and_keeps_the_link()
    {
        var started = await PairAsync();
        started.GetProperty("approveUrl").GetString().ShouldBe($"{FakeNexus.Url}/pair?id={FakeNexus.PairingId}");
        var opened = _factory.Nexus.Opened!.Value;
        opened.GetProperty("appName").GetString().ShouldBe("Scry at localhost:6161, workspace Default");
        opened.GetProperty("ingestUrl").GetString().ShouldBe("http://localhost:6161/ingest");
        opened.GetProperty("callbackUrl").GetString().ShouldBe("http://localhost:6161/workspaces/1/nexus/callback");
        opened.GetProperty("connectReturnUrl").GetString().ShouldBe("http://localhost:6160/workspaces/1/sources");

        using var back = await _client.GetAsync($"{InDefault}/nexus/callback?pairing={FakeNexus.PairingId}");

        back.StatusCode.ShouldBe(HttpStatusCode.Redirect);
        back.Headers.Location!.OriginalString.ShouldBe($"{Settings}?linked=1");
        var link = await _client.GetFromJsonAsync<JsonElement>($"{InDefault}/nexus");
        link.GetProperty("linked").GetBoolean().ShouldBeTrue();
        link.GetProperty("nexusUrl").GetString().ShouldBe(FakeNexus.Url);
        link.GetProperty("workspaceName").GetString().ShouldBe("Acme");

        // The push key Nexus got is one Scry made, named for that Nexus instance.
        var pushKey = _factory.Nexus.Claimed!.Value.GetProperty("pushKey").GetString()!;
        using var asNexus = _factory.CreateClient();
        asNexus.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", pushKey);
        (await asNexus.GetFromJsonAsync<JsonElement>("/ingest")).GetProperty("name").GetString().ShouldBe("Nexus at nexus.test");
        link.GetProperty("pushKeyName").GetString().ShouldBe("Nexus at nexus.test");
        link.GetProperty("pushKeyPrefix").GetString().ShouldBe(pushKey[..12]);
    }

    [Test]
    public async Task A_decline_or_an_unknown_pairing_goes_back_to_settings_with_the_reason()
    {
        using var declined = await _client.GetAsync($"{InDefault}/nexus/callback?error=declined");
        declined.Headers.Location!.OriginalString.ShouldBe($"{Settings}?error={Uri.EscapeDataString("Nexus's admin declined linking Scry.")}");

        using var unknown = await _client.GetAsync($"{InDefault}/nexus/callback?pairing=never-opened");
        unknown.Headers.Location!.OriginalString.ShouldBe($"{Settings}?error={Uri.EscapeDataString("This pairing has expired. Link Nexus again.")}");
        (await _client.GetFromJsonAsync<JsonElement>($"{InDefault}/nexus")).GetProperty("linked").GetBoolean().ShouldBeFalse();
    }

    [Test]
    public async Task A_claim_Nexus_refuses_revokes_the_push_key_it_was_given()
    {
        await PairAsync();
        _factory.Nexus.FailClaim = "The push API refused the key.";

        using var back = await _client.GetAsync($"{InDefault}/nexus/callback?pairing={FakeNexus.PairingId}");

        back.Headers.Location!.OriginalString.ShouldBe($"{Settings}?error={Uri.EscapeDataString("The push API refused the key.")}");
        (await _client.GetFromJsonAsync<JsonElement>($"{InDefault}/keys")).GetArrayLength().ShouldBe(0);
    }

    [Test]
    public async Task Unlinking_revokes_both_keys_and_forgets_the_link()
    {
        await PairAsync();
        (await _client.GetAsync($"{InDefault}/nexus/callback?pairing={FakeNexus.PairingId}")).Dispose();
        (await _client.PostAsJsonAsync($"{InDefault}/nexus/pairing", new { nexusUrl = FakeNexus.Url })).StatusCode.ShouldBe(HttpStatusCode.Conflict);

        (await _client.DeleteAsync($"{InDefault}/nexus")).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        _factory.Nexus.Requests.ShouldContain(r => r.Line == "DELETE /app/key" && r.Authorization == $"Bearer {FakeNexus.AppKey}");
        (await _client.GetFromJsonAsync<JsonElement>($"{InDefault}/keys")).GetArrayLength().ShouldBe(0);
        (await _client.GetFromJsonAsync<JsonElement>($"{InDefault}/nexus")).GetProperty("linked").GetBoolean().ShouldBeFalse();
    }

    [Test]
    public async Task Refuses_an_address_that_is_not_one()
    {
        using var refused = await _client.PostAsJsonAsync($"{InDefault}/nexus/pairing", new { nexusUrl = "nexus" });

        refused.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Test]
    public async Task Lists_Nexus_connectors_and_opens_a_connect_page_into_the_links_destination()
    {
        await LinkAsync();

        var connectors = await _client.GetFromJsonAsync<JsonElement>($"{InDefault}/nexus/connectors");
        using var opened = await _client.PostAsJsonAsync($"{InDefault}/nexus/connect", new { connector = "mysql" });

        connectors.EnumerateArray().Select(c => c.GetProperty("name").GetString()).ShouldBe(["MySQL", "Charles Schwab"]);
        connectors[0].GetProperty("notReady").ValueKind.ShouldBe(JsonValueKind.Null);
        connectors[1].GetProperty("notReady").GetString().ShouldBe(FakeNexus.NotReady);
        opened.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await opened.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("url").GetString().ShouldBe($"{FakeNexus.Url}/connect#nxc_the-token");
        var session = _factory.Nexus.Requests.Single(r => r.Line == "POST /connect-sessions");
        session.Authorization.ShouldBe($"Bearer {FakeNexus.AppKey}");
        session.Body!.Value.GetProperty("connector").GetString().ShouldBe("mysql");
        session.Body.Value.GetProperty("destinationId").GetInt32().ShouldBe(7);
        session.Body.Value.GetProperty("returnUrl").GetString().ShouldBe("http://localhost:6160/workspaces/1/sources");
    }

    [Test]
    public async Task Lists_the_syncs_into_the_links_destination_and_runs_one()
    {
        await LinkAsync();

        var syncs = await _client.GetFromJsonAsync<JsonElement>($"{InDefault}/nexus/syncs");
        using var ran = await _client.PostAsync(new Uri($"{InDefault}/nexus/syncs/11/run", UriKind.Relative), null);
        using var refused = await _client.PostAsync(new Uri($"{InDefault}/nexus/syncs/99/run", UriKind.Relative), null);

        syncs.EnumerateArray().Select(s => s.GetProperty("table").GetString()).ShouldBe(["shop_orders"]);
        syncs[0].GetProperty("connectionName").GetString().ShouldBe("Shop");
        syncs[0].GetProperty("lastRun").GetProperty("rows").GetInt64().ShouldBe(1200);
        (await ran.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("status").GetString().ShouldBe("Queued");
        refused.StatusCode.ShouldBe(HttpStatusCode.BadGateway);
        (await refused.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("detail").GetString().ShouldBe("Nexus answered 404.");
    }

    [Test]
    public async Task Refuses_the_Nexus_routes_while_unlinked()
    {
        using var refused = await _client.GetAsync(new Uri($"{InDefault}/nexus/connectors", UriKind.Relative));

        refused.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        _factory.Nexus.Requests.ShouldBeEmpty();
    }

    [Test]
    public async Task A_source_pushed_with_the_links_key_is_a_Nexus_source()
    {
        await LinkAsync();
        var columns = new object[] { new { name = "id", type = "Int64" } };
        using var asNexus = _factory.CreateClient();
        asNexus.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _factory.Nexus.Claimed!.Value.GetProperty("pushKey").GetString());
        (await asNexus.PutAsJsonAsync("/ingest/sources/shop_orders", new { columns })).StatusCode.ShouldBe(HttpStatusCode.OK);
        using var made = await _client.PostAsJsonAsync($"{InDefault}/keys", new { name = "Script" });
        using var asScript = _factory.CreateClient();
        asScript.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", (await made.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("key").GetString());
        (await asScript.PutAsJsonAsync("/ingest/sources/events", new { columns })).StatusCode.ShouldBe(HttpStatusCode.OK);

        var sources = await _client.GetFromJsonAsync<JsonElement>($"{InDefault}/sources");

        sources.EnumerateArray().Select(s => $"{s.GetProperty("name").GetString()} {s.GetProperty("kind").GetString()}").ShouldBe(["events Push", "shop_orders Nexus"]);
    }

    [Test]
    public async Task A_Nexus_source_carries_its_connections_sign_in_for_a_viewer_too()
    {
        await LinkAsync();
        await PushAsNexusAsync();
        var ended = DateTime.UtcNow.AddHours(-1);
        _factory.Nexus.SignIn = new
        {
            kind = "FixedClock",
            signedInAt = ended.AddDays(-7),
            endsAt = ended,
            endingSoon = false,
            ended = true,
            endedAt = ended,
            keptAliveAt = (DateTime?)null,
            accounts = OneAccount,
        };
        using var viewer = await _factory.SignedInAsync(Viewer);
        await _factory.JoinAsync(Viewer, WorkspaceRole.Viewer);

        var editorView = (await _client.GetFromJsonAsync<JsonElement>($"{InDefault}/sources")).EnumerateArray().Single();
        var viewerView = (await viewer.GetAsync<JsonElement>($"{InDefault}/sources")).EnumerateArray().Single();

        var signIn = editorView.GetProperty("signIn");
        signIn.GetProperty("provider").GetString().ShouldBe("MySQL");
        signIn.GetProperty("kind").GetString().ShouldBe("FixedClock");
        signIn.GetProperty("ended").GetBoolean().ShouldBeTrue();
        signIn.GetProperty("endedAt").GetDateTime().ShouldBe(ended, TimeSpan.FromSeconds(1));
        signIn.GetProperty("accounts").EnumerateArray().Select(a => a.GetString()).ShouldBe(["…1234"]);
        viewerView.GetProperty("signIn").GetProperty("ended").GetBoolean().ShouldBeTrue();
    }

    [Test]
    public async Task Keeps_Nexus_sign_ins_for_a_minute_and_asks_nothing_for_sources_Nexus_does_not_fill()
    {
        await LinkAsync();
        using (var unfilled = await _client.GetAsync(new Uri($"{InDefault}/sources", UriKind.Relative)))
        {
            unfilled.EnsureSuccessStatusCode();
        }

        await PushAsNexusAsync();
        (await _client.GetFromJsonAsync<JsonElement>($"{InDefault}/sources")).EnumerateArray().Single().GetProperty("signIn").ValueKind.ShouldBe(JsonValueKind.Null);
        await _client.GetFromJsonAsync<JsonElement>($"{InDefault}/sources");

        _factory.Nexus.Requests.Count(r => r.Line == "GET /syncs").ShouldBe(1);
    }

    [Test]
    public async Task Lists_sources_without_their_sign_ins_while_Nexus_does_not_answer()
    {
        await LinkAsync();
        await PushAsNexusAsync();
        _factory.Nexus.Down = true;

        var sources = await _client.GetFromJsonAsync<JsonElement>($"{InDefault}/sources");

        sources.EnumerateArray().Single().GetProperty("signIn").ValueKind.ShouldBe(JsonValueKind.Null);
    }

    [Test]
    public async Task Opens_Nexus_connect_page_to_sign_a_connection_in_again_for_editors_alone()
    {
        await LinkAsync();
        using var viewer = await _factory.SignedInAsync(Viewer);
        await _factory.JoinAsync(Viewer, WorkspaceRole.Viewer);

        using var opened = await _client.PostAsync(new Uri($"{InDefault}/nexus/connections/4/sign-in", UriKind.Relative), null);
        using var refused = await viewer.SendAsync(HttpMethod.Post, $"{InDefault}/nexus/connections/4/sign-in");

        opened.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await opened.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("url").GetString().ShouldBe($"{FakeNexus.Url}/connect#nxc_the-token");
        var session = _factory.Nexus.Requests.Single(r => r.Line == "POST /connect-sessions").Body!.Value;
        session.GetProperty("connectionId").GetInt32().ShouldBe(4);
        session.GetProperty("destinationId").GetInt32().ShouldBe(7);
        session.GetProperty("returnUrl").GetString().ShouldBe("http://localhost:6160/workspaces/1/sources");
        refused.StatusCode.ShouldBe(HttpStatusCode.Forbidden);
    }

    // Makes shop_orders as Nexus does, with the push key the link made.
    private async Task PushAsNexusAsync()
    {
        using var asNexus = _factory.CreateClient();
        asNexus.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _factory.Nexus.Claimed!.Value.GetProperty("pushKey").GetString());
        (await asNexus.PutAsJsonAsync("/ingest/sources/shop_orders", new { columns = new object[] { new { name = "id", type = "Int64" } } })).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    private async Task LinkAsync()
    {
        await PairAsync();
        using var back = await _client.GetAsync($"{InDefault}/nexus/callback?pairing={FakeNexus.PairingId}");
        back.Headers.Location!.OriginalString.ShouldBe($"{Settings}?linked=1");
    }

    private async Task<JsonElement> PairAsync()
    {
        using var started = await _client.PostAsJsonAsync($"{InDefault}/nexus/pairing", new { nexusUrl = FakeNexus.Url + "/" });
        started.StatusCode.ShouldBe(HttpStatusCode.OK);
        return await started.Content.ReadFromJsonAsync<JsonElement>();
    }
}
