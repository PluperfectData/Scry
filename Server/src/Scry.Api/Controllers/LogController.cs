using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Scry.Api.Auth;
using Scry.Api.Storage;

namespace Scry.Api.Controllers;

/// <summary>An operator log entry. <c>WorkspaceId</c> is null for an entry about the whole instance.</summary>
public sealed record LogEntryView(
    long Id,
    DateTime At,
    EntryLevel Level,
    string Text,
    string? Actor,
    int? WorkspaceId,
    string? WorkspaceName,
    int? SourceId);

/// <summary>
/// A page of entries, newest first. <c>Next</c> is the <c>before</c> that reads the older ones, or null at the end.
/// <c>Subject</c> names the source filtered by.
/// </summary>
public sealed record LogPage(IReadOnlyList<LogEntryView> Entries, long? Next, string? Subject);

/// <summary>
/// The operator log, for signed-in users: an admin reads every entry, and anyone else the entries of the workspaces they
/// edit. A viewer reads none.
/// </summary>
[ApiController]
[Route("log")]
public sealed class LogController(ScryDbContext db, WorkspaceAccess access) : ControllerBase
{
    public const int PageSize = 100;

    /// <summary>
    /// Entries newest first. <paramref name="instance"/> picks the entries about the whole instance, for admins.
    /// <paramref name="level"/> Warning reads warnings and errors.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<LogPage>> Get(
        int? workspace,
        int? source,
        EntryLevel? level,
        long? before,
        bool? instance,
        CancellationToken ct)
    {
        var entries = db.LogEntries.AsNoTracking();
        if (!User.IsAdmin())
        {
            if (instance == true)
            {
                return NotFound();
            }

            var userId = User.UserId();
            var edited = db.WorkspaceMembers
                .Where(m => m.UserId == userId && m.Role == WorkspaceRole.Editor)
                .Select(m => (int?)m.WorkspaceId);
            entries = entries.Where(e => edited.Contains(e.WorkspaceId));
        }

        if (workspace is { } workspaceId)
        {
            if (!await EditsAsync(workspaceId, ct))
            {
                return NotFound();
            }

            entries = entries.Where(e => e.WorkspaceId == workspaceId);
        }

        if (instance == true)
        {
            entries = entries.Where(e => e.WorkspaceId == null);
        }

        string? subject = null;
        if (source is { } sourceId)
        {
            var found = await db.Sources.AsNoTracking().FirstOrDefaultAsync(s => s.Id == sourceId, ct);
            if (found is null || !await EditsAsync(found.WorkspaceId, ct))
            {
                return NotFound();
            }

            subject = $"Source {found.Name}";
            entries = entries.Where(e => e.SourceId == sourceId);
        }

        entries = level switch
        {
            EntryLevel.Error => entries.Where(e => e.Level == EntryLevel.Error),
            EntryLevel.Warning => entries.Where(e => e.Level != EntryLevel.Information),
            _ => entries,
        };

        if (before is { } cursor)
        {
            entries = entries.Where(e => e.Id < cursor);
        }

        var page = await entries
            .OrderByDescending(e => e.Id)
            .Take(PageSize + 1)
            .Select(e => new LogEntryView(
                e.Id,
                e.At,
                e.Level,
                e.Text,
                e.Actor,
                e.WorkspaceId,
                e.Workspace == null ? null : e.Workspace.Name,
                e.SourceId))
            .ToListAsync(ct);
        var more = page.Count > PageSize;
        if (more)
        {
            page.RemoveAt(PageSize);
        }

        return new LogPage(page, more ? page[^1].Id : null, subject);
    }

    private async Task<bool> EditsAsync(int workspaceId, CancellationToken ct) =>
        await access.FindAsync(User, workspaceId, ct) is { Role: WorkspaceRole.Editor };
}
