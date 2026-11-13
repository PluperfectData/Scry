using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Scry.Api.Data;

namespace Scry.Api.Controllers;

public sealed record DashboardSummary(int Id, string Name, DateTime UpdatedAt);

public sealed record DashboardView(
    int Id,
    string Name,
    JsonElement Layouts,
    JsonElement Widgets,
    DateTime CreatedAt,
    DateTime UpdatedAt)
{
    public static DashboardView From(Dashboard dashboard) => new(
        dashboard.Id,
        dashboard.Name,
        Parse(dashboard.Layouts),
        Parse(dashboard.Widgets),
        dashboard.CreatedAt,
        dashboard.UpdatedAt);

    private static JsonElement Parse(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }
}

public sealed record DashboardCreate(string? Name);

public sealed record DashboardUpdate(string? Name, JsonElement Layouts, JsonElement Widgets);

[ApiController]
[Route("dashboards")]
public sealed class DashboardsController(ScryDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IEnumerable<DashboardSummary>> List(CancellationToken ct) =>
        await db.Dashboards
            .AsNoTracking()
            .OrderBy(dashboard => dashboard.Name)
            .Select(dashboard => new DashboardSummary(dashboard.Id, dashboard.Name, dashboard.UpdatedAt))
            .ToListAsync(ct);

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

    private ObjectResult? CheckName(string? name) =>
        string.IsNullOrWhiteSpace(name) || name.Trim().Length > Dashboard.MaxNameLength
            ? Problem(
                $"A dashboard needs a name of {Dashboard.MaxNameLength} characters or fewer.",
                statusCode: StatusCodes.Status400BadRequest)
            : null;
}
