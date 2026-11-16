using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using NUnit.Framework;
using Shouldly;

namespace Scry.Api.Tests;

[TestFixture]
public sealed class NexusTests
{
    private const string Settings = "http://localhost:6160/settings";

    private ScryApiFactory _factory = null!;
    private HttpClient _client = null!;

    [SetUp]
    public void SetUp()
    {
        _factory = new ScryApiFactory();
        _client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
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
        opened.GetProperty("appName").GetString().ShouldBe("Scry at localhost:6161");
        opened.GetProperty("ingestUrl").GetString().ShouldBe("http://localhost:6161/ingest");
        opened.GetProperty("callbackUrl").GetString().ShouldBe("http://localhost:6161/nexus/callback");
        opened.GetProperty("connectReturnUrl").GetString().ShouldBe("http://localhost:6160/sources");

        using var back = await _client.GetAsync($"/nexus/callback?pairing={FakeNexus.PairingId}");

        back.StatusCode.ShouldBe(HttpStatusCode.Redirect);
        back.Headers.Location!.OriginalString.ShouldBe($"{Settings}?linked=1");
        var link = await _client.GetFromJsonAsync<JsonElement>("/nexus");
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
        using var declined = await _client.GetAsync("/nexus/callback?error=declined");
        declined.Headers.Location!.OriginalString.ShouldBe($"{Settings}?error={Uri.EscapeDataString("Nexus's admin declined linking Scry.")}");

        using var unknown = await _client.GetAsync("/nexus/callback?pairing=never-opened");
        unknown.Headers.Location!.OriginalString.ShouldBe($"{Settings}?error={Uri.EscapeDataString("This pairing has expired. Link Nexus again.")}");
        (await _client.GetFromJsonAsync<JsonElement>("/nexus")).GetProperty("linked").GetBoolean().ShouldBeFalse();
    }

    [Test]
    public async Task A_claim_Nexus_refuses_revokes_the_push_key_it_was_given()
    {
        await PairAsync();
        _factory.Nexus.FailClaim = "The push API refused the key.";

        using var back = await _client.GetAsync($"/nexus/callback?pairing={FakeNexus.PairingId}");

        back.Headers.Location!.OriginalString.ShouldBe($"{Settings}?error={Uri.EscapeDataString("The push API refused the key.")}");
        (await _client.GetFromJsonAsync<JsonElement>("/keys")).GetArrayLength().ShouldBe(0);
    }

    [Test]
    public async Task Unlinking_revokes_both_keys_and_forgets_the_link()
    {
        await PairAsync();
        (await _client.GetAsync($"/nexus/callback?pairing={FakeNexus.PairingId}")).Dispose();
        (await _client.PostAsJsonAsync("/nexus/pairing", new { nexusUrl = FakeNexus.Url })).StatusCode.ShouldBe(HttpStatusCode.Conflict);

        (await _client.DeleteAsync("/nexus")).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        _factory.Nexus.Requests.ShouldContain(r => r.Line == "DELETE /app/key" && r.Authorization == $"Bearer {FakeNexus.AppKey}");
        (await _client.GetFromJsonAsync<JsonElement>("/keys")).GetArrayLength().ShouldBe(0);
        (await _client.GetFromJsonAsync<JsonElement>("/nexus")).GetProperty("linked").GetBoolean().ShouldBeFalse();
    }

    [Test]
    public async Task Refuses_an_address_that_is_not_one()
    {
        using var refused = await _client.PostAsJsonAsync("/nexus/pairing", new { nexusUrl = "nexus" });

        refused.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    private async Task<JsonElement> PairAsync()
    {
        using var started = await _client.PostAsJsonAsync("/nexus/pairing", new { nexusUrl = FakeNexus.Url + "/" });
        started.StatusCode.ShouldBe(HttpStatusCode.OK);
        return await started.Content.ReadFromJsonAsync<JsonElement>();
    }
}
