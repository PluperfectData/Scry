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
[Route("dashboards")]
public sealed class DashboardsController(ScryDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IEnumerable<DashboardSummary>> List(CancellationToken ct)
    {
        var dashboards = await db.Dashboards
            .AsNoTracking()
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
    public async Task<ActionResult<DashboardView>> Get(int id, CancellationToken ct) =>
        await db.Dashboards.FindAsync([id], ct) is { } dashboard ? DashboardView.From(dashboard) : NotFound();

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
            Name = body.Name!.Trim(),
            Layouts = "{}",
            Widgets = "[]",
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Dashboards.Add(dashboard);
        await db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(Get), new { id = dashboard.Id }, DashboardView.From(dashboard));
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

        if (await db.Dashboards.FindAsync([id], ct) is not { } dashboard)
        {
            return NotFound();
        }

        dashboard.Name = body.Name!.Trim();
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

        if (await db.Dashboards.FindAsync([id], ct) is not { } dashboard)
        {
            return NotFound();
        }

        // The old landing dashboard is cleared first, since the unique index refuses two at once.
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        if (body.IsLanding)
        {
            await db.Dashboards
                .Where(d => d.Landing == true && d.Id != id)
                .ExecuteUpdateAsync(set => set.SetProperty(d => d.Landing, (bool?)null), ct);
        }

        dashboard.Name = body.Name!.Trim();
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
        if (await db.Dashboards.FindAsync([id], ct) is not { } dashboard)
        {
            return NotFound();
        }

        db.Dashboards.Remove(dashboard);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

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
