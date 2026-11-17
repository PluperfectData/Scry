namespace Scry.Api.Storage;

/// <summary>
/// Scry's link to a Nexus instance, made by pairing: Nexus's address, the app key Nexus gave Scry, the destination its
/// rows come to, and the push key Scry gave Nexus. A workspace has at most one.
/// </summary>
public sealed class NexusLink
{
    public int Id { get; set; }

    public int WorkspaceId { get; set; }

    /// <summary>Nexus's API address, such as <c>http://localhost:6163</c>.</summary>
    public required string NexusUrl { get; set; }

    /// <summary>Scry's app key at Nexus, encrypted by ASP.NET Data Protection.</summary>
    public required string AppKey { get; set; }

    /// <summary>The destination at Nexus that pushes into Scry.</summary>
    public int DestinationId { get; set; }

    public required string AppName { get; set; }

    public required string WorkspaceName { get; set; }

    /// <summary>The push key Scry made for Nexus; null once it is revoked by hand on the Settings page.</summary>
    public int? IngestKeyId { get; set; }

    public IngestKey? IngestKey { get; set; }

    public DateTime LinkedAt { get; set; }
}
