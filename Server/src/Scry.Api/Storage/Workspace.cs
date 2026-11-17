namespace Scry.Api.Storage;

/// <summary>What a member may do in a workspace. An admin is an editor in every workspace.</summary>
public enum WorkspaceRole
{
    /// <summary>Changes the workspace's dashboards, sources, push keys, and Nexus link.</summary>
    Editor,

    /// <summary>Opens the workspace's dashboards, and changes nothing.</summary>
    Viewer,
}

/// <summary>Dashboards, sources, push keys, and a Nexus link, with their own DuckDB file under <see cref="Folder"/>.</summary>
public sealed class Workspace
{
    public const int MaxNameLength = 200;

    public int Id { get; set; }

    public required string Name { get; set; }

    /// <summary>The folder under <c>data/workspaces</c> that holds the DuckDB file and the uploads.</summary>
    public required string Folder { get; set; }

    public DateTime CreatedAt { get; set; }
}

public sealed class WorkspaceMember
{
    public int WorkspaceId { get; set; }

    public Workspace? Workspace { get; set; }

    public int UserId { get; set; }

    public User? User { get; set; }

    public WorkspaceRole Role { get; set; }
}
