using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Scry.Api.Auth;
using Scry.Api.Storage;

namespace Scry.Api.Controllers;

/// <summary>A workspace, with the caller's role in it.</summary>
public sealed record WorkspaceView(int Id, string Name, WorkspaceRole Role, DateTime CreatedAt);

public sealed record MemberView(int UserId, string Email, WorkspaceRole Role);

/// <summary>A workspace, with the caller's role in it, and its members for an admin: null for anyone else.</summary>
public sealed record WorkspaceDetail(int Id, string Name, WorkspaceRole Role, DateTime CreatedAt, IReadOnlyList<MemberView>? Members);

/// <summary>A workspace's name: a new one, or the name typed to remove it.</summary>
public sealed record WorkspaceRequest(string? Name);

public sealed record MemberRequest(WorkspaceRole? Role);

/// <summary>
/// Workspaces: every one for an admin, and a member's own for a member. Admins make, rename, and remove them, and choose
/// their members and each member's role.
/// </summary>
[ApiController]
[Route("workspaces")]
public sealed class WorkspacesController(
    ScryDbContext db,
    WorkspaceAccess access,
    WorkspaceStore store,
    NexusApi nexus,
    Secrets secrets,
    OperatorLog log,
    TimeProvider time) : ControllerBase
{
    [HttpGet]
    public async Task<IEnumerable<WorkspaceView>> List(CancellationToken ct)
    {
        if (User.IsAdmin())
        {
            return await db.Workspaces
                .OrderBy(w => w.Name)
                .Select(w => new WorkspaceView(w.Id, w.Name, WorkspaceRole.Editor, w.CreatedAt))
                .ToListAsync(ct);
        }

        var userId = User.UserId();
        return await db.WorkspaceMembers
            .Where(m => m.UserId == userId)
            .OrderBy(m => m.Workspace!.Name)
            .Select(m => new WorkspaceView(m.WorkspaceId, m.Workspace!.Name, m.Role, m.Workspace.CreatedAt))
            .ToListAsync(ct);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<WorkspaceDetail>> Get(int id, CancellationToken ct) =>
        await access.FindAsync(User, id, ct) is { } found ? await DetailAsync(found.Workspace, found.Role, ct) : NotFound();

    [HttpPost]
    [Authorize(Policy = ScryClaims.AdminPolicy)]
    public async Task<ActionResult<WorkspaceDetail>> Make(WorkspaceRequest request, CancellationToken ct)
    {
        if (NameOf(request) is not { } name)
        {
            return NameProblem();
        }

        // The folder is named for the id, which the database gives only on insert.
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var workspace = new Workspace { Name = name, Folder = Guid.NewGuid().ToString("N"), CreatedAt = time.GetUtcNow().UtcDateTime };
        db.Workspaces.Add(workspace);
        log.Info($"Workspace {name} was made.", LogPlace.In(workspace));
        await db.SaveChangesAsync(ct);
        workspace.Folder = workspace.Id.ToString(CultureInfo.InvariantCulture);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return StatusCode(StatusCodes.Status201Created, await DetailAsync(workspace, WorkspaceRole.Editor, ct));
    }

    [HttpPatch("{id:int}")]
    [Authorize(Policy = ScryClaims.AdminPolicy)]
    public async Task<ActionResult<WorkspaceDetail>> Rename(int id, WorkspaceRequest request, CancellationToken ct)
    {
        if (await db.Workspaces.FirstOrDefaultAsync(w => w.Id == id, ct) is not { } workspace)
        {
            return NotFound();
        }

        if (NameOf(request) is not { } name)
        {
            return NameProblem();
        }

        if (workspace.Name != name)
        {
            log.Info($"Workspace {workspace.Name} was renamed {name}.", LogPlace.In(workspace.Id));
        }

        workspace.Name = name;
        await db.SaveChangesAsync(ct);
        return await DetailAsync(workspace, WorkspaceRole.Editor, ct);
    }

    /// <summary>
    /// Removes the workspace once its name is typed: its dashboards, sources, push keys, and Nexus link, and its folder,
    /// with the DuckDB file and uploads. Nexus is asked to revoke the link's app key.
    /// </summary>
    [HttpDelete("{id:int}")]
    [Authorize(Policy = ScryClaims.AdminPolicy)]
    public async Task<IActionResult> Remove(int id, [FromBody] WorkspaceRequest request, CancellationToken ct)
    {
        if (await db.Workspaces.AsNoTracking().FirstOrDefaultAsync(w => w.Id == id, ct) is not { } workspace)
        {
            return NotFound();
        }

        if (request.Name?.Trim() != workspace.Name)
        {
            return Problem($"Type the workspace's name, {workspace.Name}, to remove it.", statusCode: StatusCodes.Status400BadRequest);
        }

        if (await db.NexusLinks.AsNoTracking().FirstOrDefaultAsync(l => l.WorkspaceId == id, ct) is { } link)
        {
            try
            {
                await nexus.RevokeKeyAsync(link.NexusUrl, secrets.UnprotectText(link.AppKey), ct);
            }
            catch (NexusException)
            {
                // As unlinking does: the key stops mattering once Scry forgets it, and an admin can revoke it at Nexus.
            }
        }

        // Sources first, since they point at the keys.
        await using (var transaction = await db.Database.BeginTransactionAsync(ct))
        {
            await db.Sources.Where(s => s.WorkspaceId == id).ExecuteDeleteAsync(ct);
            await db.NexusLinks.Where(l => l.WorkspaceId == id).ExecuteDeleteAsync(ct);
            await db.IngestKeys.Where(k => k.WorkspaceId == id).ExecuteDeleteAsync(ct);
            await db.Dashboards.Where(d => d.WorkspaceId == id).ExecuteDeleteAsync(ct);
            await db.Workspaces.Where(w => w.Id == id).ExecuteDeleteAsync(ct);
            log.Info($"Workspace {workspace.Name} was removed, with its dashboards, sources, push keys, Nexus link, and files.", LogPlace.Instance);
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
        }

        await store.DeleteAsync(workspace.Folder, CancellationToken.None);
        return NoContent();
    }

    /// <summary>Adds a user to the workspace with a role, or changes their role.</summary>
    [HttpPut("{id:int}/members/{userId:int}")]
    [Authorize(Policy = ScryClaims.AdminPolicy)]
    public async Task<ActionResult<WorkspaceDetail>> SetMember(int id, int userId, MemberRequest request, CancellationToken ct)
    {
        if (request.Role is not { } role || !Enum.IsDefined(role))
        {
            return Problem("A member is an Editor or a Viewer.", statusCode: StatusCodes.Status400BadRequest);
        }

        var workspace = await db.Workspaces.AsNoTracking().FirstOrDefaultAsync(w => w.Id == id, ct);
        var email = await db.Users.Where(u => u.Id == userId).Select(u => u.Email).FirstOrDefaultAsync(ct);
        if (workspace is null || email is null)
        {
            return NotFound();
        }

        var asRole = role == WorkspaceRole.Editor ? "an editor" : "a viewer";
        if (await db.WorkspaceMembers.FirstOrDefaultAsync(m => m.WorkspaceId == id && m.UserId == userId, ct) is { } member)
        {
            if (member.Role != role)
            {
                log.Info($"{email} is now {asRole} in workspace {workspace.Name}.", LogPlace.In(id));
            }

            member.Role = role;
        }
        else
        {
            db.WorkspaceMembers.Add(new WorkspaceMember { WorkspaceId = id, UserId = userId, Role = role });
            log.Info($"{email} was added to workspace {workspace.Name} as {asRole}.", LogPlace.In(id));
        }

        await db.SaveChangesAsync(ct);
        return await DetailAsync(workspace, WorkspaceRole.Editor, ct);
    }

    [HttpDelete("{id:int}/members/{userId:int}")]
    [Authorize(Policy = ScryClaims.AdminPolicy)]
    public async Task<ActionResult<WorkspaceDetail>> RemoveMember(int id, int userId, CancellationToken ct)
    {
        if (await db.Workspaces.AsNoTracking().FirstOrDefaultAsync(w => w.Id == id, ct) is not { } workspace)
        {
            return NotFound();
        }

        var email = await db.Users.Where(u => u.Id == userId).Select(u => u.Email).FirstOrDefaultAsync(ct);
        if (await db.WorkspaceMembers.Where(m => m.WorkspaceId == id && m.UserId == userId).ExecuteDeleteAsync(ct) > 0)
        {
            log.Info($"{email} was taken out of workspace {workspace.Name}.", LogPlace.In(id));
            await db.SaveChangesAsync(ct);
        }

        return await DetailAsync(workspace, WorkspaceRole.Editor, ct);
    }

    private async Task<WorkspaceDetail> DetailAsync(Workspace workspace, WorkspaceRole role, CancellationToken ct)
    {
        List<MemberView>? members = null;
        if (User.IsAdmin())
        {
            members = await db.WorkspaceMembers
                .Where(m => m.WorkspaceId == workspace.Id)
                .Select(m => new MemberView(m.UserId, m.User!.Email, m.Role))
                .ToListAsync(ct);
            members.Sort((a, b) => string.CompareOrdinal(a.Email, b.Email));
        }

        return new WorkspaceDetail(workspace.Id, workspace.Name, role, workspace.CreatedAt, members);
    }

    private static string? NameOf(WorkspaceRequest request) =>
        request.Name?.Trim() is { Length: > 0 and <= Workspace.MaxNameLength } name ? name : null;

    private ObjectResult NameProblem() =>
        Problem($"A workspace needs a name of {Workspace.MaxNameLength} characters or fewer.", statusCode: StatusCodes.Status400BadRequest);
}
