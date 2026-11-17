using System.Collections.Concurrent;
using Scry.Api.Storage;

namespace Scry.Api;

/// <summary>Each workspace's files under <c>data/workspaces</c>: one <see cref="WorkspaceData"/> per folder, so each DuckDB file has one lock.</summary>
public sealed class WorkspaceStore(ScrySettings settings, IHostEnvironment environment) : IDisposable
{
    private readonly ConcurrentDictionary<string, WorkspaceData> _open = new(StringComparer.Ordinal);

    private readonly string _root = Path.GetFullPath(Path.Combine(environment.ContentRootPath, settings.DataDirectory, "workspaces"));

    public WorkspaceData For(Workspace workspace) => For(workspace.Folder);

    public WorkspaceData For(string folder) => _open.GetOrAdd(folder, name => new WorkspaceData(Path.Combine(_root, name)));

    /// <summary>Deletes a workspace's folder.</summary>
    public async Task DeleteAsync(string folder, CancellationToken ct)
    {
        await For(folder).DeleteAsync(ct);
        _open.TryRemove(folder, out _);
    }

    public void Dispose()
    {
        foreach (var data in _open.Values)
        {
            data.Dispose();
        }
    }
}
