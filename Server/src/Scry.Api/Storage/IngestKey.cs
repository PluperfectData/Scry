namespace Scry.Api.Storage;

/// <summary>
/// A key for the push API. Scry keeps only its hash, and shows the key once, when it is made. A key writes only to the
/// sources it made.
/// </summary>
public sealed class IngestKey
{
    public const int MaxNameLength = 100;

    public int Id { get; set; }

    /// <summary>The workspace whose sources the key writes.</summary>
    public int WorkspaceId { get; set; }

    public required string Name { get; set; }

    /// <summary>The key's SHA-256 hash, as lowercase hex.</summary>
    public required string Hash { get; set; }

    /// <summary>The key's first characters, so a person can tell keys apart.</summary>
    public required string Prefix { get; set; }

    public DateTime CreatedAt { get; set; }
}
