using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Nexus;
using Scry.Api.Storage;

namespace Scry.Api.Controllers;

public sealed class SourceUpload
{
    /// <summary>The source's name, which is also its table's name.</summary>
    public string? Name { get; set; }

    public IFormFile? File { get; set; }

    /// <summary>Comma, Semicolon, Tab, or Pipe. Blank means Comma.</summary>
    public string? Delimiter { get; set; }
}

/// <summary>Where a source's rows come from.</summary>
public enum SourceKind
{
    /// <summary>An uploaded file.</summary>
    Upload,

    /// <summary>A stream of a connection, such as a database table.</summary>
    Connection,

    /// <summary>Rows sent through the push API.</summary>
    Push,
}

/// <summary>A source: an uploaded file, with its <paramref name="FileName"/>; a connection's stream, with the
/// <paramref name="Connector"/> that reads it and its <paramref name="Stream"/> name there; or rows pushed with the key
/// named <paramref name="PushedBy"/>, null once that key is revoked. <paramref name="Status"/> and
/// <paramref name="Error"/> say how its last sync went.</summary>
public sealed record SourceView(
    int Id,
    string Name,
    SourceKind Kind,
    string? FileName,
    string? Connector,
    string? Stream,
    string? PushedBy,
    IReadOnlyList<ColumnInfo> Columns,
    long RowCount,
    DateTime? SyncedAt,
    SourceStatus Status,
    string? Error)
{
    public static SourceView From(Source source) => new(
        source.Id,
        source.Name,
        source.Pushed ? SourceKind.Push : source.ConnectionId is null ? SourceKind.Upload : SourceKind.Connection,
        source.FileName,
        source.Connection?.Connector,
        source.Stream,
        source.IngestKey?.Name,
        ColumnInfo.Deserialize(source.Columns),
        source.RowCount,
        source.SyncedAt,
        source.Status,
        source.Error);
}

/// <summary>
/// Another source to join to a chart's own, from the query's <c>join</c> (its id), <c>joinOn</c> (the column in the
/// chart's source), <c>joinTo</c> (the column in the joined one), and <c>joinKind</c>: <c>inner</c>, <c>left</c>,
/// <c>right</c>, or <c>full</c>.
/// </summary>
public sealed class SourceJoin
{
    public int? Join { get; set; }

    public string? JoinOn { get; set; }

    public string? JoinTo { get; set; }

    public string? JoinKind { get; set; }
}

[ApiController]
[Route("sources")]
public sealed class SourcesController(ScryDbContext db, Workspace workspace, SourceSync sync) : ControllerBase
{
    [HttpGet]
    public async Task<IEnumerable<SourceView>> List(CancellationToken ct) =>
        (await db.Sources.AsNoTracking().Include(source => source.Connection).Include(source => source.IngestKey).OrderBy(source => source.Name).ToListAsync(ct))
        .Select(SourceView.From);

    [HttpGet("{id:int}")]
    public async Task<ActionResult<SourceView>> Get(int id, CancellationToken ct) =>
        await db.Sources.Include(source => source.Connection).Include(source => source.IngestKey).FirstOrDefaultAsync(source => source.Id == id, ct) is { } source
            ? SourceView.From(source)
            : NotFound();

