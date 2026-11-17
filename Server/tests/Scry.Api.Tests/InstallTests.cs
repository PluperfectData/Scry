using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using NUnit.Framework;
using Shouldly;

namespace Scry.Api.Tests;

[TestFixture]
public sealed partial class InstallTests
{
    private static readonly object Database = new { host = "db.example.test", port = 3307, name = "scry_live", user = "scry", password = "database-password" };

    private static readonly object Addresses = new { clientOrigin = ScryApiFactory.ClientOrigin, apiOrigin = ScryApiFactory.ApiOrigin };

    [Test]
    public async Task An_instance_with_nothing_set_answers_only_the_installer_and_the_health_check()
    {
        using var factory = new ScryApiFactory(installed: false);
        using var client = factory.CreateClient();

        using var sources = await client.GetAsync(new Uri("/sources", UriKind.Relative));
        var view = await GetAsync(client);

        sources.StatusCode.ShouldBe(HttpStatusCode.ServiceUnavailable);
        (await DetailAsync(sources)).ShouldBe("Scry is not set up yet. Open /install on its client to set it up.");
        (await client.GetAsync(new Uri("/health", UriKind.Relative))).StatusCode.ShouldBe(HttpStatusCode.OK);
        view.GetProperty("installed").GetBoolean().ShouldBeFalse();
        view.GetProperty("stage").GetString().ShouldBe("Database");
        view.GetProperty("local").GetBoolean().ShouldBeFalse();
        view.GetProperty("allowed").GetBoolean().ShouldBeFalse();
        factory.Logs.Lines.Single(l => l.Contains("install code", StringComparison.Ordinal)).ShouldContain("/install on the Scry client");
    }

    [Test]
    public async Task A_page_on_another_machine_needs_the_code_from_the_log()
    {
        using var factory = new ScryApiFactory(installed: false);
        using var client = factory.CreateClient();
        var code = CodeFromLog(factory);

        using var bare = await PostAsync(client, "/install/database", Database);
        using var wrong = await PostAsync(client, "/install/database", Database, code: "AAAA-BBBB-CCCC");
        using var right = await PostAsync(client, "/install/database", Database, code: code.ToLowerInvariant());

        bare.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        (await DetailAsync(bare)).ShouldBe("This page is not on the machine Scry runs on, so it needs the install code from Scry's log.");
        wrong.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        right.StatusCode.ShouldBe(HttpStatusCode.OK, await right.Content.ReadAsStringAsync());
        (await right.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("stage").GetString().ShouldBe("Address");
        factory.Database.Prepared.Single().ShouldContain("Server=db.example.test");
    }

    [Test]
    public async Task Five_wrong_codes_lock_the_installer()
    {
        using var factory = new ScryApiFactory(installed: false);
        using var client = factory.CreateClient();
        var code = CodeFromLog(factory);

        for (var i = 0; i < InstallAccess.MaxFailures; i++)
        {
            using var wrong = await PostAsync(client, "/install/database", Database, code: "AAAA-BBBB-CCCC");
            wrong.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        }

        using var right = await PostAsync(client, "/install/database", Database, code: code);

        right.StatusCode.ShouldBe(HttpStatusCode.TooManyRequests);
        factory.Database.Prepared.ShouldBeEmpty();
    }

    [Test]
    public async Task A_page_on_this_machine_needs_no_code_unless_it_is_another_site_or_comes_through_a_proxy()
    {
        using var factory = new ScryApiFactory(installed: false);
        using var client = factory.CreateClient();

        using var otherSite = await PostAsync(client, "/install/database", Database, local: true, origin: "https://elsewhere.example");
        using var proxied = await PostAsync(client, "/install/database", Database, local: true, forwarded: true);
        var view = await GetAsync(client, local: true);
        using var local = await PostAsync(client, "/install/database", Database, local: true);

        otherSite.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        proxied.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        view.GetProperty("local").GetBoolean().ShouldBeTrue();
        view.GetProperty("allowed").GetBoolean().ShouldBeTrue();
        local.StatusCode.ShouldBe(HttpStatusCode.OK, await local.Content.ReadAsStringAsync());
    }

    [Test]
    public async Task Keeps_a_database_only_once_it_opens_and_encrypts_its_password()
    {
        using var factory = new ScryApiFactory(installed: false);
        using var client = factory.CreateClient();
        factory.Database.Refusal = "Access denied for user 'scry'@'localhost' (using password: YES)";

        using var refused = await PostAsync(client, "/install/database", Database, local: true);
        var storedAfterRefusal = factory.NewInstanceFile().DatabasePlace;
        factory.Database.Refusal = null;
        using var kept = await PostAsync(client, "/install/database", Database, local: true);

        refused.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await DetailAsync(refused)).ShouldBe("Access denied for user 'scry'@'localhost' (using password: YES)");
        storedAfterRefusal.ShouldBeNull();
        kept.StatusCode.ShouldBe(HttpStatusCode.OK);
        factory.NewInstanceFile().Database.ShouldBe(new DatabaseSettings("db.example.test", 3307, "scry_live", "scry", "database-password"));
        (await File.ReadAllTextAsync(Path.Combine(factory.DataDirectory, InstanceFile.FileName))).ShouldNotContain("database-password");
    }

