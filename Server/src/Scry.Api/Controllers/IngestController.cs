using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.EntityFrameworkCore;
using Nexus;
using Pluperfect.Jwt;
using Scry.Api.Storage;

namespace Scry.Api.Controllers;

/// <summary>One column a pushed source declares. <paramref name="Type"/> is a Nexus column type's name, such as <c>Int64</c>.</summary>
public sealed record IngestColumnRequest(string? Name, string? Type, int? Precision, int? Scale);

/// <summary>
/// A pushed source's columns, in the order its rows hold them, and the columns its merges match on.
/// <paramref name="Origin"/>, optional, says where the rows come from, and the Sources page shows it.
/// </summary>
public sealed record IngestSchemaRequest(IReadOnlyList<IngestColumnRequest>? Columns, IReadOnlyList<string>? PrimaryKey, string? Origin = null);

/// <summary>
/// A batch of rows, each a JSON array in the source's column order. <paramref name="Mode"/> is <c>append</c>, the
/// default, or <c>merge</c>. A batch <paramref name="Id"/> already written is skipped.
/// </summary>
public sealed record IngestBatchRequest(string? Id, string? Mode, IReadOnlyList<JsonElement[]>? Rows);

/// <summary>A pushed source as its key sees it. <paramref name="Replacing"/> says batches go to a replacement.</summary>
public sealed record IngestSourceView(
    string Name,
    IReadOnlyList<ColumnInfo> Columns,
    IReadOnlyList<string> PrimaryKey,
    long RowCount,
    bool Replacing);

/// <summary>The source's row count after a batch, and whether the batch was skipped as one already written.</summary>
public sealed record IngestBatchView(long RowCount, bool Skipped);

/// <summary>The key a request carries, by the name and prefix the Settings page shows.</summary>
public sealed record CallerKeyView(string Name, string Prefix);

/// <summary>
/// The push API. Every route takes a key made on the Settings page as <c>Authorization: Bearer</c>, and no session, so
/// there is no cookie for antiforgery to protect. A key writes only to the sources it made, and to a pushed source whose
/// key was revoked, which it then takes over.
/// </summary>
[ApiController]
[Route("ingest/sources/{name}")]
[AllowAnonymous]
[SkipAntiforgery]
public sealed class IngestController(ScryDbContext db, Workspace workspace, IngestKeys keys) : ControllerBase
{
    public const int MaxRows = 10_000;

    public const long MaxBatchBytes = 10L << 20;

    private const int MaxColumns = 1_000;

    private const int MaxColumnNameLength = 255;

