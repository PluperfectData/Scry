using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Web;
using Microsoft.EntityFrameworkCore;
using NUnit.Framework;
using Scry.Api.Storage;
using Shouldly;
using static Scry.Api.Tests.ScryApiFactory;

namespace Scry.Api.Tests;

[TestFixture]
public sealed class WorkspaceTests
{
    private const string Orders = "day,amount\n2026-01-01,10\n2026-01-02,7\n";

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
    public async Task Each_workspace_keeps_its_own_dashboards_and_sources_in_its_own_file()
    {
        var finance = await MakeAsync("Finance");
        var ours = await UploadAsync(InDefault, "orders", Orders);
        var theirs = await UploadAsync(finance.Path, "orders", "day,amount\n2026-03-01,1\n");
        var dashboard = await DashboardAsync(InDefault, "Sales");

        (await NamesAsync($"{finance.Path}/sources")).ShouldBe(["orders"]);
        (await NamesAsync($"{finance.Path}/dashboards")).ShouldBeEmpty();
        (await RowCountAsync(InDefault, ours)).ShouldBe(2);
        (await RowCountAsync(finance.Path, theirs)).ShouldBe(1);
        File.Exists(Path.Combine(_factory.DataDirectory, "workspaces", finance.Folder, "data.duckdb")).ShouldBeTrue();

        (await _client.GetAsync($"{finance.Path}/dashboards/{dashboard}")).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await _client.GetAsync($"{finance.Path}/sources/{ours}/rows?offset=0&limit=5")).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await _client.DeleteAsync($"{finance.Path}/sources/{ours}")).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        using var joined = await _client.GetAsync($"{finance.Path}/sources/{theirs}/rows?offset=0&limit=5&join={ours}&joinOn=day&joinTo=day&joinKind=left");
        joined.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Test]
    public async Task A_viewer_opens_dashboards_and_their_charts_and_changes_nothing()
    {
        var source = await UploadAsync(InDefault, "orders", Orders);
        var dashboard = await DashboardAsync(InDefault, "Sales");
        await _factory.AddUserAsync(Viewer, Browser.Password);
        await _factory.JoinAsync(Viewer, WorkspaceRole.Viewer);
        using var viewer = _factory.SignedIn(Viewer, Browser.Password);

        foreach (var path in new[]
        {
            $"{InDefault}/dashboards",
            $"{InDefault}/dashboards/{dashboard}",
            $"{InDefault}/sources",
            $"{InDefault}/sources/{source}/series?x=day&y=amount&aggregate=sum",
            $"{InDefault}/sources/{source}/rows?offset=0&limit=5",
        })
        {
            (await viewer.GetAsync(path)).StatusCode.ShouldBe(HttpStatusCode.OK, path);
        }

        var refused = new (HttpMethod Method, string Path, object? Body)[]
        {
            (HttpMethod.Post, $"{InDefault}/dashboards", new { name = "Mine" }),
            (HttpMethod.Put, $"{InDefault}/dashboards/{dashboard}", new { name = "Sales", layouts = new { }, widgets = Array.Empty<object>() }),
            (HttpMethod.Patch, $"{InDefault}/dashboards/{dashboard}", new { name = "Sales", isLanding = true }),
            (HttpMethod.Delete, $"{InDefault}/dashboards/{dashboard}", null),
            (HttpMethod.Delete, $"{InDefault}/sources/{source}", null),
            (HttpMethod.Get, $"{InDefault}/sources/{source}/uses", null),
            (HttpMethod.Get, $"{InDefault}/keys", null),
            (HttpMethod.Post, $"{InDefault}/keys", new { name = "Script" }),
            (HttpMethod.Get, $"{InDefault}/nexus", null),
            (HttpMethod.Get, $"{InDefault}/connectors", null),
        };
        foreach (var (method, path, body) in refused)
        {
            using var request = new HttpRequestMessage(method, path) { Content = body is null ? null : JsonContent.Create(body) };
            (await viewer.SendAsync(request)).StatusCode.ShouldBe(HttpStatusCode.Forbidden, $"{method} {path}");
        }

        var listed = (await viewer.GetFromJsonAsync<JsonElement>("/workspaces")).EnumerateArray().Single();
        (listed.GetProperty("name").GetString(), listed.GetProperty("role").GetString()).ShouldBe(("Default", "Viewer"));
    }

    [Test]
    public async Task A_user_outside_a_workspace_finds_nothing_there_and_makes_none()
    {
        const string outsider = "outsider@acme.test";
        await _factory.AddUserAsync(outsider, Browser.Password);
        using var client = _factory.SignedIn(outsider, Browser.Password);

        (await client.GetFromJsonAsync<JsonElement>("/workspaces")).EnumerateArray().ShouldBeEmpty();
        (await client.GetAsync("/workspaces/1")).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await client.GetAsync($"{InDefault}/dashboards")).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await client.PostAsJsonAsync("/workspaces", new { name = "Mine" })).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (await _client.GetAsync("/workspaces/99/dashboards")).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Test]
    public async Task A_key_writes_into_its_own_workspace()
    {
        var finance = await MakeAsync("Finance");
        using var made = await _client.PostAsJsonAsync($"{finance.Path}/keys", new { name = "Script" });
        var key = (await made.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("key").GetString();
        using var script = _factory.CreateClient();
        script.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", key);

        (await script.PutAsJsonAsync("/ingest/sources/events", new { columns = new[] { new { name = "day", type = "String" } } }))
            .StatusCode.ShouldBe(HttpStatusCode.OK);
        using var batch = await script.PostAsJsonAsync("/ingest/sources/events/batches", new { mode = "append", rows = new[] { new object[] { "monday" } } });

        batch.StatusCode.ShouldBe(HttpStatusCode.OK, await batch.Content.ReadAsStringAsync());
        (await NamesAsync($"{finance.Path}/sources")).ShouldBe(["events"]);
        (await NamesAsync($"{InDefault}/sources")).ShouldBeEmpty();
        File.Exists(Path.Combine(_factory.DataDirectory, "workspaces", finance.Folder, "data.duckdb")).ShouldBeTrue();
    }

    [Test]
    public async Task Each_workspace_has_its_own_landing_dashboard()
    {
        var finance = await MakeAsync("Finance");
        var sales = await DashboardAsync(InDefault, "Sales");
        var budget = await DashboardAsync(finance.Path, "Budget");

        (await _client.PatchAsJsonAsync($"{InDefault}/dashboards/{sales}", new { name = "Sales", isLanding = true })).EnsureSuccessStatusCode();
        (await _client.PatchAsJsonAsync($"{finance.Path}/dashboards/{budget}", new { name = "Budget", isLanding = true })).EnsureSuccessStatusCode();

        (await _client.GetFromJsonAsync<JsonElement>($"{InDefault}/dashboards/{sales}")).GetProperty("isLanding").GetBoolean().ShouldBeTrue();
        (await _client.GetFromJsonAsync<JsonElement>($"{finance.Path}/dashboards/{budget}")).GetProperty("isLanding").GetBoolean().ShouldBeTrue();
    }

    [Test]
    public async Task Each_workspace_pairs_with_Nexus_on_its_own()
    {
        var finance = await MakeAsync("Finance");

        await PairAsync(finance.Path);
        using var elsewhere = await _client.GetAsync($"{InDefault}/nexus/callback?pairing={FakeNexus.PairingId}");
        await PairAsync(finance.Path);
        using var back = await _client.GetAsync($"{finance.Path}/nexus/callback?pairing={FakeNexus.PairingId}");

        var opened = _factory.Nexus.Requests.Last(r => r.Line == "POST /pairings").Body!.Value;
        opened.GetProperty("appName").GetString().ShouldBe("Scry at localhost:6161, workspace Finance");
        opened.GetProperty("callbackUrl").GetString().ShouldBe($"http://localhost:6161{finance.Path}/nexus/callback");
        opened.GetProperty("connectReturnUrl").GetString().ShouldBe($"{ClientOrigin}{finance.Path}/sources");
        HttpUtility.ParseQueryString(elsewhere.Headers.Location!.Query)["error"]
            .ShouldBe("This pairing was started in another workspace. Link Nexus again here.");
        back.Headers.Location!.OriginalString.ShouldBe($"{ClientOrigin}{finance.Path}/settings?linked=1");
        (await _client.GetFromJsonAsync<JsonElement>($"{finance.Path}/nexus")).GetProperty("linked").GetBoolean().ShouldBeTrue();
        (await _client.GetFromJsonAsync<JsonElement>($"{InDefault}/nexus")).GetProperty("linked").GetBoolean().ShouldBeFalse();
        (await NamesAsync($"{finance.Path}/keys")).ShouldBe(["Nexus at nexus.test"]);
        (await NamesAsync($"{InDefault}/keys")).ShouldBeEmpty();
    }

    [Test]
    public async Task Removing_a_workspace_takes_its_name_and_deletes_its_rows_and_its_folder()
    {
        var finance = await MakeAsync("Finance");
        await UploadAsync(finance.Path, "orders", Orders);
        await DashboardAsync(finance.Path, "Budget");
        (await _client.PostAsJsonAsync($"{finance.Path}/keys", new { name = "Script" })).EnsureSuccessStatusCode();
        await _factory.AddUserAsync(Viewer, Browser.Password);
        await _factory.JoinAsync(Viewer, WorkspaceRole.Viewer, finance.Id);
        await UploadAsync(InDefault, "orders", Orders);
        var folder = Path.Combine(_factory.DataDirectory, "workspaces", finance.Folder);
        Directory.Exists(folder).ShouldBeTrue();

        using var mistyped = await RemoveAsync(finance.Id, "finance");
        using var removed = await RemoveAsync(finance.Id, "Finance");

        mistyped.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await InstallTests.DetailAsync(mistyped)).ShouldBe("Type the workspace's name, Finance, to remove it.");
        removed.StatusCode.ShouldBe(HttpStatusCode.NoContent);
        Directory.Exists(folder).ShouldBeFalse();
        (await _client.GetAsync($"/workspaces/{finance.Id}")).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        await using var db = _factory.NewContext();
        (await db.Sources.CountAsync(s => s.WorkspaceId == finance.Id)).ShouldBe(0);
        (await db.Dashboards.CountAsync(d => d.WorkspaceId == finance.Id)).ShouldBe(0);
        (await db.IngestKeys.CountAsync(k => k.WorkspaceId == finance.Id)).ShouldBe(0);
        (await db.WorkspaceMembers.CountAsync(m => m.WorkspaceId == finance.Id)).ShouldBe(0);
        (await NamesAsync($"{InDefault}/sources")).ShouldBe(["orders"]);
    }

    [Test]
    public async Task Admins_choose_members_and_roles_and_the_users_page_shows_them()
    {
        var finance = await MakeAsync("Finance");
        var rowan = await _factory.AddUserAsync("rowan@acme.test", Browser.Password);
        using var asRowan = _factory.SignedIn("rowan@acme.test", Browser.Password);

        var viewing = await SetMemberAsync(finance.Id, rowan.Id, "Viewer");
        var editing = await SetMemberAsync(finance.Id, rowan.Id, "Editor");
        using var roleless = await _client.PutAsJsonAsync($"/workspaces/{finance.Id}/members/{rowan.Id}", new { role = (string?)null });
        var users = await _client.GetFromJsonAsync<JsonElement>("/users");
        var mine = await asRowan.GetFromJsonAsync<JsonElement>($"/workspaces/{finance.Id}");

        Members(viewing).ShouldBe(["rowan@acme.test Viewer"]);
        Members(editing).ShouldBe(["rowan@acme.test Editor"]);
        roleless.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var listed = users.EnumerateArray().Single(u => u.GetProperty("email").GetString() == "rowan@acme.test");
        listed.GetProperty("workspaces").EnumerateArray()
            .Select(w => $"{w.GetProperty("name").GetString()} {w.GetProperty("role").GetString()}")
            .ShouldBe(["Finance Editor"]);
        mine.GetProperty("role").GetString().ShouldBe("Editor");
        mine.GetProperty("members").ValueKind.ShouldBe(JsonValueKind.Null);

        using var taken = await _client.DeleteAsync($"/workspaces/{finance.Id}/members/{rowan.Id}");
        Members(await taken.Content.ReadFromJsonAsync<JsonElement>()).ShouldBeEmpty();
        (await asRowan.GetAsync($"{finance.Path}/dashboards")).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    private static List<string> Members(JsonElement detail) =>
        [.. detail.GetProperty("members").EnumerateArray().Select(m => $"{m.GetProperty("email").GetString()} {m.GetProperty("role").GetString()}")];

    private async Task<JsonElement> SetMemberAsync(int workspace, int user, string role)
    {
        using var response = await _client.PutAsJsonAsync($"/workspaces/{workspace}/members/{user}", new { role });
        response.StatusCode.ShouldBe(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    private async Task<(int Id, string Path, string Folder)> MakeAsync(string name)
    {
        using var made = await _client.PostAsJsonAsync("/workspaces", new { name });
        made.StatusCode.ShouldBe(HttpStatusCode.Created, await made.Content.ReadAsStringAsync());
        var id = (await made.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        return (id, $"/workspaces/{id}", id.ToString(CultureInfo.InvariantCulture));
    }

    private Task<HttpResponseMessage> RemoveAsync(int id, string name) =>
        _client.SendAsync(new HttpRequestMessage(HttpMethod.Delete, $"/workspaces/{id}") { Content = JsonContent.Create(new { name }) });

    private async Task<int> UploadAsync(string workspace, string name, string csv)
    {
        using var content = new MultipartFormDataContent();
        content.Add(new StringContent(name), "name");
        var file = new ByteArrayContent(Encoding.UTF8.GetBytes(csv));
        file.Headers.ContentType = new MediaTypeHeaderValue("text/csv");
        content.Add(file, "file", $"{name}.csv");
        using var response = await _client.PostAsync(new Uri($"{workspace}/sources", UriKind.Relative), content);
        response.StatusCode.ShouldBe(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
    }

    private async Task<int> DashboardAsync(string workspace, string name)
    {
        using var created = await _client.PostAsJsonAsync($"{workspace}/dashboards", new { name });
        created.StatusCode.ShouldBe(HttpStatusCode.Created);
        return (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
    }

    private async Task<List<string>> NamesAsync(string path) =>
        [.. (await _client.GetFromJsonAsync<JsonElement>(path)).EnumerateArray().Select(item => item.GetProperty("name").GetString()!)];

    private async Task<long> RowCountAsync(string workspace, int source) =>
        (await _client.GetFromJsonAsync<JsonElement>($"{workspace}/sources/{source}/rows?offset=0&limit=5")).GetProperty("total").GetInt64();

    private async Task PairAsync(string workspace)
    {
        using var started = await _client.PostAsJsonAsync($"{workspace}/nexus/pairing", new { nexusUrl = FakeNexus.Url });
        started.StatusCode.ShouldBe(HttpStatusCode.OK, await started.Content.ReadAsStringAsync());
    }
}
