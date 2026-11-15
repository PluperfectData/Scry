using System.Security.Cryptography;
using Microsoft.Extensions.Caching.Memory;
using Nexus;
using Nexus.Schwab;
using Scry.Api.Controllers;

namespace Scry.Api;

/// <summary>The <c>Schwab</c> configuration section: the Schwab app Scry signs in through.</summary>
public sealed class SchwabApp
{
    public const string Section = "Schwab";

    public string? AppKey { get; set; }

    public string? AppSecret { get; set; }

    /// <summary>The app's callback URL, exactly as registered with Schwab. The API serves it.</summary>
    public string CallbackUrl { get; set; } = "https://127.0.0.1:6162/schwab/callback";

    /// <summary>The settings Scry must have to sign in to Schwab and lacks, by their configuration names.</summary>
    public IReadOnlyList<string> Missing =>
    [
        .. new[] { (nameof(AppKey), AppKey), (nameof(AppSecret), AppSecret) }
            .Where(setting => string.IsNullOrWhiteSpace(setting.Item2))
            .Select(setting => $"{Section}:{setting.Item1}"),
    ];

    public OAuthClient? Client => Missing.Count == 0 ? new OAuthClient(AppKey!.Trim(), AppSecret!.Trim()) : null;
}

/// <summary>Schwab's Nexus connector and its sign-in, over one named HTTP client.</summary>
public sealed class SchwabConnector(IHttpClientFactory http, SchwabApp app)
{
    public const string Id = "schwab";

    public const string HttpClientName = "schwab";

    public SchwabApp App => app;

    public ISourceConnector Source() => new SchwabSource(http.CreateClient(HttpClientName));

    /// <summary>Exchanges the code Schwab's redirect carried for tokens.</summary>
    public Task<OAuthTokens> ExchangeAsync(string code, CancellationToken ct) =>
        SchwabSignIn.ExchangeAsync(
            http.CreateClient(HttpClientName),
            app.Client ?? throw new ConnectorException(ConnectorErrorKind.ConfigInvalid, "Scry has no Schwab app key and secret."),
            code,
            app.CallbackUrl,
            ct: ct);
}

/// <summary>Every connector a connection reads through, by its id.</summary>
public sealed class SourceConnectors(DatabaseConnectors databases, SchwabConnector schwab)
{
    public ISourceConnector? Find(string id) => id == SchwabConnector.Id ? schwab.Source() : databases.Find(id);

    /// <summary>The OAuth app a connector signs in through, or null for one that takes its settings alone.</summary>
    public OAuthClient? ClientFor(string id) => id == SchwabConnector.Id ? schwab.App.Client : null;
}

/// <summary>
/// A Schwab sign-in under way: the settings and streams of a new connection, or the existing connection whose sign-in
/// it renews.
/// </summary>
public sealed record PendingSignIn(IReadOnlyDictionary<string, string?> Settings, IReadOnlyList<TableChoice> Streams, int? ConnectionId);

/// <summary>Sign-ins sent to Schwab and not yet back, by the <c>state</c> the redirect returns, for ten minutes.</summary>
public sealed class SchwabSignIns(IMemoryCache cache)
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(10);

    public string Start(PendingSignIn pending)
    {
        var state = Convert.ToHexString(RandomNumberGenerator.GetBytes(16));
        cache.Set(Key(state), pending, Lifetime);
        return state;
    }

    /// <summary>The sign-in <paramref name="state"/> belongs to, which can be taken once, or null.</summary>
    public PendingSignIn? Take(string? state)
    {
        if (state is null || !cache.TryGetValue(Key(state), out PendingSignIn? pending))
        {
            return null;
        }

        cache.Remove(Key(state));
        return pending;
    }

    private static string Key(string state) => $"schwab-sign-in:{state}";
}