    private const int MaxBatchIdLength = 100;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };

    private static readonly string OriginRule = $"An origin is {Source.MaxOriginLength} characters at most.";

    /// <summary>Names the key the request carries, so a caller can check its key before writing.</summary>
    [HttpGet("/ingest")]
    public async Task<ActionResult<CallerKeyView>> Key(CancellationToken ct) =>
        await keys.FromAsync(Request, ct) is { } key ? new CallerKeyView(key.Name, key.Prefix) : NoKey();

    /// <summary>Makes a source, or adds columns to one. Changing a column's type, or the key, takes a replacement.</summary>
    [HttpPut]
    public async Task<ActionResult<IngestSourceView>> Define(string name, IngestSchemaRequest request, CancellationToken ct)
    {
        if (await keys.FromAsync(Request, ct) is not { } key)
        {
            return NoKey();
        }

        if (!Source.IsValidName(name))
        {
            return Problem(Source.NameRule, statusCode: StatusCodes.Status400BadRequest);
        }

        if (Parse(request, out var problem) is not { } schema)
        {
            return Problem(problem, statusCode: StatusCodes.Status400BadRequest);
        }

        if (!OriginOf(request, out var origin))
        {
            return Problem(OriginRule, statusCode: StatusCodes.Status400BadRequest);
        }

        var source = await db.Sources.FirstOrDefaultAsync(s => s.Name == name, ct);
        if (source is null)
        {
            source = new Source
            {
                Name = name,
                Pushed = true,
                IngestKeyId = key.Id,
                Origin = origin,
                Columns = ColumnInfo.Serialize(Infos(schema.Columns)),
                PrimaryKey = JsonSerializer.Serialize(schema.PrimaryKey),
            };
            // A table with this name and no source holds no one's rows, so the new source starts without them.
            await workspace.DropSourceAsync(name, ct);
            await workspace.CreatePushedAsync(name, schema.Columns, ct);
            db.Sources.Add(source);
        }
        else
        {
            if (Admit(source, key) is { } refused)
            {
                return refused;
            }

            source.Origin = origin ?? source.Origin;

            var existing = ColumnInfo.Deserialize(source.Columns);
            var declared = schema.Columns.ToDictionary(column => column.Name, StringComparer.OrdinalIgnoreCase);
            var changed = existing.FirstOrDefault(column => !declared.TryGetValue(column.Name, out var match) || match.Type != column.Type);
            if (changed is not null || !KeyOf(source).SequenceEqual(schema.PrimaryKey, StringComparer.OrdinalIgnoreCase))
            {
                var what = changed is null ? "the key" : $"column '{changed.Name}'";
                return Problem(
                    $"Changing or removing {what} takes a replacement: POST /ingest/sources/{name}/replace with the new columns.",
                    statusCode: StatusCodes.Status409Conflict);
            }

            await workspace.CreatePushedAsync(name, schema.Columns, ct);
            source.Columns = ColumnInfo.Serialize(Infos(schema.Columns));
        }

        await db.SaveChangesAsync(ct);
        return View(source);
    }

    /// <summary>Appends a batch, or merges it by the source's key, into the source or its replacement.</summary>
    [HttpPost("batches")]
    [RequestSizeLimit(MaxBatchBytes)]
    public async Task<ActionResult<IngestBatchView>> Batch(string name, IngestBatchRequest request, CancellationToken ct)
    {
        if (await keys.FromAsync(Request, ct) is not { } key)
        {
            return NoKey();
        }

        var (source, missing) = await SourceAsync(name, key, ct);
        if (missing is not null)
        {
            return missing;
        }

        var replacement = Replacement(source);
        var columns = replacement?.Columns ?? ColumnInfo.Deserialize(source.Columns);
        var primaryKey = replacement?.PrimaryKey ?? KeyOf(source);
        var merge = request.Mode switch
        {
            null or "append" => (bool?)false,
            "merge" => true,
            _ => null,
        };

        var rows = request.Rows ?? [];
        string? invalid =
            merge is null ? "A batch's mode is append or merge."
            : merge == true && primaryKey.Count == 0 ? $"'{name}' has no key to merge on. Declare primaryKey, or append."
            : rows.Count > MaxRows ? $"A batch holds up to {MaxRows:N0} rows; this one holds {rows.Count:N0}."
            : request.Id is { Length: > MaxBatchIdLength } ? $"A batch id is {MaxBatchIdLength} characters at most."
            : null;
        if (invalid is not null)
        {
            return Problem(invalid, statusCode: StatusCodes.Status400BadRequest);
        }

        var keyColumns = primaryKey.ToHashSet(StringComparer.OrdinalIgnoreCase);
        List<object?[]> values;
        try
        {
            values = [.. rows.Select((row, i) => IngestValues.Row(row, columns, keyColumns, i + 1))];
        }
        catch (InvalidIngestException ex)
        {
            return Problem(ex.Message, statusCode: StatusCodes.Status400BadRequest);
        }

        var written = await workspace.WriteBatchAsync(name, replacement is not null, columns, primaryKey, request.Id, merge == true, values, ct);
        if (written && replacement is null)
        {
            source.RowCount = await workspace.RowCountAsync(name, ct);
            source.SyncedAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(ct);
        return new IngestBatchView(source.RowCount, Skipped: !written);
    }

    /// <summary>
    /// Starts a replacement: batches after it go to a staging table, with these columns and key or the source's own,
    /// until a commit swaps it in. Starting one again begins it afresh.
    /// </summary>
    [HttpPost("replace")]
    public async Task<ActionResult<IngestSourceView>> Replace(
        string name,
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] IngestSchemaRequest? request,
        CancellationToken ct)
    {
        if (await keys.FromAsync(Request, ct) is not { } key)
        {
            return NoKey();
        }

        if (!OriginOf(request, out var origin))
        {
            return Problem(OriginRule, statusCode: StatusCodes.Status400BadRequest);
        }

        var (source, missing) = await SourceAsync(name, key, ct);
        if (missing is not null)
        {
            return missing;
        }

        source.Origin = origin ?? source.Origin;
        PendingSchema replacement;
        if (request?.Columns is null)
        {
            await workspace.StartReplacementAsync(name, null, ct);
            replacement = new PendingSchema(ColumnInfo.Deserialize(source.Columns), KeyOf(source));
        }
        else
        {
            if (Parse(request, out var problem) is not { } schema)
            {
                return Problem(problem, statusCode: StatusCodes.Status400BadRequest);
            }

            await workspace.StartReplacementAsync(name, schema.Columns, ct);
            replacement = new PendingSchema(Infos(schema.Columns), schema.PrimaryKey);
        }

        source.Replacement = JsonSerializer.Serialize(replacement, Json);
        await db.SaveChangesAsync(ct);
        return View(source);
    }

    /// <summary>Swaps a replacement in, or confirms the batches so far, and answers the source with its row count.</summary>
    [HttpPost("commit")]
    public async Task<ActionResult<IngestSourceView>> Commit(string name, CancellationToken ct)
    {
        if (await keys.FromAsync(Request, ct) is not { } key)
        {
            return NoKey();
        }

        var (source, missing) = await SourceAsync(name, key, ct);
        if (missing is not null)
        {
            return missing;
        }

        if (Replacement(source) is { } replacement)
        {
            source.RowCount = await workspace.CommitReplacementAsync(name, ct);
            source.Columns = ColumnInfo.Serialize(replacement.Columns);
            source.PrimaryKey = JsonSerializer.Serialize(replacement.PrimaryKey);
            source.Replacement = null;
        }
        else
        {
            source.RowCount = await workspace.RowCountAsync(name, ct);
        }

        source.SyncedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return View(source);
    }

    private static IReadOnlyList<ColumnInfo> Infos(IEnumerable<IngestColumn> columns) =>
        [.. columns.Select(column => new ColumnInfo(column.Name, column.Type))];

    private static List<string> KeyOf(Source source) =>
        source.PrimaryKey is null ? [] : JsonSerializer.Deserialize<List<string>>(source.PrimaryKey) ?? [];

    private static PendingSchema? Replacement(Source source) =>
        source.Replacement is null ? null : JsonSerializer.Deserialize<PendingSchema>(source.Replacement, Json);

    private static IngestSourceView View(Source source) =>
        new(source.Name, ColumnInfo.Deserialize(source.Columns), KeyOf(source), source.RowCount, source.Replacement is not null);

    /// <summary>The columns and key a request declares, or null with the reason they cannot be used.</summary>
    private static (IReadOnlyList<IngestColumn> Columns, IReadOnlyList<string> PrimaryKey)? Parse(IngestSchemaRequest request, out string problem)
    {
        problem = string.Empty;
        var requested = request.Columns ?? [];
        if (requested.Count is 0 or > MaxColumns)
        {
            problem = $"A source declares 1 to {MaxColumns:N0} columns.";
            return null;
        }

        var columns = new List<IngestColumn>();
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var column in requested)
        {
            var name = column.Name?.Trim();
            if (string.IsNullOrEmpty(name) || name.Length > MaxColumnNameLength)
            {
                problem = $"Every column needs a name of {MaxColumnNameLength} characters or fewer.";
                return null;
            }

            // Scry's own queries name their working columns __scry_, and its tables _scry_.
            if (name.StartsWith("_scry", StringComparison.OrdinalIgnoreCase) || name.StartsWith("__scry", StringComparison.OrdinalIgnoreCase))
            {
                problem = $"'{name}': a column name cannot start with _scry or __scry, which Scry keeps for itself.";
                return null;
            }

            if (!names.Add(name))
            {
                problem = $"Two columns are both named '{name}'.";
                return null;
            }

            if (!Enum.TryParse<ColumnType>(column.Type, ignoreCase: false, out var type) || !Enum.IsDefined(type) || int.TryParse(column.Type, out _))
            {
                problem = $"'{name}' has type '{column.Type}'. A type is one of: {string.Join(", ", Enum.GetNames<ColumnType>())}.";
                return null;
            }

            if (type == ColumnType.Decimal
                && (column is { Precision: < 1 or > 38 } or { Scale: < 0 } || column.Scale > (column.Precision ?? IngestColumn.DefaultPrecision)))
            {
                problem = $"'{name}' needs a precision of 1 to 38 and a scale from 0 to its precision.";
                return null;
            }

            columns.Add(type == ColumnType.Decimal ? new IngestColumn(name, type, column.Precision, column.Scale) : new IngestColumn(name, type));
        }

        var key = request.PrimaryKey ?? [];
        if (key.FirstOrDefault(name => !columns.Any(column => column.Name == name)) is { } unknown)
        {
            problem = $"The key names '{unknown}', which is not one of the columns.";
            return null;
        }

        if (key.Distinct(StringComparer.OrdinalIgnoreCase).Count() != key.Count)
        {
            problem = "The key names a column twice.";
            return null;
        }

        return (columns, key);
    }

    /// <summary>The source <paramref name="key"/> may write to, or the problem to answer.</summary>
    private async Task<(Source Source, ActionResult? Problem)> SourceAsync(string name, IngestKey key, CancellationToken ct)
    {
        if (await db.Sources.FirstOrDefaultAsync(s => s.Name == name, ct) is not { } source)
        {
            return (null!, Problem(
                $"There is no source named '{name}'. Make it with PUT /ingest/sources/{name}.",
                statusCode: StatusCodes.Status404NotFound));
        }

        return (source, Admit(source, key));
    }

    /// <summary>
    /// The problem to answer when <paramref name="key"/> may not write to the source, or null when it may. A pushed
    /// source whose key was revoked becomes this key's, which the caller saves.
    /// </summary>
    private ObjectResult? Admit(Source source, IngestKey key)
    {
        if (!source.Pushed)
        {
            return Problem($"'{source.Name}' was not made through the push API, so no key writes to it.", statusCode: StatusCodes.Status403Forbidden);
        }

        source.IngestKeyId ??= key.Id;
        return source.IngestKeyId == key.Id
            ? null
            : Problem($"This key did not make '{source.Name}', so it cannot write to it.", statusCode: StatusCodes.Status403Forbidden);
    }

    /// <summary>The origin a request gives, trimmed, or null when it gives none; false when it is too long.</summary>
    private static bool OriginOf(IngestSchemaRequest? request, out string? origin)
    {
        origin = string.IsNullOrWhiteSpace(request?.Origin) ? null : request.Origin.Trim();
        return origin is null || origin.Length <= Source.MaxOriginLength;
    }

    private ObjectResult NoKey() =>
        Problem(
            "Send a push API key as 'Authorization: Bearer <key>'. Make one on Scry's Settings page.",
            statusCode: StatusCodes.Status401Unauthorized);

    private sealed record PendingSchema(IReadOnlyList<ColumnInfo> Columns, IReadOnlyList<string> PrimaryKey);
}
