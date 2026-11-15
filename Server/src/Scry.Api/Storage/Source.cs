using System.Text.RegularExpressions;

namespace Scry.Api.Storage;

/// <summary>How a source's last sync went.</summary>
public enum SourceStatus
{
    /// <summary>Its last sync finished, or it was uploaded.</summary>
    Ready,

    /// <summary>A sync is under way or waiting its turn.</summary>
    Syncing,

    /// <summary>Its last sync failed; <see cref="Source.Error"/> says why.</summary>
    Failed,

    /// <summary>Its last sync failed because the service ended the sign-in, so someone must sign in again.</summary>
    SignInNeeded,
}

/// <summary>
/// Data synced through Nexus into a table of the source's name in the workspace's DuckDB file: an uploaded file, or a
/// stream of a <see cref="Data.Connection"/>, such as a database table.
/// </summary>
public sealed partial class Source
{
    public const int MaxNameLength = 63;

    public const string NameRule =
        "A source name starts with a lowercase letter and holds only lowercase letters, digits, and underscores, 63 at most.";

    public static bool IsValidName(string name) => NamePattern().IsMatch(name);

    [GeneratedRegex("^[a-z][a-z0-9_]{0,62}$")]
    private static partial Regex NamePattern();

    public int Id { get; set; }

    public required string Name { get; set; }

    /// <summary>The uploaded file's name, for an upload.</summary>
    public string? FileName { get; set; }

    /// <summary>The upload's name inside the workspace's uploads directory, for an upload.</summary>
    public string? StoredFile { get; set; }

    /// <summary>The connection the stream is read from, for anything but an upload.</summary>
    public int? ConnectionId { get; set; }

    public Connection? Connection { get; set; }

    /// <summary>The stream's name, as its connector names it, such as a database's <c>public.orders</c>.</summary>
    public string? Stream { get; set; }

    /// <summary>The push API key that made the source and alone writes to it; null for any other source.</summary>
    public int? IngestKeyId { get; set; }

    public IngestKey? IngestKey { get; set; }

    /// <summary>Whether the push API made the source. Revoking its key leaves this true and the key null.</summary>
    public bool Pushed { get; set; }

    /// <summary>The columns a pushed source's merges match on, as a JSON array of names; empty when it has none.</summary>
    public string? PrimaryKey { get; set; }

    /// <summary>
    /// A pushed source's replacement under way, as JSON <c>{"columns": [...], "primaryKey": [...]}</c>: batches go to a
    /// staging table until a commit swaps it in. Null when none is.
    /// </summary>
    public string? Replacement { get; set; }

    /// <summary>
    /// Whether each sync reads on from <see cref="State"/> and merges into the table by its primary key. Otherwise each
    /// sync reads the whole stream and replaces the table.
    /// </summary>
    public bool Incremental { get; set; }

    /// <summary>The connector's last checkpoint as JSON, which the next incremental sync starts from.</summary>
    public string? State { get; set; }

    /// <summary>The table's columns as JSON: <c>[{"name": "...", "type": "Int64"}]</c>; empty until the first sync.</summary>
    public required string Columns { get; set; }

    public long RowCount { get; set; }

    /// <summary>When the last sync finished; null until the first one has.</summary>
    public DateTime? SyncedAt { get; set; }

    public SourceStatus Status { get; set; }

    /// <summary>Why the last sync failed, in words safe to show; null after one that finished.</summary>
    public string? Error { get; set; }
}
