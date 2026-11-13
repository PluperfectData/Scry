using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Nexus;
using Scry.Api.Data;

namespace Scry.Api.Controllers;

public sealed class SourceUpload
{
    /// <summary>The source's name, which is also its table's name.</summary>
    public string? Name { get; set; }

    public IFormFile? File { get; set; }

    /// <summary>Comma, Semicolon, Tab, or Pipe. Blank means Comma.</summary>
    public string? Delimiter { get; set; }
}

public sealed record SourceView(
    int Id,
    string Name,
    string FileName,
    IReadOnlyList<ColumnInfo> Columns,
    long RowCount,
    DateTime SyncedAt)
{
    public static SourceView From(Source source) => new(
        source.Id,
        source.Name,
        source.FileName,
        ColumnInfo.Deserialize(source.Columns),
        source.RowCount,
        source.SyncedAt);
}

[ApiController]
[Route("sources")]
public sealed partial class SourcesController(ScryDbContext db, Workspace workspace) : ControllerBase
{
    [HttpGet]
    public async Task<IEnumerable<SourceView>> List(CancellationToken ct) =>
        (await db.Sources.AsNoTracking().OrderBy(source => source.Name).ToListAsync(ct)).Select(SourceView.From);

    [HttpGet("{id:int}")]
    public async Task<ActionResult<SourceView>> Get(int id, CancellationToken ct) =>
        await db.Sources.FindAsync([id], ct) is { } source ? SourceView.From(source) : NotFound();

