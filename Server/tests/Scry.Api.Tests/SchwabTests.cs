using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Web;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using NUnit.Framework;
using Scry.Api.Storage;
using Shouldly;

namespace Scry.Api.Tests;

[TestFixture]
public sealed class SchwabTests
{
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
    public async Task Lists_Schwab_with_its_settings_but_not_the_one_that_allows_orders()
    {
        var schwab = (await _client.GetFromJsonAsync<JsonElement>("/connectors")).EnumerateArray().Last();

        schwab.GetProperty("id").GetString().ShouldBe("schwab");
        schwab.GetProperty("needs").EnumerateArray().ShouldBeEmpty();
        var fields = schwab.GetProperty("fields").EnumerateArray().Select(field => field.GetProperty("name").GetString()).ToList();
        fields.ShouldContain("startDate");
        fields.ShouldNotContain("allowOrders");
    }

    [Test]
    public async Task Says_which_settings_Scry_needs_before_it_can_sign_in()
    {
        using var unset = _factory.WithWebHostBuilder(builder => builder.UseSetting("Schwab:AppSecret", ""));
        using var client = unset.SignedIn();

        var schwab = (await client.GetFromJsonAsync<JsonElement>("/connectors")).EnumerateArray().Last();
        using var signIn = await client.PostAsJsonAsync("/schwab/sign-in", Request(("balances", "schwab_balances")));

        schwab.GetProperty("needs").EnumerateArray().Select(need => need.GetString()).ShouldBe(["Schwab:AppSecret"]);
        signIn.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await signIn.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("detail").GetString()
            .ShouldBe("Set Schwab:AppSecret in Scry's settings before signing in to Schwab.");
    }

    [Test]
    public async Task Lists_every_stream_without_a_sign_in()
    {
        var streams = await _client.GetFromJsonAsync<JsonElement>("/schwab/streams");

        streams.EnumerateArray().Select(stream => stream.GetProperty("name").GetString())
            .ShouldBe(["balances", "positions", "transactions", "orders", "price_history", "quotes", "movers"]);
    }

    [Test]
    public async Task Signs_in_then_copies_the_picked_streams_in_the_background()
    {
        var url = await StartSignIn(("balances", "schwab_balances"));

        var query = HttpUtility.ParseQueryString(url.Query);
        (query["client_id"], query["redirect_uri"]).ShouldBe(("app-key", "https://127.0.0.1:6162/schwab/callback"));

        using var back = await _client.GetAsync(new Uri($"/schwab/callback?code=the-code&state={query["state"]}", UriKind.Relative));

        back.StatusCode.ShouldBe(HttpStatusCode.Redirect);
        back.Headers.Location.ShouldBe(new Uri("http://localhost:6160/sources"));
        HttpUtility.ParseQueryString(_factory.Schwab.Requests[0].Body!)["code"].ShouldBe("the-code");

        var source = await Settled("schwab_balances");
        source.GetProperty("status").GetString().ShouldBe("Ready");
        source.GetProperty("connector").GetString().ShouldBe("schwab");
        source.GetProperty("rowCount").GetInt64().ShouldBe(1);
        source.GetProperty("columns").EnumerateArray().Select(c => c.GetProperty("name").GetString()).ShouldContain("liquidation_value");

        using var scope = _factory.Services.CreateScope();
        var connection = await scope.ServiceProvider.GetRequiredService<ScryDbContext>().Connections.SingleAsync();
        connection.Tokens.ShouldNotBeNull().ShouldNotContain("access-token");
    }

    [Test]
    public async Task Each_sync_adds_a_snapshot_to_the_last()
    {
        var url = await StartSignIn(("balances", "schwab_balances"));
        using var back = await _client.GetAsync(new Uri($"/schwab/callback?code=c&state={State(url)}", UriKind.Relative));
        var id = (await Settled("schwab_balances")).GetProperty("id").GetInt32();
        await Task.Delay(10);

        using var synced = await _client.PostAsync(new Uri($"/sources/{id}/sync", UriKind.Relative), null);

        synced.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await synced.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("rowCount").GetInt64().ShouldBe(2);
    }

