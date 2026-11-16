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
/// Links Scry to a Nexus instance by pairing, with nothing copied by hand: Scry asks Nexus, an admin approves at Nexus,
/// and Nexus's callback lands here, where Scry claims the pairing, trading a push key for an app key.
/// </summary>
[ApiController]
[Route("nexus")]
public sealed class NexusController(ScryDbContext db, NexusApi nexus, NexusPairings pairings, ConnectionSecrets secrets, ScrySettings settings)
    : ControllerBase
{
    [HttpGet]
    public async Task<NexusLinkView> Get(CancellationToken ct) =>
        await db.NexusLinks.AsNoTracking().Include(l => l.IngestKey).FirstOrDefaultAsync(ct) is { } link
            ? new NexusLinkView(true, link.NexusUrl, link.AppName, link.WorkspaceName, link.IngestKey?.Name, link.IngestKey?.Prefix, link.LinkedAt)
            : new NexusLinkView(false, null, null, null, null, null, null);

    /// <summary>Opens a pairing at the Nexus instance named, and answers the page where its admin approves it.</summary>
    [HttpPost("pairing")]
    public async Task<ActionResult<PairingStarted>> Pair(PairingStart request, CancellationToken ct)
    {
        if (await db.NexusLinks.AnyAsync(ct))
        {
            return Problem("Scry is linked to Nexus already. Unlink it first.", statusCode: StatusCodes.Status409Conflict);
        }

        var url = request.NexusUrl?.Trim().TrimEnd('/');
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            return Problem("Enter Nexus's address, such as http://localhost:6163.", statusCode: StatusCodes.Status400BadRequest);
        }

        var verifier = Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));
        var api = settings.ApiOrigin.TrimEnd('/');
        try
        {
            var opened = await nexus.OpenPairingAsync(
                url!,
                new
                {
                    appName = $"Scry at {new Uri(api).Authority}",
                    ingestUrl = $"{api}/ingest",
                    callbackUrl = $"{api}/nexus/callback",
                    connectReturnUrl = $"{settings.ClientOrigin.TrimEnd('/')}/sources",
                    verifierHash = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(verifier))),
                },
                ct);
            pairings.Start(opened.Id, new PendingPairing(url!, verifier));
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
            return BackToSettings(error == "declined" ? "Nexus's admin declined linking Scry." : error);
        }

        if (pairing is null || pairings.Take(pairing) is not { } pending)
        {
            return BackToSettings("This pairing has expired. Link Nexus again.");
        }

        // Named before the claim, since Nexus records the key's name while claiming.
        var (pushKey, hash, prefix) = IngestKeys.Make();
        var name = $"Nexus at {new Uri(pending.NexusUrl).Authority}";
        var key = new IngestKey { Name = name.Length > IngestKey.MaxNameLength ? name[..IngestKey.MaxNameLength] : name, Hash = hash, Prefix = prefix, CreatedAt = DateTime.UtcNow };
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
            await db.SaveChangesAsync(CancellationToken.None);
            return BackToSettings(ex.Message);
        }

        db.NexusLinks.Add(new NexusLink
        {
            NexusUrl = pending.NexusUrl,
            AppKey = secrets.ProtectText(claimed.AppKey),
            DestinationId = claimed.DestinationId,
            AppName = claimed.AppName,
            WorkspaceName = claimed.WorkspaceName,
            IngestKeyId = key.Id,
            LinkedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync(ct);
        return Redirect($"{settings.ClientOrigin}/settings?linked=1");
    }

    /// <summary>Unlinks: Nexus revokes Scry's app key, Scry revokes Nexus's push key, and the link goes. The sources stay.</summary>
    [HttpDelete]
    public async Task<IActionResult> Unlink(CancellationToken ct)
    {
        if (await db.NexusLinks.FirstOrDefaultAsync(ct) is not { } link)
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
            link => nexus.OpenConnectAsync(
                link.NexusUrl, AppKey(link), request.Connector ?? string.Empty, link.DestinationId, $"{settings.ClientOrigin.TrimEnd('/')}/sources", ct),
            ct);

    /// <summary>The syncs that fill the link's destination, each with how its last run went.</summary>
    [HttpGet("syncs")]
    public Task<ActionResult<List<NexusSync>>> Syncs(CancellationToken ct) =>
        WithLinkAsync(async link => (await nexus.ListSyncsAsync(link.NexusUrl, AppKey(link), ct)).Where(s => s.DestinationId == link.DestinationId).ToList(), ct);

    [HttpPost("syncs/{id:int}/run")]
    public Task<ActionResult<NexusSync>> Run(int id, CancellationToken ct) =>
        WithLinkAsync(link => nexus.RunSyncAsync(link.NexusUrl, AppKey(link), id, ct), ct);

    // Each call through the link: refused while Scry is unlinked, and Nexus's refusals passed on in its own words.
    private async Task<ActionResult<T>> WithLinkAsync<T>(Func<NexusLink, Task<T>> call, CancellationToken ct)
    {
        if (await db.NexusLinks.AsNoTracking().FirstOrDefaultAsync(ct) is not { } link)
        {
            return Problem("Scry is not linked to Nexus. Link it on the Settings page.", statusCode: StatusCodes.Status409Conflict);
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

    private string AppKey(NexusLink link) => secrets.UnprotectText(link.AppKey);

    private RedirectResult BackToSettings(string error) =>
        Redirect($"{settings.ClientOrigin}/settings?error={Uri.EscapeDataString(error)}");
}
