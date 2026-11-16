using System.Collections.Concurrent;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Scry.Api.Tests;

/// <summary>
/// Nexus's routes for an app, in small: it opens pairing <c>p-1</c>, claims it only with the verifier whose hash it was
/// opened with, answers app key <see cref="AppKey"/>, offers MySQL and Charles Schwab, holds sync 11 into destination 7
/// and sync 12 into another, and records every request.
/// </summary>
public sealed class FakeNexus : HttpMessageHandler
{
    public const string Url = "http://nexus.test";

    public const string AppKey = "nexus_the-app-key";

    public const string PairingId = "p-1";

    /// <summary>Why the link's workspace cannot connect Charles Schwab yet, as Nexus says when it has no Schwab app.</summary>
    public const string NotReady = "This workspace has no Charles Schwab app yet. Add it under Sign-in apps on the workspace page in Nexus.";

    private string? _verifierHash;

    public ConcurrentQueue<(string Line, JsonElement? Body, string? Authorization)> Requests { get; } = new();

    /// <summary>A refusal the next claim answers with, in place of the app key.</summary>
    public string? FailClaim { get; set; }

    public JsonElement? Opened => Requests.FirstOrDefault(r => r.Line == "POST /pairings").Body;

    public JsonElement? Claimed => Requests.FirstOrDefault(r => r.Line.EndsWith("/claim", StringComparison.Ordinal)).Body;

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var line = $"{request.Method} {request.RequestUri!.AbsolutePath}";
        JsonElement? body = request.Content is null ? null : JsonDocument.Parse(await request.Content.ReadAsStringAsync(cancellationToken)).RootElement.Clone();
        Requests.Enqueue((line, body, request.Headers.Authorization?.ToString()));

        switch (line)
        {
            case "POST /pairings":
                _verifierHash = body!.Value.GetProperty("verifierHash").GetString();
                return Json(HttpStatusCode.Created, new { id = PairingId, approveUrl = $"{Url}/pair?id={PairingId}", expiresAt = DateTime.UtcNow.AddMinutes(10) });

            case $"POST /pairings/{PairingId}/claim":
                if (FailClaim is { } refusal)
                {
                    return Json(HttpStatusCode.BadRequest, new { detail = refusal });
                }

                var verifier = body!.Value.GetProperty("verifier").GetString()!;
                var hash = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(verifier)));
                return hash != _verifierHash
                    ? Json(HttpStatusCode.NotFound, new { detail = "This pairing has expired or is finished." })
                    : Json(HttpStatusCode.OK, new { appKey = AppKey, destinationId = 7, appName = "Scry", workspaceName = "Acme" });

            case "DELETE /app/key":
                return new HttpResponseMessage(HttpStatusCode.NoContent);

            case "GET /connectors":
                return Json(HttpStatusCode.OK, new object[]
                {
                    new { id = "mysql", name = "MySQL", description = "Reads tables from MySQL.", auth = "ConnectionFields", fields = Array.Empty<object>(), notReady = (string?)null },
                    new { id = "schwab", name = "Charles Schwab", description = "Reads a Schwab sign-in.", auth = "OAuth", fields = Array.Empty<object>(), notReady = NotReady },
                });

            case "POST /connect-sessions":
                return Json(HttpStatusCode.Created, new { url = $"{Url}/connect#nxc_the-token", expiresAt = DateTime.UtcNow.AddMinutes(10) });

            case "GET /syncs":
                return Json(HttpStatusCode.OK, new[] { Sync(11, 7, "shop_orders", "Ready"), Sync(12, 8, "elsewhere", "Ready") });

            case "POST /syncs/11/run":
                return Json(HttpStatusCode.Accepted, Sync(11, 7, "shop_orders", "Queued"));

            case "POST /syncs/99/run":
                return new HttpResponseMessage(HttpStatusCode.NotFound);

            default:
                throw new InvalidOperationException($"No route for {line}.");
        }
    }

    // A sync as Nexus's app routes show one, with fields Scry does not read.
    private static object Sync(int id, int destinationId, string table, string status) => new
    {
        id,
        connectionId = 4,
        connectionName = "Shop",
        connectorName = "MySQL",
        needsSignIn = false,
        destinationId,
        destinationUrl = "http://localhost:6161/ingest",
        appName = "Scry at localhost:6161",
        stream = "shop.orders",
        table,
        mode = "FullRefresh",
        cursorField = (string?)null,
        status,
        lastRun = new { id = 1, attempt = 1, status = "Succeeded", startedAt = DateTime.UtcNow, endedAt = DateTime.UtcNow, rows = 1200, errorKind = (string?)null, error = (string?)null },
    };

    private static HttpResponseMessage Json(HttpStatusCode status, object body) =>
        new(status) { Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json") };
}
