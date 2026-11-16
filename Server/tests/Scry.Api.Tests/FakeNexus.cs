using System.Collections.Concurrent;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Scry.Api.Tests;

/// <summary>
/// Nexus's pairing routes, in small: it opens pairing <c>p-1</c>, claims it only with the verifier whose hash it was
/// opened with, answers app key <see cref="AppKey"/>, and records every request.
/// </summary>
public sealed class FakeNexus : HttpMessageHandler
{
    public const string Url = "http://nexus.test";

    public const string AppKey = "nexus_the-app-key";

    public const string PairingId = "p-1";

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

            default:
                throw new InvalidOperationException($"No route for {line}.");
        }
    }

    private static HttpResponseMessage Json(HttpStatusCode status, object body) =>
        new(status) { Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json") };
}
