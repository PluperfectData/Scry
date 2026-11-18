using System.Text.RegularExpressions;

namespace Scry.Api.Storage;

/// <summary>
/// Rows in a table of the source's name in the workspace's DuckDB file: an uploaded file, read through Nexus's CSV
/// connector, or rows sent through the push API.
/// </summary>
public sealed partial class Source
{
    public const int MaxNameLength = 63;

    public const int MaxOriginLength = 500;

    public const string NameRule =
        "A source name starts with a lowercase letter and holds only lowercase letters, digits, and underscores, 63 at most.";

    public static bool IsValidName(string name) => NamePattern().IsMatch(name);

    [GeneratedRegex("^[a-z][a-z0-9_]{0,62}$")]
    private static partial Regex NamePattern();

    public int Id { get; set; }

    public int WorkspaceId { get; set; }

    public required string Name { get; set; }

    /// <summary>The uploaded file's name, for an upload.</summary>
    public string? FileName { get; set; }

    /// <summary>The upload's name inside the workspace's uploads directory, for an upload.</summary>
    public string? StoredFile { get; set; }

    /// <summary>The push API key that made the source and alone writes to it; null for any other source.</summary>
    public int? IngestKeyId { get; set; }

    public IngestKey? IngestKey { get; set; }

    /// <summary>Whether the push API made the source. Revoking its key leaves this true and the key null.</summary>
    public bool Pushed { get; set; }

    /// <summary>Where a pushed source's rows come from, as the last push to say so put it, such as a Nexus connection's stream.</summary>
    public string? Origin { get; set; }

    /// <summary>The columns a pushed source's merges match on, as a JSON array of names; empty when it has none.</summary>
    public string? PrimaryKey { get; set; }

    /// <summary>
    /// A pushed source's replacement under way, as JSON <c>{"columns": [...], "primaryKey": [...]}</c>: batches go to a
    /// staging table until a commit swaps it in. Null when none is.
    /// </summary>
    public string? Replacement { get; set; }

    /// <summary>The table's columns as JSON: <c>[{"name": "...", "type": "Int64"}]</c>; empty until the first rows.</summary>
    public required string Columns { get; set; }

    public long RowCount { get; set; }

    /// <summary>When rows last landed, by upload or by push; null until the first have.</summary>
    public DateTime? SyncedAt { get; set; }
}
