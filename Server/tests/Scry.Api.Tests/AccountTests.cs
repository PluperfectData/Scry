using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using NUnit.Framework;
using Scry.Api.Auth;
using Scry.Api.Storage;
using Shouldly;
using static Scry.Api.Tests.ScryApiFactory;

namespace Scry.Api.Tests;

[TestFixture]
public sealed class AccountTests
{
    private const string Rowan = "rowan@acme.test";

    private const string Admin = "admin@acme.test";

    private ScryApiFactory _factory = null!;

    [SetUp]
    public void SetUp() => _factory = new ScryApiFactory();

    [TearDown]
    public void TearDown() => _factory.Dispose();

    [Test]
    public async Task Everything_but_the_open_routes_needs_a_session()
    {
        using var stranger = _factory.NewBrowser();

        foreach (var path in new[] { $"{InDefault}/sources", $"{InDefault}/dashboards", $"{InDefault}/keys", $"{InDefault}/nexus", $"{InDefault}/connectors", "/settings", "/users" })
        {
            (await stranger.GetAsync(path)).StatusCode.ShouldBe(HttpStatusCode.Unauthorized, path);
        }

        (await stranger.GetAsync("/health")).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await stranger.GetAsync("/install")).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await stranger.GetAsync("/auth/me")).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Test]
    public async Task The_push_API_takes_its_key_and_no_session()
    {
        using var owner = _factory.SignedIn();
        using var made = await owner.PostAsync($"{InDefault}/keys", JsonBody(new { name = "Script" }));
        var key = (await made.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("key").GetString();
        using var script = _factory.CreateClient();
        script.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", key);

        using var answer = await script.GetAsync("/ingest");

        answer.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await answer.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("name").GetString().ShouldBe("Script");
    }

    [Test]
    public async Task Signs_in_with_a_password_and_says_who_is_signed_in()
    {
        await _factory.AddUserAsync(Rowan, Browser.Password, admin: true);
        using var browser = _factory.NewBrowser();
        (await browser.GetAsync<JsonElement>("/auth/me")).GetProperty("signedIn").GetBoolean().ShouldBeFalse();

        using var signedIn = await browser.SignInAsync(" Rowan@Acme.test ", Browser.Password);

        signedIn.StatusCode.ShouldBe(HttpStatusCode.OK);
        var me = await browser.GetAsync<JsonElement>("/auth/me");
        me.GetProperty("email").GetString().ShouldBe(Rowan);
        me.GetProperty("isAdmin").GetBoolean().ShouldBeTrue();
        me.GetProperty("hasPassword").GetBoolean().ShouldBeTrue();
        (await browser.GetAsync($"{InDefault}/sources")).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Test]
    public async Task Answers_a_wrong_password_and_an_unknown_address_alike()
    {
        await _factory.AddUserAsync(Rowan, Browser.Password);
        using var browser = _factory.NewBrowser();

        using var wrong = await browser.SignInAsync(Rowan, "not the password");
        using var unknown = await browser.SignInAsync("nobody@acme.test", Browser.Password);

        wrong.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        unknown.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        (await Browser.DetailAsync(wrong)).ShouldBe(await Browser.DetailAsync(unknown));
    }

    [Test]
    public async Task Locks_an_address_out_after_five_wrong_passwords()
    {
        await _factory.AddUserAsync(Rowan, Browser.Password);
        using var browser = _factory.NewBrowser();
        for (var i = 0; i < SignInThrottle.MaxFailures; i++)
        {
            (await browser.SignInAsync(Rowan, "wrong")).Dispose();
        }

        using var locked = await browser.SignInAsync(Rowan, Browser.Password);

        locked.StatusCode.ShouldBe(HttpStatusCode.TooManyRequests);
    }

    [Test]
    public async Task A_mailed_link_signs_in_once()
    {
        using var factory = ScryApiFactory.WithPostmark();
        await factory.AddUserAsync(Rowan);
        using var browser = factory.NewBrowser();

        (await browser.SendAsync(HttpMethod.Post, "/auth/link", new { email = Rowan })).StatusCode.ShouldBe(HttpStatusCode.Accepted);
        var mail = Browser.PostmarkTo(factory.Postmark, Rowan).Single();
        mail.GetProperty("Subject").GetString().ShouldBe("Your Scry sign-in link");
        (mail.GetProperty("TextBody").GetString() ?? string.Empty).ShouldContain($"{ScryApiFactory.ClientOrigin}/sign-in/link#");
        var token = Browser.LinkToken(mail);

        (await browser.SendAsync(HttpMethod.Post, "/auth/link/redeem", new { token })).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await browser.GetAsync<JsonElement>("/auth/me")).GetProperty("hasPassword").GetBoolean().ShouldBeFalse();

        using var again = await factory.NewBrowser().SendAsync(HttpMethod.Post, "/auth/link/redeem", new { token });
        again.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await Browser.DetailAsync(again)).ShouldBe("This link has expired or was already used. Ask for a new one.");
    }

    [Test]
    public async Task Mails_no_one_for_an_unknown_address_and_answers_the_same()
    {
        using var factory = ScryApiFactory.WithPostmark();
        using var browser = factory.NewBrowser();

        using var answer = await browser.SendAsync(HttpMethod.Post, "/auth/link", new { email = "nobody@acme.test" });

        answer.StatusCode.ShouldBe(HttpStatusCode.Accepted);
        Browser.PostmarkTo(factory.Postmark, "nobody@acme.test").ShouldBeEmpty();
    }

    [Test]
    public async Task Refreshing_rotates_the_token_and_a_replayed_one_ends_every_session()
    {
        using var browser = await _factory.SignedInAsync(Rowan);
        var first = RefreshCookie(browser);

        (await browser.SendAsync(HttpMethod.Post, "/auth/refresh")).StatusCode.ShouldBe(HttpStatusCode.OK);
        var second = RefreshCookie(browser);
        second.ShouldNotBe(first);

        browser.Cookies.Add(new Cookie(RefreshCookieName, first, "/auth", "localhost"));
        (await browser.SendAsync(HttpMethod.Post, "/auth/refresh")).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        browser.Cookies.Add(new Cookie(RefreshCookieName, second, "/auth", "localhost"));
        (await browser.SendAsync(HttpMethod.Post, "/auth/refresh")).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Test]
    public async Task Signing_out_ends_the_session()
    {
        using var browser = await _factory.SignedInAsync(Rowan);

        (await browser.SendAsync(HttpMethod.Post, "/auth/sign-out")).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        (await browser.GetAsync<JsonElement>("/auth/me")).GetProperty("signedIn").GetBoolean().ShouldBeFalse();
        (await browser.GetAsync($"{InDefault}/sources")).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Test]
    public async Task Refuses_an_unsafe_request_without_a_CSRF_token_or_from_another_origin()
    {
        using var browser = await _factory.SignedInAsync(Rowan);
        await _factory.JoinAsync(Rowan, WorkspaceRole.Editor);
        var dashboard = new { name = "Sales", layouts = new { }, widgets = Array.Empty<object>() };

        (await browser.SendAsync(HttpMethod.Post, $"{InDefault}/dashboards", dashboard, csrf: false)).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await browser.SendAsync(HttpMethod.Post, $"{InDefault}/dashboards", dashboard, origin: "https://evil.test")).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (await browser.SendAsync(HttpMethod.Post, $"{InDefault}/dashboards", dashboard)).StatusCode.ShouldBe(HttpStatusCode.Created);
    }

    [Test]
    public async Task Sets_a_password_of_at_least_twelve_characters()
    {
        await _factory.AddUserAsync(Rowan);
        using var browser = _factory.NewBrowser();
        var token = _factory.Services.GetRequiredService<SignInLinks>().Issue(await FindAsync(Rowan), SignInLinks.SignInLifetime);
        (await browser.SendAsync(HttpMethod.Post, "/auth/link/redeem", new { token })).EnsureSuccessStatusCode();

        using var tooShort = await browser.SendAsync(HttpMethod.Put, "/auth/password", new { password = "too short" });
        tooShort.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await browser.SendAsync(HttpMethod.Put, "/auth/password", new { password = Browser.Password })).StatusCode.ShouldBe(HttpStatusCode.OK);

        using var other = _factory.NewBrowser();
        (await other.SignInAsync(Rowan, Browser.Password)).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Test]
    public async Task The_add_admin_command_makes_an_admin_with_a_link_that_signs_them_in()
    {
        await _factory.AddUserAsync(Rowan);
        string link;
        using (var scope = _factory.Services.CreateScope())
        {
            link = (await scope.ServiceProvider.GetRequiredService<Admins>().AddAsync(Rowan, CancellationToken.None))!;
        }

        link.ShouldStartWith($"{ScryApiFactory.ClientOrigin}/sign-in/link#");
        using var browser = _factory.NewBrowser();
        (await browser.SendAsync(HttpMethod.Post, "/auth/link/redeem", new { token = link.Split('#')[1] })).EnsureSuccessStatusCode();
        (await browser.GetAsync<JsonElement>("/auth/me")).GetProperty("isAdmin").GetBoolean().ShouldBeTrue();
    }

    [Test]
    public async Task Invites_a_user_by_mail()
    {
        using var factory = ScryApiFactory.WithPostmark();
        using var admin = await factory.SignedInAsync(Admin, admin: true);

        var invited = await admin.SendAsync<JsonElement>(HttpMethod.Post, "/users", new { email = "New@Acme.test", isAdmin = false });

        invited.GetProperty("user").GetProperty("email").GetString().ShouldBe("new@acme.test");
        invited.GetProperty("user").GetProperty("hasPassword").GetBoolean().ShouldBeFalse();
        invited.GetProperty("link").ValueKind.ShouldBe(JsonValueKind.Null);
        var mail = Browser.PostmarkTo(factory.Postmark, "new@acme.test").Single();
        mail.GetProperty("Subject").GetString().ShouldBe("You're invited to Scry");
        using var newcomer = factory.NewBrowser();
        (await newcomer.SendAsync(HttpMethod.Post, "/auth/link/redeem", new { token = Browser.LinkToken(mail) })).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await admin.SendAsync(HttpMethod.Post, "/users", new { email = "new@acme.test" })).StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Test]
    public async Task Without_mail_an_invite_answers_its_link_to_pass_on()
    {
        using var factory = new ScryApiFactory(withMailpit: false);
        using var admin = await factory.SignedInAsync(Admin, admin: true);

        var invited = await admin.SendAsync<JsonElement>(HttpMethod.Post, "/users", new { email = "new@acme.test", isAdmin = false });
        var id = invited.GetProperty("user").GetProperty("id").GetInt32();
        var again = await admin.SendAsync<JsonElement>(HttpMethod.Post, $"/users/{id}/invite");

        var link = invited.GetProperty("link").GetString()!;
        link.ShouldStartWith($"{ScryApiFactory.ClientOrigin}/sign-in/link#");
        invited.GetProperty("mailProblem").ValueKind.ShouldBe(JsonValueKind.Null);
        using var newcomer = factory.NewBrowser();
        (await newcomer.SendAsync(HttpMethod.Post, "/auth/link/redeem", new { token = link.Split('#')[1] })).StatusCode.ShouldBe(HttpStatusCode.OK);
        again.GetProperty("link").GetString().ShouldStartWith($"{ScryApiFactory.ClientOrigin}/sign-in/link#");
    }

    [Test]
    public async Task Keeps_at_least_one_admin_and_never_removes_the_one_asking()
    {
        using var admin = await _factory.SignedInAsync(Admin, admin: true);
        var id = (await admin.GetAsync<JsonElement>("/auth/me")).GetProperty("id").GetInt32();
        (await admin.SendAsync(HttpMethod.Patch, $"/users/{(await FindAsync(ScryApiFactory.OwnerEmail)).Id}", new { isAdmin = false })).StatusCode.ShouldBe(HttpStatusCode.OK);

        (await admin.SendAsync(HttpMethod.Patch, $"/users/{id}", new { isAdmin = false })).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await admin.SendAsync(HttpMethod.Delete, $"/users/{id}")).StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Test]
    public async Task Only_admins_reach_the_users_and_the_instances_settings()
    {
        using var member = await _factory.SignedInAsync(Rowan);
        await _factory.JoinAsync(Rowan, WorkspaceRole.Viewer);

        (await member.GetAsync("/users")).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (await member.GetAsync("/settings")).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (await member.SendAsync(HttpMethod.Put, "/settings/mail", new { transport = "Postmark", serverToken = "t", from = "scry@acme.test" })).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (await member.GetAsync($"{InDefault}/sources")).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Test]
    public async Task Mail_goes_through_the_token_the_page_stores_and_the_token_is_never_answered()
    {
        using var factory = new ScryApiFactory(withMailpit: false);
        using var admin = await factory.SignedInAsync(Admin, admin: true);

        var off = await admin.GetAsync<JsonElement>("/settings");
        using var noLinks = await factory.NewBrowser().SendAsync(HttpMethod.Post, "/auth/link", new { email = Admin });
        using var tokenless = await admin.SendAsync(HttpMethod.Put, "/settings/mail", new { transport = "Postmark", from = "scry@acme.test" });
        var on = await admin.SendAsync<JsonElement>(
            HttpMethod.Put, "/settings/mail", new { transport = "Postmark", serverToken = FakePostmark.Token, from = "scry@acme.test", fromName = "Acme Scry" });
        var tested = await admin.SendAsync<JsonElement>(HttpMethod.Post, "/settings/mail/test");
        (await admin.SendAsync(HttpMethod.Put, "/settings/mail", new { transport = "Postmark", serverToken = "wrong-token", from = "scry@acme.test" })).EnsureSuccessStatusCode();
        using var failed = await admin.SendAsync(HttpMethod.Post, "/settings/mail/test");

        off.GetProperty("mail").GetProperty("transport").GetString().ShouldBe("None");
        noLinks.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        tokenless.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        on.GetProperty("mail").GetProperty("transport").GetString().ShouldBe("Postmark");
        on.GetProperty("mail").GetProperty("tokenSet").GetBoolean().ShouldBeTrue();
        on.ToString().ShouldNotContain(FakePostmark.Token);
        tested.GetProperty("sentTo").GetString().ShouldBe(Admin);
        var sent = factory.Postmark.Sent.Single();
        sent.GetProperty("To").GetString().ShouldBe(Admin);
        sent.GetProperty("From").GetString().ShouldBe("Acme Scry <scry@acme.test>");
        failed.StatusCode.ShouldBe(HttpStatusCode.BadGateway);
        (await Browser.DetailAsync(failed)).ShouldBe("Postmark refused the message with error 10: The Server Token you provided was invalid.");
        File.ReadAllText(Path.Combine(factory.DataDirectory, InstanceFile.FileName)).ShouldNotContain("wrong-token");
    }

    [Test]
    public async Task Keeps_the_session_signing_key_it_made_encrypted_in_the_instances_file()
    {
        using var browser = await _factory.SignedInAsync(Rowan);

        var stored = File.ReadAllText(Path.Combine(_factory.DataDirectory, InstanceFile.FileName));

        stored.ShouldContain("\"signingKey\"");
        stored.ShouldNotContain(_factory.NewInstanceFile().SigningKey);
    }

    private const string RefreshCookieName = "scry_rt";

    private static StringContent JsonBody(object body) => new(JsonSerializer.Serialize(body), System.Text.Encoding.UTF8, "application/json");

    private async Task<User> FindAsync(string email)
    {
        await using var db = _factory.NewContext();
        return await db.Users.SingleAsync(u => u.Email == email);
    }

    private static string RefreshCookie(Browser browser) =>
        browser.Cookies.GetCookies(new Uri("http://localhost/auth/refresh"))[RefreshCookieName]?.Value
        ?? throw new InvalidOperationException("No refresh cookie.");

    [Test]
    public async Task A_configured_Mailpit_is_used_until_the_page_chooses_and_each_choice_keeps_its_settings()
    {
        using var factory = new ScryApiFactory();
        using var admin = await factory.SignedInAsync(Admin, admin: true);

        var first = await admin.GetAsync<JsonElement>("/settings");
        var tested = await admin.SendAsync<JsonElement>(HttpMethod.Post, "/settings/mail/test");
        var postmark = await admin.SendAsync<JsonElement>(HttpMethod.Put, "/settings/mail", new { transport = "Postmark", serverToken = FakePostmark.Token, from = "scry@acme.test" });
        var off = await admin.SendAsync<JsonElement>(HttpMethod.Delete, "/settings/mail");
        var mailpit = await admin.SendAsync<JsonElement>(HttpMethod.Put, "/settings/mail", new { transport = "Mailpit" });
        var postmarkAgain = await admin.SendAsync<JsonElement>(HttpMethod.Put, "/settings/mail", new { transport = "Postmark", from = "scry@acme.test" });

        first.GetProperty("mail").GetProperty("transport").GetString().ShouldBe("Mailpit");
        first.GetProperty("mail").GetProperty("choice").ValueKind.ShouldBe(JsonValueKind.Null);
        first.GetProperty("mail").GetProperty("mailpitConfigured").GetBoolean().ShouldBeTrue();
        tested.GetProperty("inbox").GetString().ShouldBe(FakeMailpit.Address);
        var sent = Browser.MailpitTo(factory.Mailpit, Admin).Single();
        sent.GetProperty("From").GetProperty("Email").GetString().ShouldBe("scry@localhost");
        sent.GetProperty("From").GetProperty("Name").GetString().ShouldBe("Scry");
        postmark.GetProperty("mail").GetProperty("transport").GetString().ShouldBe("Postmark");
        off.GetProperty("mail").GetProperty("transport").GetString().ShouldBe("None");
        off.GetProperty("mail").GetProperty("choice").GetString().ShouldBe("Off");
        mailpit.GetProperty("mail").GetProperty("transport").GetString().ShouldBe("Mailpit");
        postmarkAgain.GetProperty("mail").GetProperty("transport").GetString().ShouldBe("Postmark");
        postmarkAgain.GetProperty("mail").GetProperty("tokenSet").GetBoolean().ShouldBeTrue();
        await using var db = factory.NewContext();
        (await db.LogEntries.OrderBy(e => e.Id).Select(e => e.Text).Where(t => t.StartsWith("Mail ")).ToListAsync()).ShouldBe(
        [
            "Mail was set to go through Postmark, from Scry at scry@acme.test, with a new server token.",
            "Mail was turned off.",
            $"Mail was set to go to Mailpit at {FakeMailpit.Address}.",
            "Mail was set to go through Postmark, from Scry at scry@acme.test.",
        ]);
    }

    [Test]
    public async Task The_page_names_a_Mailpit_where_configuration_names_none()
    {
        using var factory = new ScryApiFactory(withMailpit: false);
        using var admin = await factory.SignedInAsync(Admin, admin: true);

        using var unchosen = await admin.SendAsync(HttpMethod.Put, "/settings/mail", new { mailpitUrl = FakeMailpit.Address });
        using var nowhere = await admin.SendAsync(HttpMethod.Put, "/settings/mail", new { transport = "Mailpit", mailpitUrl = "mailpit.test:8025" });
        var chosen = await admin.SendAsync<JsonElement>(HttpMethod.Put, "/settings/mail", new { transport = "Mailpit", mailpitUrl = FakeMailpit.Address + "/" });
        using var asked = await factory.NewBrowser().SendAsync(HttpMethod.Post, "/auth/link", new { email = Admin });

        (await Browser.DetailAsync(unchosen)).ShouldBe("Choose how mail goes: through Postmark, or to Mailpit.");
        (await Browser.DetailAsync(nowhere)).ShouldBe("Enter Mailpit's address, such as http://localhost:8025.");
        chosen.GetProperty("mail").GetProperty("transport").GetString().ShouldBe("Mailpit");
        chosen.GetProperty("mail").GetProperty("mailpitUrl").GetString().ShouldBe(FakeMailpit.Address);
        chosen.GetProperty("mail").GetProperty("mailpitConfigured").GetBoolean().ShouldBeFalse();
        asked.StatusCode.ShouldBe(HttpStatusCode.Accepted);
        Browser.LinkToken(Browser.MailpitTo(factory.Mailpit, Admin).Single()).ShouldNotBeEmpty();
    }

    [Test]
    public async Task A_Postmark_token_and_sender_in_configuration_fix_the_transport()
    {
        using var factory = new ScryApiFactory();
        await factory.AddUserAsync(Admin, Browser.Password, admin: true);
        using var configured = factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("Mail:ServerToken", FakePostmark.Token);
            builder.UseSetting("Scry:MailFrom", "ops@acme.test");
        });
        var cookies = new CookieContainer();
        using var admin = new Browser(configured.CreateDefaultClient(new Uri("http://localhost/"), new Microsoft.AspNetCore.Mvc.Testing.Handlers.CookieContainerHandler(cookies)), cookies);
        (await admin.SignInAsync(Admin, Browser.Password)).EnsureSuccessStatusCode();

        var view = await admin.GetAsync<JsonElement>("/settings");
        using var toMailpit = await admin.SendAsync(HttpMethod.Put, "/settings/mail", new { transport = "Mailpit" });
        using var off = await admin.SendAsync(HttpMethod.Delete, "/settings/mail");

        view.GetProperty("mail").GetProperty("transport").GetString().ShouldBe("Postmark");
        view.GetProperty("mail").GetProperty("transportConfigured").GetBoolean().ShouldBeTrue();
        toMailpit.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        off.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await Browser.DetailAsync(off)).ShouldBe("Mail goes through Postmark, as Scry's configuration sets it, in Mail:ServerToken and Scry:MailFrom.");
    }

    [Test]
    public async Task Mailpit_works_outside_Development_too()
    {
        using var factory = new ScryApiFactory();
        using var production = factory.WithWebHostBuilder(builder => builder.UseEnvironment("Production"));
        using var client = production.CreateClient();

        var view = await client.GetFromJsonAsync<JsonElement>("/install");

        view.GetProperty("mail").GetBoolean().ShouldBeTrue();
    }
}