    /// <summary>Uploads a CSV file and syncs it through Nexus into the workspace's DuckDB file.</summary>
    [HttpPost]
    public async Task<ActionResult<SourceView>> Upload([FromForm] SourceUpload upload, CancellationToken ct)
    {
        var name = upload.Name?.Trim() ?? string.Empty;
        if (!NamePattern().IsMatch(name))
        {
            return Problem(
                "A source name starts with a lowercase letter and holds only lowercase letters, digits, and "
                + "underscores, 63 at most.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        if (upload.File is not { Length: > 0 } file)
        {
            return Problem("Choose a CSV file to upload.", statusCode: StatusCodes.Status400BadRequest);
        }

        if (await db.Sources.AnyAsync(source => source.Name == name, ct))
        {
            return Problem($"A source named '{name}' already exists.", statusCode: StatusCodes.Status409Conflict);
        }

        Directory.CreateDirectory(workspace.Uploads);
        var stored = $"{Guid.NewGuid():N}.csv";
        var storedPath = Path.Combine(workspace.Uploads, stored);
        await using (var target = new FileStream(storedPath, FileMode.CreateNew, FileAccess.Write))
        {
            await file.CopyToAsync(target, ct);
        }

        SyncResult result;
        try
        {
            result = await workspace.SyncCsvAsync(name, file.FileName, storedPath, upload.Delimiter, ct);
        }
        catch (ConnectorException ex)
        {
            System.IO.File.Delete(storedPath);
            return Problem(
                ex.Message,
                statusCode: ex.Kind == ConnectorErrorKind.Transient
                    ? StatusCodes.Status503ServiceUnavailable
                    : StatusCodes.Status400BadRequest);
        }

        var created = new Source
        {
            Name = name,
            FileName = Path.GetFileName(file.FileName),
            StoredFile = stored,
            Columns = ColumnInfo.Serialize(result.Columns),
            RowCount = result.RowCount,
            SyncedAt = DateTime.UtcNow,
        };
        db.Sources.Add(created);
        await db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(Get), new { id = created.Id }, SourceView.From(created));
    }

    /// <summary><paramref name="y"/> aggregated per value of <paramref name="x"/>, for line, bar, and pie charts.</summary>
    [HttpGet("{id:int}/series")]
    public Task<ActionResult<Series>> GetSeries(
        int id,
        [FromQuery] string x,
        [FromQuery] string? y,
        [FromQuery] string aggregate,
        CancellationToken ct) =>
        Chart(id, (source, columns) => ChartQueries.Series(source.Name, columns, x, y, aggregate), ct);

    /// <summary>One point per row, for a scatter chart.</summary>
    [HttpGet("{id:int}/points")]
    public Task<ActionResult<Series>> GetPoints(int id, [FromQuery] string x, [FromQuery] string y, CancellationToken ct) =>
        Chart(id, (source, columns) => ChartQueries.Points(source.Name, columns, x, y), ct);

    /// <summary>One candle per row, as <c>[x, open, close, low, high]</c>.</summary>
    [HttpGet("{id:int}/candles")]
    public Task<ActionResult<Series>> GetCandles(
        int id,
        [FromQuery] string x,
        [FromQuery] string open,
        [FromQuery] string high,
        [FromQuery] string low,
        [FromQuery] string close,
        CancellationToken ct) =>
        Chart(id, (source, columns) => ChartQueries.Candles(source.Name, columns, x, open, high, low, close), ct);

    /// <summary><paramref name="y"/> aggregated per <paramref name="x"/> and <paramref name="group"/>, as <c>[x, group, y]</c>.</summary>
    [HttpGet("{id:int}/groups")]
    public Task<ActionResult<Series>> GetGroups(
        int id,
        [FromQuery] string x,
        [FromQuery] string group,
        [FromQuery] string? y,
        [FromQuery] string aggregate,
        CancellationToken ct) =>
        Chart(id, (source, columns) => ChartQueries.Groups(source.Name, columns, x, group, y, aggregate), ct);

    /// <summary>Equal-width bins over a number column, as <c>[start, end, count]</c>.</summary>
    [HttpGet("{id:int}/histogram")]
    public Task<ActionResult<Series>> GetHistogram(
        int id,
        [FromQuery] string column,
        [FromQuery] int? bins,
        CancellationToken ct) =>
        Chart(id, (source, columns) => ChartQueries.Histogram(source.Name, columns, column, bins ?? 20), ct);

    /// <summary>Box plot statistics per group, as <c>[group, min, q1, median, q3, max]</c>.</summary>
    [HttpGet("{id:int}/boxes")]
    public Task<ActionResult<Series>> GetBoxes(
        int id,
        [FromQuery] string value,
        [FromQuery] string? group,
        CancellationToken ct) =>
        Chart(id, (source, columns) => ChartQueries.Boxes(source.Name, columns, value, group), ct);

    /// <summary><paramref name="y"/> aggregated over every row, as one <c>["All rows", value]</c> point.</summary>
    [HttpGet("{id:int}/total")]
    public Task<ActionResult<Series>> GetTotal(int id, [FromQuery] string? y, [FromQuery] string aggregate, CancellationToken ct) =>
        Chart(id, (source, columns) => ChartQueries.Total(source.Name, columns, y, aggregate), ct);

    /// <summary>Several number columns aggregated per group, as <c>[group, value, ...]</c>.</summary>
    [HttpGet("{id:int}/measures")]
    public Task<ActionResult<Series>> GetMeasures(
        int id,
        [FromQuery] string[]? columns,
        [FromQuery] string? group,
        [FromQuery] string aggregate,
        CancellationToken ct) =>
        Chart(id, (source, all) => ChartQueries.Measures(source.Name, all, columns ?? [], group, aggregate), ct);

    /// <summary><paramref name="y"/> aggregated per path through the levels, as <c>[level, ..., value]</c>.</summary>
    [HttpGet("{id:int}/tree")]
    public Task<ActionResult<Series>> GetTree(
        int id,
        [FromQuery] string[]? levels,
        [FromQuery] string? y,
        [FromQuery] string aggregate,
        CancellationToken ct) =>
        Chart(id, (source, columns) => ChartQueries.Tree(source.Name, columns, levels ?? [], y, aggregate), ct);

    /// <summary><paramref name="y"/> aggregated per pair of ends, as <c>[from, to, value]</c>.</summary>
    [HttpGet("{id:int}/links")]
    public Task<ActionResult<Series>> GetLinks(
        int id,
        [FromQuery] string from,
        [FromQuery] string to,
        [FromQuery] string? y,
        [FromQuery] string aggregate,
        CancellationToken ct) =>
        Chart(id, (source, columns) => ChartQueries.Links(source.Name, columns, from, to, y, aggregate), ct);

    /// <summary>The chosen number columns, one row per source row, as <c>[value, ...]</c>.</summary>
    [HttpGet("{id:int}/values")]
    public Task<ActionResult<Series>> GetValues(int id, [FromQuery] string[]? columns, CancellationToken ct) =>
        Chart(id, (source, all) => ChartQueries.Values(source.Name, all, columns ?? []), ct);

    /// <summary>The first rows of the chosen columns, or of every column, as text.</summary>
    [HttpGet("{id:int}/rows")]
    public async Task<ActionResult<Rows>> GetRows(int id, [FromQuery] string[]? columns, CancellationToken ct)
    {
        if (await db.Sources.FindAsync([id], ct) is not { } source)
        {
            return NotFound();
        }

        RowsQuery query;
        try
        {
            query = ChartQueries.Rows(source.Name, ColumnInfo.Deserialize(source.Columns), columns ?? []);
        }
        catch (ArgumentException ex)
        {
            return Problem(ex.Message, statusCode: StatusCodes.Status400BadRequest);
        }

        var rows = await workspace.QueryAsync(query.Sql, ChartQueries.MaxRows + 1, ct);
        var truncated = rows.Count > ChartQueries.MaxRows;
        return new Rows(query.Columns, truncated ? rows.GetRange(0, ChartQueries.MaxRows) : rows, truncated);
    }

    private async Task<ActionResult<Series>> Chart(
        int id,
        Func<Source, IReadOnlyList<ColumnInfo>, ChartQuery> build,
        CancellationToken ct)
    {
        if (await db.Sources.FindAsync([id], ct) is not { } source)
        {
            return NotFound();
        }

        ChartQuery query;
        try
        {
            query = build(source, ColumnInfo.Deserialize(source.Columns));
        }
        catch (ArgumentException ex)
        {
            return Problem(ex.Message, statusCode: StatusCodes.Status400BadRequest);
        }

        var rows = await workspace.QueryAsync(query.Sql, ChartQueries.MaxPoints + 1, ct);
        var truncated = rows.Count > ChartQueries.MaxPoints;
        return new Series(query.XType, truncated ? rows.GetRange(0, ChartQueries.MaxPoints) : rows, truncated);
    }

    [GeneratedRegex("^[a-z][a-z0-9_]{0,62}$")]
    private static partial Regex NamePattern();
}
