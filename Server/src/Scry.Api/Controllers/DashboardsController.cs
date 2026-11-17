using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Scry.Api.Storage;

namespace Scry.Api.Controllers;

public sealed record DashboardSummary(
    int Id,
    string Name,
    int ChartCount,
    bool IsLanding,
    JsonElement? Presentation,
    DateTime UpdatedAt);

public sealed record DashboardView(
    int Id,
    string Name,
    JsonElement Layouts,
    JsonElement Widgets,
    bool IsLanding,
    JsonElement? Presentation,
    DateTime CreatedAt,
    DateTime UpdatedAt)
{
    public static DashboardView From(Dashboard dashboard) => new(
        dashboard.Id,
        dashboard.Name,
        Parse(dashboard.Layouts),
        Parse(dashboard.Widgets),
        dashboard.Landing == true,
        dashboard.Presentation is null ? null : Parse(dashboard.Presentation),
        dashboard.CreatedAt,
        dashboard.UpdatedAt);

    internal static JsonElement Parse(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }
}

public sealed record DashboardCreate(string? Name);

public sealed record DashboardUpdate(string? Name, JsonElement Layouts, JsonElement Widgets);

public sealed record DashboardEdit(string? Name, bool IsLanding, JsonElement? Presentation);

[ApiController]
[Route("workspaces/{workspaceId:int}/dashboards")]
[InWorkspace]
public sealed class DashboardsController(ScryDbContext db, CurrentWorkspace workspace, OperatorLog log) : ControllerBase
{
    [HttpGet]
    [ForViewers]
    public async Task<IEnumerable<DashboardSummary>> List(CancellationToken ct)
    {
        var dashboards = await db.Dashboards
            .AsNoTracking()
            .Where(dashboard => dashboard.WorkspaceId == workspace.Id)
            .OrderBy(dashboard => dashboard.Name)
            .Select(dashboard => new { dashboard.Id, dashboard.Name, dashboard.Widgets, dashboard.Landing, dashboard.Presentation, dashboard.UpdatedAt })
            .ToListAsync(ct);

        return dashboards.Select(dashboard => new DashboardSummary(
            dashboard.Id,
            dashboard.Name,
            ChartCount(dashboard.Widgets),
            dashboard.Landing == true,
            dashboard.Presentation is null ? null : DashboardView.Parse(dashboard.Presentation),
            dashboard.UpdatedAt));
    }

    [HttpGet("{id:int}")]
    [ForViewers]
    public async Task<ActionResult<DashboardView>> Get(int id, CancellationToken ct) =>
        await FindAsync(id, ct) is { } dashboard ? DashboardView.From(dashboard) : NotFound();

