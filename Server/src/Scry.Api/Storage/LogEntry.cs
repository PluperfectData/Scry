namespace Scry.Api.Storage;

public enum EntryLevel
{
    Information,
    Warning,
    Error,
}

/// <summary>One line of the operator log: something that happened, in a sentence for whoever runs the instance.</summary>
public sealed class LogEntry
{
    public const int MaxTextLength = 1000;

    // An email, or "key " and a key's name, which is shorter.
    public const int MaxActorLength = User.MaxEmailLength;

    public long Id { get; set; }

    public DateTime At { get; set; }

    public EntryLevel Level { get; set; }

    public string Text { get; set; } = string.Empty;

    /// <summary>The user's email, or "key" and the push key's name. Null for Scry's own work.</summary>
    public string? Actor { get; set; }

    /// <summary>Null for an entry about the whole instance, which only admins see.</summary>
    public int? WorkspaceId { get; set; }

    public Workspace? Workspace { get; set; }

    public int? SourceId { get; set; }

    public Source? Source { get; set; }

    /// <summary>Set when the entry is added, until the developer log has it. Not stored.</summary>
    public bool Pending { get; set; }
}
