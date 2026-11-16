using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace Scry.Api;

/// <summary>A pairing sent to Nexus and not yet back: the instance it went to, and the verifier that claims it.</summary>
public sealed record PendingPairing(string NexusUrl, string Verifier);

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

/// <summary>A connector Nexus reads through, such as MySQL.</summary>
public sealed record NexusConnector(string Id, string Name, string Description);

/// <summary>A connect page Nexus opened for the link's destination, at <paramref name="Url"/>.</summary>
public sealed record NexusConnectPage(string Url, DateTime ExpiresAt);

/// <summary>How a sync's last run went at Nexus.</summary>
public sealed record NexusRun(string Status, DateTime StartedAt, DateTime? EndedAt, long Rows, string? Error);

/// <summary>
/// A sync at Nexus: the connection and stream it reads, the table it fills, and how its last run went.
/// <paramref name="Status"/> is <c>Ready</c>, <c>Queued</c>, <c>Running</c>, or <c>Failed</c>.
/// </summary>
public sealed record NexusSync(
    int Id,
    string ConnectionName,
    string ConnectorName,
    bool NeedsSignIn,
    int? DestinationId,
    string Stream,
    string Table,
    string Mode,
    string Status,
    NexusRun? LastRun);

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