    [Test]
    public async Task Sets_up_in_three_stages_signs_the_first_admin_in_then_spends_the_code_and_allows_only_the_client()
    {
        using var factory = new ScryApiFactory(installed: false);
        using var browser = factory.NewBrowser();
        var client = browser.Client;
        var code = CodeFromLog(factory);

        using var early = await PostAsync(client, "/install/addresses", Addresses, code: code);
        (await PostAsync(client, "/install/database", Database, code: code)).EnsureSuccessStatusCode();
        using var earlyAdmin = await PostAsync(client, "/install/admin", new { email = "founder@acme.test", password = Browser.Password }, code: code);
        using var badClient = await PostAsync(client, "/install/addresses", new { clientOrigin = "http://localhost:6160/install", apiOrigin = ScryApiFactory.ApiOrigin }, code: code);
        using var badApi = await PostAsync(client, "/install/addresses", new { clientOrigin = ScryApiFactory.ClientOrigin, apiOrigin = "ftp://localhost:6161" }, code: code);
        using var addressed = await PostAsync(client, "/install/addresses", Addresses, code: code);
        using var weak = await PostAsync(client, "/install/admin", new { email = "founder@acme.test", password = "short" }, code: code);
        using var made = await PostAsync(client, "/install/admin", new { email = "Founder@Acme.test", password = Browser.Password }, code: code);

        early.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        earlyAdmin.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await DetailAsync(badClient)).ShouldBe("Enter the client's address, such as https://scry.example.com, with nothing after its host.");
        (await DetailAsync(badApi)).ShouldBe("Enter the API's address, such as https://api.scry.example.com, with nothing after its host.");
        var afterAddresses = await addressed.Content.ReadFromJsonAsync<JsonElement>();
        afterAddresses.GetProperty("installed").GetBoolean().ShouldBeFalse();
        afterAddresses.GetProperty("stage").GetString().ShouldBe("Admin");
        (await DetailAsync(weak)).ShouldBe("A password needs at least 12 characters.");
        made.StatusCode.ShouldBe(HttpStatusCode.OK, await made.Content.ReadAsStringAsync());
        var me = await browser.GetAsync<JsonElement>("/auth/me");
        me.GetProperty("email").GetString().ShouldBe("founder@acme.test");
        me.GetProperty("isAdmin").GetBoolean().ShouldBeTrue();
        (await GetAsync(client)).GetProperty("installed").GetBoolean().ShouldBeTrue();
        (await GetAsync(client, code: code)).GetProperty("allowed").GetBoolean().ShouldBeFalse();
        var stored = factory.NewInstanceFile();
        (stored.ClientOrigin, stored.ApiOrigin).ShouldBe((ScryApiFactory.ClientOrigin, ScryApiFactory.ApiOrigin));

