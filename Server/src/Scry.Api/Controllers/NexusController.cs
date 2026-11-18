using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Scry.Api.Storage;

namespace Scry.Api.Controllers;

/// <summary>Scry's link to Nexus, with the push key Nexus sends rows with, or <c>Linked: false</c>.</summary>
public sealed record NexusLinkView(
    bool Linked,
    string? NexusUrl,
    string? AppName,
    string? WorkspaceName,
    string? PushKeyName,
    string? PushKeyPrefix,
    DateTime? LinkedAt);

public sealed record PairingStart(string? NexusUrl);

public sealed record ConnectRequest(string? Connector);

public sealed record PairingStarted(string ApproveUrl);

/// <summary>
/// Links a workspace to a Nexus instance by pairing, with nothing copied by hand: Scry asks Nexus, an admin approves at
/// Nexus, and Nexus's callback lands here, where Scry claims the pairing, trading a push key for an app key. Each
/// workspace pairs on its own, and only its editors see or change its link.
/// </summary>
[ApiController]
[Route("workspaces/{workspaceId:int}/nexus")]
[InWorkspace]
public sealed class NexusController(
    ScryDbContext db,
    CurrentWorkspace workspace,
    NexusApi nexus,
    NexusPairings pairings,
    NexusSignIns signIns,
    Secrets secrets,
    Instance instance,
    OperatorLog log) : ControllerBase
{
    [HttpGet]
    public async Task<NexusLinkView> Get(CancellationToken ct) =>
        await Link().AsNoTracking().Include(l => l.IngestKey).FirstOrDefaultAsync(ct) is { } link
            ? new NexusLinkView(true, link.NexusUrl, link.AppName, link.WorkspaceName, link.IngestKey?.Name, link.IngestKey?.Prefix, link.LinkedAt)
            : new NexusLinkView(false, null, null, null, null, null, null);

    /// <summary>Opens a pairing at the Nexus instance named, and answers the page where its admin approves it.</summary>
    [HttpPost("pairing")]
    public async Task<ActionResult<PairingStarted>> Pair(PairingStart request, CancellationToken ct)
    {
        if (await Link().AnyAsync(ct))
        {
            return Problem($"{workspace.Workspace.Name} is linked to Nexus already. Unlink it first.", statusCode: StatusCodes.Status409Conflict);
        }

        var url = request.NexusUrl?.Trim().TrimEnd('/');
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            return Problem("Enter Nexus's address, such as http://localhost:6163.", statusCode: StatusCodes.Status400BadRequest);
        }

        var verifier = Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));
        var api = instance.Api;
        try
        {
            var opened = await nexus.OpenPairingAsync(
                url!,
                new
                {
                    appName = $"Scry at {new Uri(api).Authority}, workspace {workspace.Workspace.Name}",
                    ingestUrl = $"{api}/ingest",
                    callbackUrl = $"{api}/workspaces/{workspace.Id}/nexus/callback",
                    connectReturnUrl = SourcesPage,
                    verifierHash = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(verifier))),
                },
                ct);
            pairings.Start(opened.Id, new PendingPairing(url!, verifier, workspace.Id));
            return new PairingStarted(opened.ApproveUrl);
        }
        catch (NexusException ex)
        {
            return Problem(ex.Message, statusCode: StatusCodes.Status502BadGateway);
        }
    }

    /// <summary>
    /// Where Nexus sends the admin back. Scry makes a push key for Nexus, claims the pairing with it, keeps the link,
    /// and goes back to the Settings page, with the reason in the address when linking failed.
    /// </summary>
    [HttpGet("callback")]
    public async Task<IActionResult> Callback(string? pairing, string? error, CancellationToken ct)
    {
        if (error is not null)
        {
            var said = error == "declined" ? "Nexus's admin declined linking Scry." : error;
            log.Warn($"Linking workspace {workspace.Workspace.Name} to Nexus did not happen: {said}", LogPlace.In(workspace.Id));
            await db.SaveChangesAsync(ct);
            return BackToSettings(said);
        }

        if (pairing is null || pairings.Take(pairing) is not { } pending)
        {
            return BackToSettings("This pairing has expired. Link Nexus again.");
        }

        if (pending.WorkspaceId != workspace.Id)
        {
            return BackToSettings("This pairing was started in another workspace. Link Nexus again here.");
        }

        // Named before the claim, since Nexus records the key's name while claiming.
        var (pushKey, hash, prefix) = IngestKeys.Make();
        var name = $"Nexus at {new Uri(pending.NexusUrl).Authority}";
        var key = new IngestKey
        {
            WorkspaceId = workspace.Id,
            Name = name.Length > IngestKey.MaxNameLength ? name[..IngestKey.MaxNameLength] : name,
            Hash = hash,
            Prefix = prefix,
            CreatedAt = DateTime.UtcNow,
        };
        db.IngestKeys.Add(key);
        await db.SaveChangesAsync(ct);

        ClaimedPairing claimed;
        try
        {
            claimed = await nexus.ClaimAsync(pending.NexusUrl, pairing, pending.Verifier, pushKey, ct);
        }
        catch (NexusException ex)
        {
            db.IngestKeys.Remove(key);
            log.Warn($"Linking workspace {workspace.Workspace.Name} to Nexus at {pending.NexusUrl} failed: {ex.Message}", LogPlace.In(workspace.Id));
            await db.SaveChangesAsync(CancellationToken.None);
            return BackToSettings(ex.Message);
        }

        db.NexusLinks.Add(new NexusLink
        {
            WorkspaceId = workspace.Id,
            NexusUrl = pending.NexusUrl,
            AppKey = secrets.ProtectText(claimed.AppKey),
            DestinationId = claimed.DestinationId,
            AppName = claimed.AppName,
            WorkspaceName = claimed.WorkspaceName,
            IngestKeyId = key.Id,
            LinkedAt = DateTime.UtcNow,
        });
        log.Info(
            $"Workspace {workspace.Workspace.Name} was linked to Nexus at {pending.NexusUrl}, workspace {claimed.WorkspaceName}, as {claimed.AppName}. Nexus sends rows with push key {key.Name}.",
            LogPlace.In(workspace.Id));
        await db.SaveChangesAsync(ct);
        return Redirect($"{SettingsPage}?linked=1");
    }

    /// <summary>Unlinks: Nexus revokes Scry's app key, Scry revokes Nexus's push key, and the link goes. The sources stay.</summary>
    [HttpDelete]
    public async Task<IActionResult> Unlink(CancellationToken ct)
    {
        if (await Link().FirstOrDefaultAsync(ct) is not { } link)
        {
            return NotFound();
        }

        try
        {
            await nexus.RevokeKeyAsync(link.NexusUrl, secrets.UnprotectText(link.AppKey), ct);
        }
        catch (NexusException)
        {
            // Unlinking goes on without Nexus: its key stops mattering once Scry forgets it, and an admin can revoke it there.
        }

        if (link.IngestKeyId is { } keyId)
        {
            await db.Sources.Where(source => source.IngestKeyId == keyId).ExecuteUpdateAsync(set => set.SetProperty(s => s.IngestKeyId, (int?)null), ct);
            await db.IngestKeys.Where(k => k.Id == keyId).ExecuteDeleteAsync(ct);
        }

        db.NexusLinks.Remove(link);
        log.Info(
            $"Workspace {workspace.Workspace.Name} was unlinked from Nexus at {link.NexusUrl}, and both keys were revoked. The sources Nexus sent stay.",
            LogPlace.In(workspace.Id));
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>The connectors Nexus reads through, which the Sources page offers beside Scry's own.</summary>
    [HttpGet("connectors")]
    public Task<ActionResult<List<NexusConnector>>> Connectors(CancellationToken ct) =>
        WithLinkAsync(link => nexus.ListConnectorsAsync(link.NexusUrl, AppKey(link), ct), ct);

    /// <summary>Opens Nexus's connect page for a connector, into the link's destination, coming back to the Sources page.</summary>
    [HttpPost("connect")]
    public Task<ActionResult<NexusConnectPage>> Connect(ConnectRequest request, CancellationToken ct) =>
        WithLinkAsync(
            link => nexus.OpenConnectAsync(link.NexusUrl, AppKey(link), request.Connector ?? string.Empty, link.DestinationId, SourcesPage, ct),
            ct);

    /// <summary>
    /// The syncs that fill the link's destination, each with how its last run went and its connection's sign-in, which
    /// the sources list is given from then on.
    /// </summary>
    [HttpGet("syncs")]
    public Task<ActionResult<List<NexusSync>>> Syncs(CancellationToken ct) =>
        WithLinkAsync(
            async link =>
            {
                var syncs = await nexus.ListSyncsAsync(link.NexusUrl, AppKey(link), ct);
                signIns.Keep(link, syncs);
                return syncs.Where(s => s.DestinationId == link.DestinationId).ToList();
            },
            ct);

    /// <summary>Opens Nexus's connect page to sign one of its connections in again, coming back to the Sources page.</summary>
    [HttpPost("connections/{id:int}/sign-in")]
    public Task<ActionResult<NexusConnectPage>> SignInAgain(int id, CancellationToken ct) =>
        WithLinkAsync(link => nexus.OpenRenewalAsync(link.NexusUrl, AppKey(link), id, link.DestinationId, SourcesPage, ct), ct);

    [HttpPost("syncs/{id:int}/run")]
    public Task<ActionResult<NexusSync>> Run(int id, CancellationToken ct) =>
        WithLinkAsync(
            async link =>
            {
                var run = await nexus.RunSyncAsync(link.NexusUrl, AppKey(link), id, ct);
                log.Info($"Nexus at {link.NexusUrl} was asked to run sync {run.Table} now, from {run.ConnectionName} ({run.ConnectorName}).", LogPlace.In(workspace.Id));
                await db.SaveChangesAsync(ct);
                return run;
            },
            ct);

    // Each call through the link: refused while Scry is unlinked, and Nexus's refusals passed on in its own words.
    private async Task<ActionResult<T>> WithLinkAsync<T>(Func<NexusLink, Task<T>> call, CancellationToken ct)
    {
        if (await Link().AsNoTracking().FirstOrDefaultAsync(ct) is not { } link)
        {
            return Problem($"{workspace.Workspace.Name} is not linked to Nexus. Link it on its Settings page.", statusCode: StatusCodes.Status409Conflict);
        }

        try
        {
            return await call(link);
        }
        catch (NexusException ex)
        {
            return Problem(ex.Message, statusCode: StatusCodes.Status502BadGateway);
        }
    }

    private IQueryable<NexusLink> Link() => db.NexusLinks.Where(link => link.WorkspaceId == workspace.Id);

    private string AppKey(NexusLink link) => secrets.UnprotectText(link.AppKey);

    private string SettingsPage => $"{instance.Client}/workspaces/{workspace.Id}/settings";

    private string SourcesPage => $"{instance.Client}/workspaces/{workspace.Id}/sources";

    private RedirectResult BackToSettings(string error) =>
        Redirect($"{SettingsPage}?error={Uri.EscapeDataString(error)}");
}
