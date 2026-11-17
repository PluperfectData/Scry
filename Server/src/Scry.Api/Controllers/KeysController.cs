using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Scry.Api.Storage;

namespace Scry.Api.Controllers;

/// <summary>A push API key: its name, the prefix that tells it apart, and the sources it writes.</summary>
public sealed record IngestKeyView(int Id, string Name, string Prefix, DateTime CreatedAt, IReadOnlyList<string> Sources);

/// <summary>A key just made, with the key itself, which Scry shows only this once.</summary>
public sealed record MadeKeyView(int Id, string Name, string Prefix, DateTime CreatedAt, string Key);

public sealed record KeyRequest(string? Name);

/// <summary>A workspace's push API keys, for its editors. Each key writes only to sources in its workspace.</summary>
[ApiController]
[Route("workspaces/{workspaceId:int}/keys")]
[InWorkspace]
public sealed class KeysController(ScryDbContext db, CurrentWorkspace workspace) : ControllerBase
{
    [HttpGet]
    public async Task<IEnumerable<IngestKeyView>> List(CancellationToken ct)
    {
        var keys = await db.IngestKeys.AsNoTracking().Where(key => key.WorkspaceId == workspace.Id).OrderBy(key => key.Name).ToListAsync(ct);
        var sources = (await db.Sources.AsNoTracking()
                .Where(source => source.WorkspaceId == workspace.Id && source.IngestKeyId != null)
                .Select(source => new { source.IngestKeyId, source.Name })
                .ToListAsync(ct))
            .ToLookup(source => source.IngestKeyId, source => source.Name);

        return keys.Select(key => new IngestKeyView(key.Id, key.Name, key.Prefix, key.CreatedAt, [.. sources[key.Id].Order()]));
    }

    [HttpPost]
    public async Task<ActionResult<MadeKeyView>> Make(KeyRequest request, CancellationToken ct)
    {
        var name = request.Name?.Trim();
        if (string.IsNullOrEmpty(name) || name.Length > IngestKey.MaxNameLength)
        {
            return Problem(
                $"A key needs a name of {IngestKey.MaxNameLength} characters or fewer.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        var (secret, hash, prefix) = IngestKeys.Make();
        var key = new IngestKey { WorkspaceId = workspace.Id, Name = name, Hash = hash, Prefix = prefix, CreatedAt = DateTime.UtcNow };
        db.IngestKeys.Add(key);
        await db.SaveChangesAsync(ct);
        return new MadeKeyView(key.Id, key.Name, key.Prefix, key.CreatedAt, secret);
    }

    /// <summary>Revokes a key. The sources it made stay, and no key writes to them.</summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Revoke(int id, CancellationToken ct)
    {
        if (await db.IngestKeys.FirstOrDefaultAsync(k => k.Id == id && k.WorkspaceId == workspace.Id, ct) is not { } key)
        {
            return NotFound();
        }

        foreach (var source in await db.Sources.Where(source => source.IngestKeyId == id).ToListAsync(ct))
        {
            source.IngestKeyId = null;
        }

        db.IngestKeys.Remove(key);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
