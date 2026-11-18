using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Scry.Api.Controllers;
using Scry.Api.Storage;

namespace Scry.Api;

/// <summary>A pairing sent to Nexus and not yet back: the instance it went to, the verifier that claims it, and the workspace it links.</summary>
public sealed record PendingPairing(string NexusUrl, string Verifier, int WorkspaceId);

/// <summary>Pairings waiting for an admin's approval at Nexus, by Nexus's id for them, for ten minutes.</summary>
public sealed class NexusPairings(IMemoryCache cache)
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(10);

    public void Start(string id, PendingPairing pending) => cache.Set(Key(id), pending, Lifetime);

    /// <summary>The pairing, once: taking it removes it.</summary>
    public PendingPairing? Take(string id)
    {
        if (!cache.TryGetValue(Key(id), out PendingPairing? pending))
        {
            return null;
        }

        cache.Remove(Key(id));
        return pending;
    }

    private static string Key(string id) => $"nexus-pairing:{id}";
}

/// <summary>A refusal or failure from Nexus, in words safe to show.</summary>
public sealed class NexusException(string message) : Exception(message);

public sealed record OpenedPairing(string Id, string ApproveUrl, DateTime ExpiresAt);

public sealed record ClaimedPairing(string AppKey, int DestinationId, string AppName, string WorkspaceName);

/// <summary>A connector Nexus reads through. <paramref name="NotReady"/> says why the link's workspace cannot connect it yet.</summary>
public sealed record NexusConnector(string Id, string Name, string Description, string? NotReady = null);

/// <summary>A connect page Nexus opened for the link's destination, at <paramref name="Url"/>.</summary>
public sealed record NexusConnectPage(string Url, DateTime ExpiresAt);

/// <summary>How a sync's last run went at Nexus.</summary>
public sealed record NexusRun(string Status, DateTime StartedAt, DateTime? EndedAt, long Rows, string? Error);

/// <summary>
/// A Nexus connection's sign-in. <paramref name="Kind"/> is <c>Lasting</c>, <c>FixedClock</c>, or <c>KeptAlive</c>;
/// <paramref name="EndsAt"/> is when a fixed clock ends it, and <paramref name="EndingSoon"/> whether that is near.
/// Once <paramref name="Ended"/>, Nexus syncs nothing from it until someone signs in again.
/// </summary>
public sealed record NexusSignIn(
    string Kind,
    DateTime? SignedInAt,
    DateTime? EndsAt,
    bool EndingSoon,
    bool Ended,
    DateTime? EndedAt,
    DateTime? KeptAliveAt,
    IReadOnlyList<string> Accounts);

/// <summary>
/// A sync at Nexus: the connection and stream it reads, the table it fills, and how its last run went.
/// <paramref name="Status"/> is <c>Ready</c>, <c>Queued</c>, <c>Running</c>, or <c>Failed</c>. <paramref name="SignIn"/>
/// is its connection's, null for one that does not sign in.
/// </summary>
public sealed record NexusSync(
    int Id,
    int ConnectionId,
    string ConnectionName,
    string ConnectorName,
    NexusSignIn? SignIn,
    int? DestinationId,
    string Stream,
    string Table,
    string Mode,
    string Status,
    NexusRun? LastRun);

/// <summary>
/// The sign-ins of the Nexus connections that fill a workspace's sources, by table, read from Nexus's syncs and kept for
/// a minute, so a dashboard does not call Nexus each time it loads. A Nexus that does not answer leaves them out.
/// </summary>
public sealed class NexusSignIns(NexusApi nexus, ConnectionSecrets secrets, IMemoryCache cache)
{
    private static readonly TimeSpan Kept = TimeSpan.FromMinutes(1);

    private static readonly TimeSpan Patience = TimeSpan.FromSeconds(5);

    private static readonly IReadOnlyDictionary<string, SourceSignIn> None = new Dictionary<string, SourceSignIn>();

    public async Task<IReadOnlyDictionary<string, SourceSignIn>> ByTableAsync(NexusLink link, CancellationToken ct)
    {
        if (cache.TryGetValue(Key(link.WorkspaceId), out IReadOnlyDictionary<string, SourceSignIn>? kept) && kept is not null)
        {
            return kept;
        }

        using var patience = CancellationTokenSource.CreateLinkedTokenSource(ct);
        patience.CancelAfter(Patience);
        try
        {
            return Keep(link, await nexus.ListSyncsAsync(link.NexusUrl, secrets.UnprotectText(link.AppKey), patience.Token));
        }
        catch (Exception ex) when (ex is NexusException || (ex is OperationCanceledException && !ct.IsCancellationRequested))
        {
            cache.Set(Key(link.WorkspaceId), None, Kept);
            return None;
        }
    }

