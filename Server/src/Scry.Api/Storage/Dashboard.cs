namespace Scry.Api.Storage;

/// <summary>A dashboard page. The client owns the shape of its layouts and widgets; the API stores them as JSON.</summary>
public sealed class Dashboard
{
    public const int MaxNameLength = 200;

    public int Id { get; set; }

    public int WorkspaceId { get; set; }

    public required string Name { get; set; }

    /// <summary>One react-grid-layout layout per breakpoint, as a JSON object.</summary>
    public required string Layouts { get; set; }

    /// <summary>The widgets, as a JSON array.</summary>
    public required string Widgets { get; set; }

    /// <summary>
    /// True for the dashboard a workspace opens in place of its list, and null for every other. A unique index on the
    /// workspace and this allows one true in each, since any number of rows may share null.
    /// </summary>
    public bool? Landing { get; set; }

    /// <summary>How the dashboard's data scrolls in full screen, as a JSON object the client owns; null for the defaults.</summary>
    public string? Presentation { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }
}