        using var fromClient = await GetWithOriginAsync(client, "/sources", ScryApiFactory.ClientOrigin);
        using var fromElsewhere = await GetWithOriginAsync(client, "/sources", "https://elsewhere.example");
        fromClient.StatusCode.ShouldBe(HttpStatusCode.OK);
        fromClient.Headers.GetValues("Access-Control-Allow-Origin").ShouldBe([ScryApiFactory.ClientOrigin]);
        fromClient.Headers.GetValues("Access-Control-Allow-Credentials").ShouldBe(["true"]);
        fromElsewhere.Headers.Contains("Access-Control-Allow-Origin").ShouldBeFalse();
    }

    [Test]
    public async Task A_database_that_already_has_an_admin_skips_the_admin_stage()
    {
        using var factory = new ScryApiFactory(installed: false);
        using var client = factory.CreateClient();
        (await PostAsync(client, "/install/database", Database, local: true)).EnsureSuccessStatusCode();
        await factory.AddUserAsync("ops@acme.test", Browser.Password, admin: true);

        using var addressed = await PostAsync(client, "/install/addresses", Addresses, local: true);

        (await addressed.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("installed").GetBoolean().ShouldBeTrue();
    }

    [Test]
    public async Task Someone_locked_out_asks_for_a_code_and_makes_an_admin_with_it()
    {
        const string NewPassword = "a brand new password";
        using var factory = new ScryApiFactory();
        using var browser = factory.NewBrowser();

        using var bare = await PostAsync(browser.Client, "/install/admin", new { email = ScryApiFactory.OwnerEmail, password = NewPassword });
        (await browser.Client.PostAsync(new Uri("/install/code", UriKind.Relative), null)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var line = factory.Logs.Lines.Single(l => l.Contains("install code", StringComparison.Ordinal));
        using var made = await PostAsync(
            browser.Client, "/install/admin", new { email = ScryApiFactory.OwnerEmail, password = NewPassword }, code: CodePattern().Match(line).Value);

        bare.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        line.ShouldContain("to make an admin or change Scry's addresses");
        made.StatusCode.ShouldBe(HttpStatusCode.OK, await made.Content.ReadAsStringAsync());
        (await browser.GetAsync<JsonElement>("/auth/me")).GetProperty("email").GetString().ShouldBe(ScryApiFactory.OwnerEmail);
        using var other = factory.NewBrowser();
        (await other.SignInAsync(ScryApiFactory.OwnerEmail, ScryApiFactory.OwnerPassword)).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        (await other.SignInAsync(ScryApiFactory.OwnerEmail, NewPassword)).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Test]
    public async Task An_instance_set_up_changes_its_addresses_with_a_code_written_on_request()
    {
        using var factory = new ScryApiFactory();
        using var client = factory.CreateClient();
        var moved = new { clientOrigin = "https://scry.example.test", apiOrigin = "https://api.scry.example.test" };

        using var bare = await PostAsync(client, "/install/addresses", moved);
        (await client.PostAsync(new Uri("/install/code", UriKind.Relative), null)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var line = factory.Logs.Lines.Single(l => l.Contains("install code", StringComparison.Ordinal));
        using var database = await PostAsync(client, "/install/database", Database, code: CodePattern().Match(line).Value);
        using var changed = await PostAsync(client, "/install/addresses", moved, code: CodePattern().Match(line).Value);

        bare.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        line.ShouldContain("to make an admin or change Scry's addresses");
        line.ShouldContain($"{ScryApiFactory.ClientOrigin}/install#");
        database.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await DetailAsync(database)).ShouldBe("The database is set up. Change it on the Settings page.");
        changed.StatusCode.ShouldBe(HttpStatusCode.OK, await changed.Content.ReadAsStringAsync());
        factory.Services.GetRequiredService<Instance>().ClientOrigin.ShouldBe("https://scry.example.test");
    }

    [Test]
    public async Task A_start_whose_database_does_not_open_asks_for_it_again()
    {
        using var factory = new ScryApiFactory();
        factory.Database.Refusal = "Unable to connect to any of the specified MySQL hosts.";
        using var client = factory.CreateClient();

        using var sources = await client.GetAsync(new Uri("/sources", UriKind.Relative));
        var view = await GetAsync(client, local: true);
        factory.Database.Refusal = null;
        using var reopened = await PostAsync(client, "/install/database", new { host = "db.scry.test", port = 3306, name = "scry", user = "scry", password = "stored-password" }, local: true);

        sources.StatusCode.ShouldBe(HttpStatusCode.ServiceUnavailable);
        view.GetProperty("stage").GetString().ShouldBe("Database");
        view.GetProperty("databaseProblem").GetString().ShouldBe("Unable to connect to any of the specified MySQL hosts.");
        view.GetProperty("database").GetProperty("host").GetString().ShouldBe("db.scry.test");
        view.GetRawText().ShouldNotContain("stored-password");
        (await reopened.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("installed").GetBoolean().ShouldBeTrue();
    }

    [Test]
    public async Task Configuration_wins_over_what_the_pages_store()
    {
        using var factory = new ScryApiFactory();
        using var configured = factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("ConnectionStrings:Scry", "Server=configured.test;Database=scry;User ID=ops");
            builder.UseSetting("Scry:ClientOrigin", "http://localhost:7000");
        });
        using var client = configured.CreateClient();

        using var database = await PostAsync(client, "/install/database", Database, local: true);
        using var otherClient = await PostAsync(client, "/install/addresses", new { clientOrigin = "http://localhost:7001", apiOrigin = ScryApiFactory.ApiOrigin }, local: true);
        using var apiOnly = await PostAsync(client, "/install/addresses", new { clientOrigin = "", apiOrigin = "http://localhost:7002" }, local: true);
        var view = await GetAsync(client, local: true);

        database.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await DetailAsync(database)).ShouldBe("The database is set by Scry's configuration, in ConnectionStrings:Scry.");
        otherClient.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        apiOnly.StatusCode.ShouldBe(HttpStatusCode.OK, await apiOnly.Content.ReadAsStringAsync());
        view.GetProperty("databaseConfigured").GetBoolean().ShouldBeTrue();
        view.GetProperty("database").GetProperty("host").GetString().ShouldBe("configured.test");
        view.GetProperty("clientOriginConfigured").GetBoolean().ShouldBeTrue();
        view.GetProperty("clientOrigin").GetString().ShouldBe("http://localhost:7000");
        view.GetProperty("apiOrigin").GetString().ShouldBe("http://localhost:7002");
        factory.NewInstanceFile().ClientOrigin.ShouldBe(ScryApiFactory.ClientOrigin);
        factory.Database.Prepared.ShouldContain("Server=configured.test;Database=scry;User ID=ops");
    }

    [Test]
    public async Task The_installers_mail_needs_its_access_and_closes_once_the_instance_is_set_up()
    {
        using var factory = new ScryApiFactory(installed: false, mailToFiles: false);
        using var browser = factory.NewBrowser();
        var client = browser.Client;
        (await PostAsync(client, "/install/database", Database, local: true)).EnsureSuccessStatusCode();
        (await PostAsync(client, "/install/addresses", Addresses, local: true)).EnsureSuccessStatusCode();
        var mail = new { serverToken = FakePostmark.Token, from = "scry@acme.test", fromName = "Acme Scry" };

        using var bare = await SendAsync(client, HttpMethod.Put, "/install/mail", mail);
        using var saved = await SendAsync(client, HttpMethod.Put, "/install/mail", mail, local: true);
        using var nowhere = await SendAsync(client, HttpMethod.Post, "/install/mail/test", new { to = "" }, local: true);
        using var tested = await SendAsync(client, HttpMethod.Post, "/install/mail/test", new { to = "founder@acme.test" }, local: true);
        using var made = await PostAsync(client, "/install/admin", new { email = "founder@acme.test", password = "" }, local: true);
        using var closed = await SendAsync(client, HttpMethod.Put, "/install/mail", mail, local: true);

        bare.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        saved.StatusCode.ShouldBe(HttpStatusCode.OK, await saved.Content.ReadAsStringAsync());
        var view = await saved.Content.ReadFromJsonAsync<JsonElement>();
        view.GetProperty("mail").GetBoolean().ShouldBeTrue();
        view.GetProperty("mailSettings").GetProperty("transport").GetString().ShouldBe("Postmark");
        view.ToString().ShouldNotContain(FakePostmark.Token);
        nowhere.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        tested.StatusCode.ShouldBe(HttpStatusCode.OK, await tested.Content.ReadAsStringAsync());
        factory.Postmark.Sent.Single().GetProperty("To").GetString().ShouldBe("founder@acme.test");
        made.StatusCode.ShouldBe(HttpStatusCode.OK, await made.Content.ReadAsStringAsync());
        (await made.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("hasPassword").GetBoolean().ShouldBeFalse();
        closed.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await DetailAsync(closed)).ShouldBe("Scry is set up. An admin changes its mail on the Settings page.");
    }

    [Test]
    public async Task The_first_admin_needs_a_password_while_mail_is_off()
    {
        using var factory = new ScryApiFactory(installed: false, mailToFiles: false);
        using var browser = factory.NewBrowser();
        var client = browser.Client;
        (await PostAsync(client, "/install/database", Database, local: true)).EnsureSuccessStatusCode();
        (await PostAsync(client, "/install/addresses", Addresses, local: true)).EnsureSuccessStatusCode();

        using var passwordless = await PostAsync(client, "/install/admin", new { email = "founder@acme.test", password = "" }, local: true);
        using var made = await PostAsync(client, "/install/admin", new { email = "founder@acme.test", password = Browser.Password }, local: true);

        passwordless.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await DetailAsync(passwordless)).ShouldBe("Set up mail, or choose a password. Without either, there is no way to sign in again.");
        made.StatusCode.ShouldBe(HttpStatusCode.OK, await made.Content.ReadAsStringAsync());
    }

    [Test]
    public async Task With_mail_written_to_files_the_first_admin_needs_no_password_and_signs_in_by_link()
    {
        using var factory = new ScryApiFactory(installed: false);
        using var browser = factory.NewBrowser();
        var client = browser.Client;
        (await PostAsync(client, "/install/database", Database, local: true)).EnsureSuccessStatusCode();
        (await PostAsync(client, "/install/addresses", Addresses, local: true)).EnsureSuccessStatusCode();
        var view = await GetAsync(client, local: true);

        using var made = await PostAsync(client, "/install/admin", new { email = "founder@acme.test", password = "" }, local: true);
        using var later = factory.NewBrowser();
        (await later.SendAsync(HttpMethod.Post, "/auth/link", new { email = "founder@acme.test" })).StatusCode.ShouldBe(HttpStatusCode.Accepted);
        var link = Browser.MailTo(factory.MailDirectory, "founder@acme.test").Single();
        using var redeemed = await later.SendAsync(HttpMethod.Post, "/auth/link/redeem", new { token = Browser.LinkToken(link) });

        view.GetProperty("mail").GetBoolean().ShouldBeTrue();
        view.GetProperty("mailSettings").GetProperty("transport").GetString().ShouldBe("Files");
        made.StatusCode.ShouldBe(HttpStatusCode.OK, await made.Content.ReadAsStringAsync());
        (await browser.GetAsync<JsonElement>("/auth/me")).GetProperty("isAdmin").GetBoolean().ShouldBeTrue();
        redeemed.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await later.GetAsync<JsonElement>("/auth/me")).GetProperty("email").GetString().ShouldBe("founder@acme.test");
    }

    [Test]
    public async Task Make_an_admin_with_no_password_keeps_the_users_own()
    {
        using var factory = new ScryApiFactory();
        await factory.AddUserAsync("rowan@acme.test", Browser.Password);
        using var browser = factory.NewBrowser();

        using var made = await PostAsync(browser.Client, "/install/admin", new { email = "rowan@acme.test", password = "" }, local: true);

        made.StatusCode.ShouldBe(HttpStatusCode.OK, await made.Content.ReadAsStringAsync());
        (await made.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("hasPassword").GetBoolean().ShouldBeTrue();
        using var other = factory.NewBrowser();
        (await other.SignInAsync("rowan@acme.test", Browser.Password)).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await other.GetAsync<JsonElement>("/auth/me")).GetProperty("isAdmin").GetBoolean().ShouldBeTrue();
    }

    private static string CodeFromLog(ScryApiFactory factory) =>
        CodePattern().Match(factory.Logs.Lines.Single(l => l.Contains("install code", StringComparison.Ordinal))).Value;

    internal static async Task<string?> DetailAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("detail").GetString();

    private static async Task<JsonElement> GetAsync(HttpClient client, bool local = false, string? code = null)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/install");
        Mark(request, local, code, ScryApiFactory.ClientOrigin, forwarded: false);
        using var response = await client.SendAsync(request);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    private static async Task<HttpResponseMessage> GetWithOriginAsync(HttpClient client, string path, string origin)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add("Origin", origin);
        return await client.SendAsync(request);
    }

    private static async Task<HttpResponseMessage> PostAsync(
        HttpClient client, string path, object body, string? code = null, bool local = false, string origin = ScryApiFactory.ClientOrigin, bool forwarded = false)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
        Mark(request, local, code, origin, forwarded);
        return await client.SendAsync(request);
    }

    private static async Task<HttpResponseMessage> SendAsync(HttpClient client, HttpMethod method, string path, object? body = null, string? code = null, bool local = false)
    {
        using var request = new HttpRequestMessage(method, path) { Content = body is null ? null : JsonContent.Create(body) };
        Mark(request, local, code, ScryApiFactory.ClientOrigin, forwarded: false);
        return await client.SendAsync(request);
    }

    private static void Mark(HttpRequestMessage request, bool local, string? code, string origin, bool forwarded)
    {
        request.Headers.Add("Origin", origin);
        if (code is not null)
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", InstallCode.Lead + code);
        }

        if (local)
        {
            request.Headers.Add(ScryApiFactory.LocalHeader, "1");
        }

        if (forwarded)
        {
            request.Headers.Add("X-Forwarded-For", "203.0.113.9");
        }
    }

    [GeneratedRegex("[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}")]
    private static partial Regex CodePattern();
}