    /// <summary>Copies a connection's stream into DuckDB again. An uploaded file syncs once, when it is uploaded.</summary>
    [HttpPost("{id:int}/sync")]
    public async Task<ActionResult<SourceView>> Sync(int id, CancellationToken ct)
    {
        if (await db.Sources.Include(s => s.Connection).FirstOrDefaultAsync(s => s.Id == id, ct) is not { } source)
        {
            return NotFound();
        }

        if (source.Connection is null || source.Stream is null)
        {
            return Problem(
                source.Pushed
                    ? "A pushed source gets its rows through the push API, so Scry has nothing to sync."
                    : "An uploaded file syncs once, when it is uploaded. Upload it again to refresh it.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        if (source.Status == SourceStatus.Syncing)
        {
            return Problem($"{source.Name} is syncing already.", statusCode: StatusCodes.Status409Conflict);
        }

        try
        {
            await sync.RunAsync(source, ct);
        }
        catch (ConnectorException ex)
        {
            return this.ConnectorProblem(ex);
        }

        return SourceView.From(source);
    }

    /// <summary>The largest CSV file a source can be made from: 1 GB.</summary>
    public const long MaxUploadBytes = 1L << 30;

    // The form around the file also carries its name, its delimiter, and the multipart boundaries.
    private const long FormOverheadBytes = 1L << 20;

    /// <summary>Uploads a CSV file and syncs it through Nexus into the workspace's DuckDB file.</summary>
    [HttpPost]
    [RequestSizeLimit(MaxUploadBytes + FormOverheadBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxUploadBytes)]
    public async Task<ActionResult<SourceView>> Upload([FromForm] SourceUpload upload, CancellationToken ct)
    {
        var name = upload.Name?.Trim() ?? string.Empty;
        if (!Source.IsValidName(name))
        {
            return Problem(Source.NameRule, statusCode: StatusCodes.Status400BadRequest);
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
            return this.ConnectorProblem(ex);
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
        [FromQuery] SourceJoin joined,
        CancellationToken ct) =>
        Chart(id, joined, from => ChartQueries.Series(from, x, y, aggregate), ct);

    /// <summary>One point per row, for a scatter chart.</summary>
    [HttpGet("{id:int}/points")]
    public Task<ActionResult<Series>> GetPoints(
        int id,
        [FromQuery] string x,
        [FromQuery] string y,
        [FromQuery] SourceJoin joined,
        CancellationToken ct) =>
        Chart(id, joined, from => ChartQueries.Points(from, x, y), ct);

    /// <summary>One candle per row, as <c>[x, open, close, low, high]</c>.</summary>
    [HttpGet("{id:int}/candles")]
    public Task<ActionResult<Series>> GetCandles(
        int id,
        [FromQuery] string x,
        [FromQuery] string open,
        [FromQuery] string high,
        [FromQuery] string low,
        [FromQuery] string close,
        [FromQuery] SourceJoin joined,
        CancellationToken ct) =>
        Chart(id, joined, from => ChartQueries.Candles(from, x, open, high, low, close), ct);

    /// <summary><paramref name="y"/> aggregated per <paramref name="x"/> and <paramref name="group"/>, as <c>[x, group, y]</c>.</summary>
    [HttpGet("{id:int}/groups")]
    public Task<ActionResult<Series>> GetGroups(
        int id,
        [FromQuery] string x,
        [FromQuery] string group,
        [FromQuery] string? y,
        [FromQuery] string aggregate,
        [FromQuery] SourceJoin joined,
        CancellationToken ct) =>
        Chart(id, joined, from => ChartQueries.Groups(from, x, group, y, aggregate), ct);

    /// <summary>
    /// <paramref name="y"/> aggregated per <paramref name="row"/> and <paramref name="column"/>, as
    /// <c>[row, column, value, row's place, column's place]</c>, for a pivot table.
    /// </summary>
    [HttpGet("{id:int}/pivot")]
    public Task<ActionResult<Series>> GetPivot(
        int id,
        [FromQuery] string row,
        [FromQuery] string column,
        [FromQuery] string? y,
        [FromQuery] string aggregate,
        [FromQuery] SourceJoin joined,
        CancellationToken ct) =>
        Chart(id, joined, from => ChartQueries.Pivot(from, row, column, y, aggregate), ct);

    /// <summary>Equal-width bins over a number column, as <c>[start, end, count]</c>.</summary>
    [HttpGet("{id:int}/histogram")]
    public Task<ActionResult<Series>> GetHistogram(
        int id,
        [FromQuery] string column,
        [FromQuery] int? bins,
        [FromQuery] SourceJoin joined,
        CancellationToken ct) =>
        Chart(id, joined, from => ChartQueries.Histogram(from, column, bins ?? 20), ct);

    /// <summary>Box plot statistics per group, as <c>[group, min, q1, median, q3, max]</c>.</summary>
    [HttpGet("{id:int}/boxes")]
    public Task<ActionResult<Series>> GetBoxes(
        int id,
        [FromQuery] string value,
        [FromQuery] string? group,
        [FromQuery] SourceJoin joined,
        CancellationToken ct) =>
        Chart(id, joined, from => ChartQueries.Boxes(from, value, group), ct);

    /// <summary><paramref name="y"/> aggregated over every row, as one <c>["All rows", value]</c> point.</summary>
    [HttpGet("{id:int}/total")]
    public Task<ActionResult<Series>> GetTotal(
        int id,
        [FromQuery] string? y,
        [FromQuery] string aggregate,
        [FromQuery] SourceJoin joined,
        CancellationToken ct) =>
        Chart(id, joined, from => ChartQueries.Total(from, y, aggregate), ct);

    /// <summary>Several number columns aggregated per group, as <c>[group, value, ...]</c>.</summary>
    [HttpGet("{id:int}/measures")]
    public Task<ActionResult<Series>> GetMeasures(
        int id,
        [FromQuery] string[]? columns,
        [FromQuery] string? group,
        [FromQuery] string aggregate,
        [FromQuery] SourceJoin joined,
        CancellationToken ct) =>
        Chart(id, joined, from => ChartQueries.Measures(from, columns ?? [], group, aggregate), ct);

    /// <summary><paramref name="y"/> aggregated per path through the levels, as <c>[level, ..., value]</c>.</summary>
    [HttpGet("{id:int}/tree")]
    public Task<ActionResult<Series>> GetTree(
        int id,
        [FromQuery] string[]? levels,
        [FromQuery] string? y,
        [FromQuery] string aggregate,
        [FromQuery] SourceJoin joined,
        CancellationToken ct) =>
        Chart(id, joined, from => ChartQueries.Tree(from, levels ?? [], y, aggregate), ct);

    /// <summary><paramref name="y"/> aggregated per pair of ends, as <c>[from, to, value]</c>.</summary>
    [HttpGet("{id:int}/links")]
    public Task<ActionResult<Series>> GetLinks(
        int id,
        [FromQuery(Name = "from")] string source,
        [FromQuery(Name = "to")] string target,
        [FromQuery] string? y,
        [FromQuery] string aggregate,
        [FromQuery] SourceJoin joined,
        CancellationToken ct) =>
        Chart(id, joined, from => ChartQueries.Links(from, source, target, y, aggregate), ct);

    /// <summary>The chosen number columns, one row per source row, as <c>[value, ...]</c>.</summary>
    [HttpGet("{id:int}/values")]
    public Task<ActionResult<Series>> GetValues(
        int id,
        [FromQuery] string[]? columns,
        [FromQuery] SourceJoin joined,
        CancellationToken ct) =>
        Chart(id, joined, from => ChartQueries.Values(from, columns ?? []), ct);

    /// <summary>
    /// <c>limit</c> rows from <c>offset</c> of the chosen columns, or of every column, as text, sorted by <c>sort</c>
    /// in <c>direction</c> (<c>asc</c> or <c>desc</c>) or in source order, with the source's row count. With <c>count</c>,
    /// matching rows become one, with a Count column; see <see cref="ChartQueries.Rows"/>.
    /// </summary>
    [HttpGet("{id:int}/rows")]
    public async Task<ActionResult<Rows>> GetRows(
        int id,
        [FromQuery] string[]? columns,
        [FromQuery] string? sort,
        [FromQuery] string? direction,
        [FromQuery] bool count,
        [FromQuery] int offset,
        [FromQuery] int limit,
        [FromQuery] SourceJoin joined,
        CancellationToken ct)
    {
        RowsQuery query;
        try
        {
            if (await Read(id, joined, ct) is not { } from)
            {
                return NotFound();
            }

            query = ChartQueries.Rows(from, columns ?? [], sort, direction, count, offset, limit);
        }
        catch (ArgumentException ex)
        {
            return Problem(ex.Message, statusCode: StatusCodes.Status400BadRequest);
        }

        var rows = await workspace.QueryAsync(query.Sql, limit, ct);
        var totals = await workspace.QueryAsync(query.CountSql, 1, ct);
        var total = totals.Count == 0 ? 0 : Convert.ToInt64(totals[0][0], CultureInfo.InvariantCulture);
        return new Rows(query.Columns, rows, total);
    }

    private async Task<ActionResult<Series>> Chart(
        int id,
        SourceJoin joined,
        Func<Relation, ChartQuery> build,
        CancellationToken ct)
    {
        ChartQuery query;
        try
        {
            if (await Read(id, joined, ct) is not { } from)
            {
                return NotFound();
            }

            query = build(from);
        }
        catch (ArgumentException ex)
        {
            return Problem(ex.Message, statusCode: StatusCodes.Status400BadRequest);
        }

        var rows = await workspace.QueryAsync(query.Sql, ChartQueries.MaxPoints + 1, ct);
        var truncated = rows.Count > ChartQueries.MaxPoints;
        return new Series(query.XType, truncated ? rows.GetRange(0, ChartQueries.MaxPoints) : rows, truncated);
    }

    /// <summary>The source's table, or the source joined to another; null when the source does not exist.</summary>
    private async Task<Relation?> Read(int id, SourceJoin joined, CancellationToken ct)
    {
        if (await db.Sources.FindAsync([id], ct) is not { } source)
        {
            return null;
        }

        var columns = ColumnInfo.Deserialize(source.Columns);
        if (joined.Join is not { } otherId)
        {
            return Relation.Of(source.Name, columns);
        }

        var other = await db.Sources.FindAsync([otherId], ct)
            ?? throw new ArgumentException($"There is no source {otherId} to join.");
        return Relation.Join(
            source.Name,
            columns,
            other.Name,
            ColumnInfo.Deserialize(other.Columns),
            joined.JoinOn ?? throw new ArgumentException("Choose the column to match in this source."),
            joined.JoinTo ?? throw new ArgumentException("Choose the column to match in the joined source."),
            joined.JoinKind ?? throw new ArgumentException("Choose which rows without a match to keep."));
    }
}
