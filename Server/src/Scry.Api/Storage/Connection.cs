namespace Scry.Api.Storage;

/// <summary>A database or a signed-in service Scry reads streams from, through one of Nexus's connectors.</summary>
public sealed class Connection
{
    public int Id { get; set; }

    /// <summary>The Nexus connector's id: <c>mysql</c>, <c>postgres</c>, <c>sqlserver</c>, or <c>schwab</c>.</summary>
    public required string Connector { get; set; }

    /// <summary>The connector's settings as JSON, password included, encrypted by ASP.NET Data Protection.</summary>
    public required string Settings { get; set; }

    /// <summary>The OAuth tokens of a signed-in service, encrypted like <see cref="Settings"/>; null for a database.</summary>
    public string? Tokens { get; set; }

    public DateTime CreatedAt { get; set; }
}
