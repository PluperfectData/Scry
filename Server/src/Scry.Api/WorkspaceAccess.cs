using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Scry.Api.Auth;
using Scry.Api.Storage;

namespace Scry.Api;

/// <summary>What a user may do in each workspace: an admin edits every one, and a member has their role in theirs.</summary>
public sealed class WorkspaceAccess(ScryDbContext db)
{
    /// <summary>The user's role in the workspace, or null when it does not exist or they are not in it.</summary>
    public async Task<(Workspace Workspace, WorkspaceRole Role)?> FindAsync(ClaimsPrincipal user, int workspaceId, CancellationToken ct)
    {
        if (await db.Workspaces.AsNoTracking().FirstOrDefaultAsync(w => w.Id == workspaceId, ct) is not { } workspace)
        {
            return null;
        }

        if (user.IsAdmin())
        {
            return (workspace, WorkspaceRole.Editor);
        }

        var userId = user.UserId();
        var role = await db.WorkspaceMembers
            .Where(m => m.WorkspaceId == workspaceId && m.UserId == userId)
            .Select(m => (WorkspaceRole?)m.Role)
            .FirstOrDefaultAsync(ct);
        return role is { } found ? (workspace, found) : null;
    }
}

/// <summary>The workspace a request's route names, once <see cref="WorkspaceFilter"/> has let the caller in.</summary>
public sealed class CurrentWorkspace
{
    private Workspace? _workspace;

    public int Id => Workspace.Id;

    public Workspace Workspace => _workspace ?? throw new InvalidOperationException("The route is not in a workspace.");

    public WorkspaceRole Role { get; private set; }

    public WorkspaceData Data { get; private set; } = null!;

    internal void Enter(Workspace workspace, WorkspaceRole role, WorkspaceData data)
    {
        _workspace = workspace;
        Role = role;
        Data = data;
    }
}

/// <summary>
/// Puts a controller's routes in the workspace its <c>{workspaceId}</c> names. A caller outside it gets 404, and a
/// viewer gets 403 on every action not marked <see cref="ForViewersAttribute"/>.
/// </summary>
[AttributeUsage(AttributeTargets.Class)]
public sealed class InWorkspaceAttribute() : TypeFilterAttribute(typeof(WorkspaceFilter));

/// <summary>Lets a workspace's viewers use an action, which only reads.</summary>
[AttributeUsage(AttributeTargets.Method)]
public sealed class ForViewersAttribute : Attribute;

public sealed class WorkspaceFilter(WorkspaceAccess access, CurrentWorkspace current, WorkspaceStore store, ProblemDetailsFactory problems)
    : IAsyncActionFilter
{
    public const string RouteKey = "workspaceId";

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var http = context.HttpContext;
        if (!int.TryParse(context.RouteData.Values[RouteKey]?.ToString(), out var id)
            || await access.FindAsync(http.User, id, http.RequestAborted) is not { } found)
        {
            context.Result = Refuse(http, StatusCodes.Status404NotFound, "There is no such workspace, or you are not in it.");
            return;
        }

        var (workspace, role) = found;
        if (role == WorkspaceRole.Viewer && !context.ActionDescriptor.EndpointMetadata.OfType<ForViewersAttribute>().Any())
        {
            context.Result = Refuse(http, StatusCodes.Status403Forbidden, $"You are a viewer in {workspace.Name}. Only its editors make changes.");
            return;
        }

        current.Enter(workspace, role, store.For(workspace));
        await next();
    }

    private ObjectResult Refuse(HttpContext http, int status, string detail) =>
        new(problems.CreateProblemDetails(http, status, detail: detail)) { StatusCode = status };
}
