using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Web;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using NUnit.Framework;
using Scry.Api.Storage;
using Shouldly;
using static Scry.Api.Tests.ScryApiFactory;

namespace Scry.Api.Tests;

[TestFixture]
public sealed class OperatorLogTests
{
    private const string Orders = "day,amount\n2026-01-01,10\n2026-01-02,7\n";

    private const string Editor = "editor@acme.test";

    private const string Viewer = "viewer@acme.test";

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
    public async Task Each_change_writes_an_entry_naming_what_it_changed_and_who_changed_it()
    {
        using var workspace = await _client.PostAsJsonAsync("/workspaces", new { name = "Finance" });
        var finance = (await workspace.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        (await _client.PatchAsJsonAsync($"/workspaces/{finance}", new { name = "Finance 2026" })).EnsureSuccessStatusCode();
        var rowan = await _factory.AddUserAsync("rowan@acme.test");
        (await _client.PutAsJsonAsync($"/workspaces/{finance}/members/{rowan.Id}", new { role = "Viewer" })).EnsureSuccessStatusCode();
        var dashboard = await DashboardAsync("Sales");
        (await _client.PatchAsJsonAsync($"{InDefault}/dashboards/{dashboard}", new { name = "Sales 2026", isLanding = true })).EnsureSuccessStatusCode();
        var source = await UploadAsync("orders");
        using var key = await _client.PostAsJsonAsync($"{InDefault}/keys", new { name = "Script" });
        var made = await key.Content.ReadFromJsonAsync<JsonElement>();
        var prefix = made.GetProperty("prefix").GetString();
        (await _client.DeleteAsync($"{InDefault}/keys/{made.GetProperty("id").GetInt32()}")).EnsureSuccessStatusCode();
        (await _client.DeleteAsync($"{InDefault}/sources/{source}")).EnsureSuccessStatusCode();
        (await _client.DeleteAsync($"{InDefault}/dashboards/{dashboard}")).EnsureSuccessStatusCode();
        (await _client.PostAsJsonAsync("/users", new { email = "sam@acme.test", isAdmin = false })).EnsureSuccessStatusCode();
        (await _client.PutAsJsonAsync("/settings/log", new { days = 14 })).EnsureSuccessStatusCode();

        var entries = await EntriesAsync();

        entries.Select(e => e.Text).ShouldBe(
        [
            "Workspace Finance was made.",
            "Workspace Finance was renamed Finance 2026.",
            "rowan@acme.test was added to workspace Finance 2026 as a viewer.",
            "Dashboard Sales was made.",
            "Dashboard Sales was renamed Sales 2026.",
            "Dashboard Sales 2026 is now the workspace's landing page.",
            "Source orders was uploaded from orders.csv, with 2 rows and 2 columns.",
            $"Push key Script was made, starting {prefix}.",
            $"Push key Script, starting {prefix}, was revoked. The sources it made stay, and no key writes to them.",
            "Source orders was removed, with its table and its uploaded file.",
            "Dashboard Sales 2026 was removed.",
            "sam@acme.test was invited.",
            "The log now keeps entries for 14 days.",
        ]);
        entries.ShouldAllBe(e => e.Actor == OwnerEmail);
        entries.Where(e => e.Text.StartsWith("Workspace Finance", StringComparison.Ordinal)).ShouldAllBe(e => e.WorkspaceId == finance);
        entries.Single(e => e.Text.StartsWith("sam@", StringComparison.Ordinal)).WorkspaceId.ShouldBeNull();
        entries.Single(e => e.Text.StartsWith("Source orders was uploaded", StringComparison.Ordinal)).SourceId.ShouldBeNull();
    }

    [Test]
    public async Task A_change_that_is_refused_leaves_no_entry()
    {
        (await _client.PostAsJsonAsync($"{InDefault}/dashboards", new { name = "" })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await _client.PostAsJsonAsync($"{InDefault}/keys", new { name = "" })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        (await EntriesAsync()).ShouldBeEmpty();
    }

    [Test]
    public async Task A_dashboard_save_writes_its_chart_changes_and_nothing_for_a_move()
    {
        var dashboard = await DashboardAsync("Sales");
        var byDay = new { id = "w1", kind = "bar", title = "Sum of amount by day", name = (string?)null, x = "day" };

        await SaveAsync(dashboard, new { lg = new[] { new { i = "w1", x = 0, y = 0, w = 4, h = 4 } } }, byDay);
        await SaveAsync(dashboard, new { lg = new[] { new { i = "w1", x = 4, y = 2, w = 6, h = 4 } } }, byDay);
        await SaveAsync(dashboard, new { }, byDay with { x = "amount" });
        await SaveAsync(dashboard, new { });

        (await EntriesAsync()).Select(e => e.Text).ShouldBe(
        [
            "Dashboard Sales was made.",
            "Chart Sum of amount by day was added to dashboard Sales.",
            "Chart Sum of amount by day on dashboard Sales was edited.",
            "Chart Sum of amount by day was removed from dashboard Sales.",
        ]);
    }

    [Test]
    public async Task The_push_API_writes_its_sources_and_commits_but_not_its_batches()
    {
        using var script = await KeyClientAsync("Script");
        using var other = await KeyClientAsync("Other");
        var columns = new[] { new { name = "day", type = "String" } };

        (await script.PutAsJsonAsync("/ingest/sources/events", new { columns, origin = "a cron job" })).EnsureSuccessStatusCode();
        (await script.PostAsJsonAsync("/ingest/sources/events/batches", new { mode = "append", rows = new[] { new object[] { "monday" } } })).EnsureSuccessStatusCode();
        (await script.PostAsync(new Uri("/ingest/sources/events/commit", UriKind.Relative), null)).EnsureSuccessStatusCode();
        (await other.PostAsJsonAsync("/ingest/sources/events/batches", new { mode = "append", rows = Array.Empty<object[]>() })).StatusCode.ShouldBe(HttpStatusCode.Forbidden);

        var entries = (await EntriesAsync()).Where(e => e.Actor?.StartsWith("key ", StringComparison.Ordinal) == true).ToList();

        entries.Select(e => (e.Level, e.Text, e.Actor)).ShouldBe(
        [
            (EntryLevel.Information, "Source events was made through the push API, with 1 column, from a cron job.", "key Script"),
            (EntryLevel.Information, "A commit to source events left it holding 1 row, from a cron job.", "key Script"),
            (EntryLevel.Warning, "Push key Other was refused writing to source events, which another key made.", "key Other"),
        ]);
        entries.ShouldAllBe(e => e.WorkspaceId == 1 && e.SourceId != null);
    }

    [Test]
    public async Task A_Schwab_sync_writes_how_it_went_and_who_signed_in()
    {
        using var started = await _client.PostAsJsonAsync($"{InDefault}/schwab/sign-in", new
        {
            settings = new Dictionary<string, string?> { ["startDate"] = "2026-01-01" },
            streams = new[] { new { table = "balances", name = "schwab_balances" } },
        });
        var url = new Uri((await started.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("url").GetString()!);
        using var back = await _client.GetAsync(new Uri($"/schwab/callback?code=c&state={HttpUtility.ParseQueryString(url.Query)["state"]}", UriKind.Relative));
        var id = await SettledAsync();
        _factory.Schwab.AccountsReply = (HttpStatusCode.Unauthorized, "{}");
        _factory.Schwab.TokenReply = (HttpStatusCode.BadRequest, """{"error":"invalid_grant"}""");
        (await _client.PostAsync(new Uri($"{InDefault}/sources/{id}/sync", UriKind.Relative), null)).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        var entries = await EntriesAsync();

        entries[0].ShouldSatisfyAllConditions(
            e => e.Text.ShouldBe("Signing in to Schwab added schwab_balances, each syncing in the background."),
            e => e.Actor.ShouldBe(OwnerEmail));
        entries[1].ShouldSatisfyAllConditions(
            e => e.Text.ShouldStartWith("Source schwab_balances synced from "),
            e => e.Text.ShouldEndWith(", and holds 1 row."),
            e => e.Actor.ShouldBeNull(),
            e => e.SourceId.ShouldBe(id));
        entries[2].ShouldSatisfyAllConditions(
            e => e.Level.ShouldBe(EntryLevel.Warning),
            e => e.Text.ShouldStartWith("Source schwab_balances needs a new sign-in before it syncs again: Schwab ended the sign-in"),
            e => e.Actor.ShouldBe(OwnerEmail));
    }

    [Test]
    public async Task The_developer_log_gets_each_saved_entry_and_no_entry_carries_the_install_code()
    {
        await DashboardAsync("Sales");

        _factory.Logs.Written.ShouldContain(line => line.Category == "Scry.Operator" && line.Line == $"Dashboard Sales was made. ({OwnerEmail})");
        (await EntriesAsync()).ShouldAllBe(e => !e.Text.Contains("install code", StringComparison.OrdinalIgnoreCase));
    }

    [Test]
    public async Task An_admin_reads_everything_an_editor_their_workspaces_and_a_viewer_nothing()
    {
        await DashboardAsync("Sales");
        (await _client.PostAsJsonAsync("/users", new { email = "sam@acme.test", isAdmin = false })).EnsureSuccessStatusCode();
        await _factory.AddUserAsync(Editor, Browser.Password);
        await _factory.JoinAsync(Editor, WorkspaceRole.Editor);
        await _factory.AddUserAsync(Viewer, Browser.Password);
        await _factory.JoinAsync(Viewer, WorkspaceRole.Viewer);
        using var editor = _factory.SignedIn(Editor, Browser.Password);
        using var viewer = _factory.SignedIn(Viewer, Browser.Password);

        (await TextsAsync(_client, "/log")).ShouldBe(["sam@acme.test was invited.", "Dashboard Sales was made."]);
        (await TextsAsync(_client, "/log?instance=true")).ShouldBe(["sam@acme.test was invited."]);
        (await TextsAsync(editor, "/log")).ShouldBe(["Dashboard Sales was made."]);
        (await TextsAsync(editor, "/log?workspace=1")).ShouldBe(["Dashboard Sales was made."]);
        (await editor.GetAsync("/log?instance=true")).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await TextsAsync(viewer, "/log")).ShouldBeEmpty();
        (await viewer.GetAsync("/log?workspace=1")).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Test]
    public async Task Filters_by_source_and_by_level_and_reads_a_hundred_at_a_time()
    {
        var source = await UploadAsync("orders");
        await using (var db = _factory.NewContext())
        {
            var at = DateTime.UtcNow;
            db.LogEntries.AddRange(Enumerable.Range(1, 100).Select(i => new LogEntry { At = at, Level = EntryLevel.Information, Text = $"Entry {i}.", WorkspaceId = 1 }));
            db.LogEntries.Add(new LogEntry { At = at, Level = EntryLevel.Warning, Text = "Something to look at.", WorkspaceId = 1 });
            await db.SaveChangesAsync();
        }

        var first = await _client.GetFromJsonAsync<JsonElement>("/log");
        var older = await _client.GetFromJsonAsync<JsonElement>($"/log?before={first.GetProperty("next").GetInt64()}");
        var bySource = await _client.GetFromJsonAsync<JsonElement>($"/log?source={source}");

        first.GetProperty("entries").GetArrayLength().ShouldBe(100);
        older.GetProperty("entries").EnumerateArray().Select(e => e.GetProperty("text").GetString()).ShouldBe(["Entry 1.", "Source orders was uploaded from orders.csv, with 2 rows and 2 columns."]);
        older.GetProperty("next").ValueKind.ShouldBe(JsonValueKind.Null);
        (await TextsAsync(_client, "/log?level=Warning")).ShouldBe(["Something to look at."]);
        bySource.GetProperty("subject").GetString().ShouldBe("Source orders");
        bySource.GetProperty("entries").EnumerateArray().Select(e => e.GetProperty("text").GetString()).ShouldBe(["Source orders was uploaded from orders.csv, with 2 rows and 2 columns."]);
    }

    [Test]
    public async Task Pruning_removes_what_is_older_than_the_days_kept()
    {
        await using (var db = _factory.NewContext())
        {
            db.LogEntries.Add(new LogEntry { At = DateTime.UtcNow.AddDays(-31), Level = EntryLevel.Information, Text = "Old." });
            db.LogEntries.Add(new LogEntry { At = DateTime.UtcNow.AddDays(-29), Level = EntryLevel.Information, Text = "Recent." });
            await db.SaveChangesAsync();
        }

        using var scope = _factory.Services.CreateScope();
        var removed = await scope.ServiceProvider.GetRequiredService<LogPruning>().PruneAsync(CancellationToken.None);

        removed.ShouldBe(1);
        (await EntriesAsync()).Select(e => e.Text).ShouldBe(["Recent."]);
    }

    [Test]
    public async Task The_days_kept_are_changed_on_the_Settings_page_unless_configuration_sets_them()
    {
        (await _client.PutAsJsonAsync("/settings/log", new { days = 400 })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var changed = await (await _client.PutAsJsonAsync("/settings/log", new { days = 7 })).Content.ReadFromJsonAsync<JsonElement>();
        changed.GetProperty("logDays").GetInt32().ShouldBe(7);

        using var configured = _factory.WithWebHostBuilder(builder => builder.UseSetting("Scry:LogDays", "60"));
        using var client = configured.SignedIn();
        var settings = await client.GetFromJsonAsync<JsonElement>("/settings");
        settings.GetProperty("logDays").GetInt32().ShouldBe(60);
        settings.GetProperty("logDaysConfigured").GetBoolean().ShouldBeTrue();
        (await client.PutAsJsonAsync("/settings/log", new { days = 5 })).StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Test]
    public async Task Removing_a_workspace_keeps_its_entries_for_admins()
    {
        using var made = await _client.PostAsJsonAsync("/workspaces", new { name = "Finance" });
        var finance = (await made.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        (await _client.SendAsync(new HttpRequestMessage(HttpMethod.Delete, $"/workspaces/{finance}") { Content = JsonContent.Create(new { name = "Finance" }) })).EnsureSuccessStatusCode();

        (await TextsAsync(_client, "/log?instance=true")).ShouldBe(
        [
            "Workspace Finance was removed, with its dashboards, sources, push keys, Nexus link, and files.",
            "Workspace Finance was made.",
        ]);
    }

    private async Task<List<LogEntry>> EntriesAsync()
    {
        await using var db = _factory.NewContext();
        return await db.LogEntries.AsNoTracking().OrderBy(e => e.Id).ToListAsync();
    }

    private static async Task<List<string>> TextsAsync(HttpClient client, string path) =>
        [.. (await client.GetFromJsonAsync<JsonElement>(path)).GetProperty("entries").EnumerateArray().Select(e => e.GetProperty("text").GetString()!)];

    private async Task<int> DashboardAsync(string name)
    {
        using var created = await _client.PostAsJsonAsync($"{InDefault}/dashboards", new { name });
        created.StatusCode.ShouldBe(HttpStatusCode.Created);
        return (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
    }

    private async Task SaveAsync(int dashboard, object layouts, params object[] widgets) =>
        (await _client.PutAsJsonAsync($"{InDefault}/dashboards/{dashboard}", new { name = "Sales", layouts, widgets })).EnsureSuccessStatusCode();

    private async Task<int> UploadAsync(string name)
    {
        using var content = new MultipartFormDataContent();
        content.Add(new StringContent(name), "name");
        var file = new ByteArrayContent(Encoding.UTF8.GetBytes(Orders));
        file.Headers.ContentType = new MediaTypeHeaderValue("text/csv");
        content.Add(file, "file", $"{name}.csv");
        using var response = await _client.PostAsync(new Uri($"{InDefault}/sources", UriKind.Relative), content);
        response.StatusCode.ShouldBe(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
    }

    private async Task<HttpClient> KeyClientAsync(string name)
    {
        using var made = await _client.PostAsJsonAsync($"{InDefault}/keys", new { name });
        var key = (await made.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("key").GetString();
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", key);
        return client;
    }

    // The background worker syncs on its own time, so this waits for the source to stop syncing.
    private async Task<int> SettledAsync()
    {
        for (var attempt = 0; attempt < 100; attempt++)
        {
            var source = (await _client.GetFromJsonAsync<JsonElement>($"{InDefault}/sources")).EnumerateArray().Single();
            if (source.GetProperty("status").GetString() != "Syncing")
            {
                return source.GetProperty("id").GetInt32();
            }

            await Task.Delay(100);
        }

        throw new TimeoutException("The source was still syncing after 10 seconds.");
    }
}