    /// <summary>Keeps what a fresh read of the link's syncs says, and answers it by table.</summary>
    public IReadOnlyDictionary<string, SourceSignIn> Keep(NexusLink link, IEnumerable<NexusSync> syncs)
    {
        IReadOnlyDictionary<string, SourceSignIn> byTable = syncs
            .Where(sync => sync.DestinationId == link.DestinationId && sync.SignIn is not null)
            .GroupBy(sync => sync.Table, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => SourceSignIn.Of(group.First()), StringComparer.Ordinal);
        cache.Set(Key(link.WorkspaceId), byTable, Kept);
        return byTable;
    }

    private static string Key(int workspaceId) => $"nexus-sign-ins:{workspaceId}";
}

/// <summary>Every call Scry makes to a Nexus instance.</summary>
public sealed class NexusApi(IHttpClientFactory http)
{
    public const string HttpClientName = "nexus";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public Task<OpenedPairing> OpenPairingAsync(string nexusUrl, object request, CancellationToken ct) =>
        SendAsync<OpenedPairing>(nexusUrl, HttpMethod.Post, "/pairings", null, request, ct);

    public Task<ClaimedPairing> ClaimAsync(string nexusUrl, string id, string verifier, string pushKey, CancellationToken ct) =>
        SendAsync<ClaimedPairing>(nexusUrl, HttpMethod.Post, $"/pairings/{Uri.EscapeDataString(id)}/claim", null, new { verifier, pushKey }, ct);

    public Task RevokeKeyAsync(string nexusUrl, string appKey, CancellationToken ct) =>
        SendAsync<JsonElement?>(nexusUrl, HttpMethod.Delete, "/app/key", appKey, null, ct);

    public Task<List<NexusConnector>> ListConnectorsAsync(string nexusUrl, string appKey, CancellationToken ct) =>
        SendAsync<List<NexusConnector>>(nexusUrl, HttpMethod.Get, "/connectors", appKey, null, ct);

    /// <summary>Opens a connect page for <paramref name="connector"/> into the destination, returning to <paramref name="returnUrl"/>.</summary>
    public Task<NexusConnectPage> OpenConnectAsync(string nexusUrl, string appKey, string connector, int destinationId, string returnUrl, CancellationToken ct) =>
        SendAsync<NexusConnectPage>(nexusUrl, HttpMethod.Post, "/connect-sessions", appKey, new { connector, destinationId, returnUrl }, ct);

    /// <summary>The app's syncs, into any of its destinations.</summary>
    public Task<List<NexusSync>> ListSyncsAsync(string nexusUrl, string appKey, CancellationToken ct) =>
        SendAsync<List<NexusSync>>(nexusUrl, HttpMethod.Get, "/syncs", appKey, null, ct);

    public Task<NexusSync> RunSyncAsync(string nexusUrl, string appKey, int id, CancellationToken ct) =>
        SendAsync<NexusSync>(nexusUrl, HttpMethod.Post, $"/syncs/{id}/run", appKey, null, ct);

    /// <summary>Opens a connect page that signs <paramref name="connectionId"/> in again, returning to <paramref name="returnUrl"/>.</summary>
    public Task<NexusConnectPage> OpenRenewalAsync(string nexusUrl, string appKey, int connectionId, int destinationId, string returnUrl, CancellationToken ct) =>
        SendAsync<NexusConnectPage>(nexusUrl, HttpMethod.Post, "/connect-sessions", appKey, new { connectionId, destinationId, returnUrl }, ct);

    private async Task<T> SendAsync<T>(string nexusUrl, HttpMethod method, string path, string? appKey, object? body, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(method, $"{nexusUrl.TrimEnd('/')}{path}");
        if (appKey is not null)
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", appKey);
        }

        if (body is not null)
        {
            request.Content = JsonContent.Create(body, options: Json);
        }

        HttpResponseMessage response;
        try
        {
            response = await http.CreateClient(HttpClientName).SendAsync(request, ct);
        }
        catch (HttpRequestException)
        {
            throw new NexusException($"Nexus did not answer at {nexusUrl}. Check the address, and that Nexus is running.");
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                throw new NexusException(await DetailAsync(response, ct));
            }

            return response.Content.Headers.ContentLength == 0 || response.StatusCode == System.Net.HttpStatusCode.NoContent
                ? default!
                : (await response.Content.ReadFromJsonAsync<T>(Json, ct))!;
        }
    }

    private static async Task<string> DetailAsync(HttpResponseMessage response, CancellationToken ct)
    {
        try
        {
            var problem = await response.Content.ReadFromJsonAsync<JsonElement>(ct);
            if (problem.ValueKind == JsonValueKind.Object && problem.TryGetProperty("detail", out var detail) && detail.ValueKind == JsonValueKind.String)
            {
                return detail.GetString()!;
            }
        }
        catch (JsonException)
        {
        }

        return $"Nexus answered {(int)response.StatusCode}.";
    }
}