    [HttpPost]
    public async Task<ActionResult<DashboardView>> Create([FromBody] DashboardCreate body, CancellationToken ct)
    {
        if (CheckName(body.Name) is { } problem)
        {
            return problem;
        }

        var now = DateTime.UtcNow;
        var dashboard = new Dashboard
        {
            WorkspaceId = workspace.Id,
            Name = body.Name!.Trim(),
            Layouts = "{}",
            Widgets = "[]",
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Dashboards.Add(dashboard);
        log.Info($"Dashboard {dashboard.Name} was made.", LogPlace.In(workspace.Id));
        await db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(Get), new { workspaceId = workspace.Id, id = dashboard.Id }, DashboardView.From(dashboard));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<DashboardView>> Update(int id, [FromBody] DashboardUpdate body, CancellationToken ct)
    {
        if (CheckName(body.Name) is { } problem)
        {
            return problem;
        }

        if (body.Layouts.ValueKind != JsonValueKind.Object || body.Widgets.ValueKind != JsonValueKind.Array)
        {
            return Problem(
                "Layouts must be an object of layouts by breakpoint, and widgets a list.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        if (await FindAsync(id, ct) is not { } dashboard)
        {
            return NotFound();
        }

        var name = body.Name!.Trim();
        if (dashboard.Name != name)
        {
            log.Info($"Dashboard {dashboard.Name} was renamed {name}.", LogPlace.In(workspace.Id));
        }

        foreach (var change in ChartChanges(name, dashboard.Widgets, body.Widgets))
        {
            log.Info(change, LogPlace.In(workspace.Id));
        }

        dashboard.Name = name;
        dashboard.Layouts = body.Layouts.GetRawText();
        dashboard.Widgets = body.Widgets.GetRawText();
        dashboard.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        return DashboardView.From(dashboard);
    }

    /// <summary>
    /// Renames a dashboard, makes it the landing dashboard or stops it being one, and keeps how its data scrolls in
    /// full screen: a JSON object the client owns, or null for the defaults.
    /// </summary>
    [HttpPatch("{id:int}")]
    public async Task<ActionResult<DashboardView>> Edit(int id, [FromBody] DashboardEdit body, CancellationToken ct)
    {
        if (CheckName(body.Name) is { } problem)
        {
            return problem;
        }

        if (body.Presentation is { ValueKind: not (JsonValueKind.Object or JsonValueKind.Null) })
        {
            return Problem("A dashboard's presentation is an object, or null for the defaults.", statusCode: StatusCodes.Status400BadRequest);
        }

        if (await FindAsync(id, ct) is not { } dashboard)
        {
            return NotFound();
        }

        // The old landing dashboard is cleared first, since the unique index refuses two at once.
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        if (body.IsLanding)
        {
            await db.Dashboards
                .Where(d => d.WorkspaceId == workspace.Id && d.Landing == true && d.Id != id)
                .ExecuteUpdateAsync(set => set.SetProperty(d => d.Landing, (bool?)null), ct);
        }

        var name = body.Name!.Trim();
        if (dashboard.Name != name)
        {
            log.Info($"Dashboard {dashboard.Name} was renamed {name}.", LogPlace.In(workspace.Id));
        }

        if (body.IsLanding != (dashboard.Landing == true))
        {
            log.Info(
                body.IsLanding ? $"Dashboard {name} is now the workspace's landing page." : $"Dashboard {name} is no longer the workspace's landing page.",
                LogPlace.In(workspace.Id));
        }

        dashboard.Name = name;
        dashboard.Landing = body.IsLanding ? true : null;
        dashboard.Presentation = body.Presentation is { ValueKind: JsonValueKind.Object } presentation ? presentation.GetRawText() : null;
        dashboard.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return DashboardView.From(dashboard);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        if (await FindAsync(id, ct) is not { } dashboard)
        {
            return NotFound();
        }

        db.Dashboards.Remove(dashboard);
        log.Info($"Dashboard {dashboard.Name} was removed.", LogPlace.In(workspace.Id));
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// A sentence for each chart a save adds, edits, or removes, matched by the widgets' ids. Moving or resizing a chart
    /// changes only the layouts, so it says nothing.
    /// </summary>
    internal static IEnumerable<string> ChartChanges(string dashboard, string stored, JsonElement saved)
    {
        var before = Charts(DashboardView.Parse(stored));
        var after = Charts(saved);
        foreach (var (id, chart) in after)
        {
            if (!before.TryGetValue(id, out var was))
            {
                yield return $"{Capital(chart.Said)} was added to dashboard {dashboard}.";
            }
            else if (was.Json != chart.Json)
            {
                yield return $"{Capital(chart.Said)} on dashboard {dashboard} was edited.";
            }
        }

        foreach (var (id, chart) in before)
        {
            if (!after.ContainsKey(id))
            {
                yield return $"{Capital(chart.Said)} was removed from dashboard {dashboard}.";
            }
        }
    }

    private static Dictionary<string, (string Json, string Said)> Charts(JsonElement widgets)
    {
        var charts = new Dictionary<string, (string, string)>(StringComparer.Ordinal);
        if (widgets.ValueKind != JsonValueKind.Array)
        {
            return charts;
        }

        foreach (var widget in widgets.EnumerateArray())
        {
            if (widget.ValueKind == JsonValueKind.Object && Text(widget, "id") is { } id)
            {
                charts[id] = (widget.GetRawText(), LogWords.Chart(Text(widget, "name") ?? Text(widget, "title"), Text(widget, "kind")));
            }
        }

        return charts;
    }

    private static string? Text(JsonElement widget, string property) =>
        widget.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static string Capital(string text) => text.Length == 0 ? text : char.ToUpperInvariant(text[0]) + text[1..];

    private Task<Dashboard?> FindAsync(int id, CancellationToken ct) =>
        db.Dashboards.FirstOrDefaultAsync(d => d.Id == id && d.WorkspaceId == workspace.Id, ct);

    private static int ChartCount(string widgets)
    {
        using var document = JsonDocument.Parse(widgets);
        return document.RootElement.GetArrayLength();
    }

    private ObjectResult? CheckName(string? name) =>
        string.IsNullOrWhiteSpace(name) || name.Trim().Length > Dashboard.MaxNameLength
            ? Problem(
                $"A dashboard needs a name of {Dashboard.MaxNameLength} characters or fewer.",
                statusCode: StatusCodes.Status400BadRequest)
            : null;
}