    [TestCase("code=x&state=nope", "This sign-in ran out of time, or did not start in Scry. Sign in again.")]
    [TestCase("error=access_denied", "Schwab did not sign you in: access_denied.")]
    public async Task A_failed_sign_in_goes_back_to_Sources_saying_why(string callback, string message)
    {
        var url = await StartSignIn(("balances", "schwab_balances"));
        var sent = callback.Contains("state=", StringComparison.Ordinal) ? callback : $"{callback}&state={State(url)}";

        using var back = await _client.GetAsync(new Uri($"/schwab/callback?{sent}", UriKind.Relative));

        back.Headers.Location!.GetLeftPart(UriPartial.Path).ShouldBe("http://localhost:6160/sources");
        HttpUtility.ParseQueryString(back.Headers.Location.Query)["error"].ShouldBe(message);
        (await _client.GetFromJsonAsync<JsonElement>("/sources")).EnumerateArray().ShouldBeEmpty();
    }

    [Test]
    public async Task Asks_for_a_new_sign_in_once_Schwab_ends_one_then_syncs_again_after_it()
    {
        var url = await StartSignIn(("balances", "schwab_balances"));
        using var back = await _client.GetAsync(new Uri($"/schwab/callback?code=c&state={State(url)}", UriKind.Relative));
        var id = (await Settled("schwab_balances")).GetProperty("id").GetInt32();
        _factory.Schwab.AccountsReply = (HttpStatusCode.Unauthorized, "{}");
        _factory.Schwab.TokenReply = (HttpStatusCode.BadRequest, """{"error":"invalid_grant"}""");

        using var refused = await _client.PostAsync(new Uri($"/sources/{id}/sync", UriKind.Relative), null);
        var stale = await _client.GetFromJsonAsync<JsonElement>($"/sources/{id}");

        refused.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        stale.GetProperty("status").GetString().ShouldBe("SignInNeeded");
        stale.GetProperty("error").GetString().ShouldBe("Schwab ended the sign-in, which it does every 7 days. Sign in to Schwab again.");

        _factory.Schwab.AccountsReply = (HttpStatusCode.OK, FakeSchwabApi.OneAccount);
        _factory.Schwab.TokenReply = (HttpStatusCode.OK, FakeSchwabApi.Tokens);
        using var again = await _client.PostAsync(new Uri($"/sources/{id}/sign-in", UriKind.Relative), null);
        var againUrl = (await again.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("url").GetString()!;
        using var returned = await _client.GetAsync(new Uri($"/schwab/callback?code=c2&state={State(new Uri(againUrl))}", UriKind.Relative));

        var renewed = await Settled("schwab_balances");
        renewed.GetProperty("status").GetString().ShouldBe("Ready");
        renewed.GetProperty("error").ValueKind.ShouldBe(JsonValueKind.Null);
    }

    [TestCase("balances", "Bad Name!", HttpStatusCode.BadRequest)]
    [TestCase("options", "schwab_options", HttpStatusCode.BadRequest)]
    public async Task Refuses_a_bad_name_or_a_stream_Schwab_lacks_before_signing_in(string stream, string name, HttpStatusCode status)
    {
        using var response = await _client.PostAsJsonAsync("/schwab/sign-in", Request((stream, name)));

        response.StatusCode.ShouldBe(status);
    }

    private static object Request(params (string Table, string Name)[] streams) => new
    {
        settings = new Dictionary<string, string?> { ["startDate"] = "2026-01-01", ["allowOrders"] = "true" },
        streams = streams.Select(s => new { table = s.Table, name = s.Name }),
    };

    private static string State(Uri url) => HttpUtility.ParseQueryString(url.Query)["state"]!;

    private async Task<Uri> StartSignIn(params (string Table, string Name)[] streams)
    {
        using var response = await _client.PostAsJsonAsync("/schwab/sign-in", Request(streams));
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        return new Uri((await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("url").GetString()!);
    }

    // The background worker syncs on its own time, so this waits for the source to stop syncing.
    private async Task<JsonElement> Settled(string name)
    {
        for (var attempt = 0; attempt < 100; attempt++)
        {
            var source = (await _client.GetFromJsonAsync<JsonElement>("/sources")).EnumerateArray()
                .Single(s => s.GetProperty("name").GetString() == name);
            if (source.GetProperty("status").GetString() != "Syncing")
            {
                return source;
            }

            await Task.Delay(100);
        }

        throw new TimeoutException($"{name} was still syncing after 10 seconds.");
    }
}
