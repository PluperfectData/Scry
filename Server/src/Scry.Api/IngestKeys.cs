using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Scry.Api.Storage;

namespace Scry.Api;

/// <summary>Makes push API keys, and finds the key a request carries.</summary>
public sealed class IngestKeys(ScryDbContext db)
{
    private const string Lead = "scry_";

    private const string Bearer = "Bearer ";

    // The lead and seven characters of the random part: enough to tell keys apart, far too little to guess one.
    private const int PrefixLength = 12;

    /// <summary>A new key, its hash, and the prefix shown for it. The key itself is never stored.</summary>
    public static (string Key, string Hash, string Prefix) Make()
    {
        var key = Lead + Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));
        return (key, HashOf(key), key[..PrefixLength]);
    }

    /// <summary>The key the request's <c>Authorization: Bearer</c> header carries, or null for none Scry made.</summary>
    public async Task<IngestKey?> FromAsync(HttpRequest request, CancellationToken ct)
    {
        var header = request.Headers.Authorization.ToString();
        if (!header.StartsWith(Bearer, StringComparison.Ordinal))
        {
            return null;
        }

        var hash = HashOf(header[Bearer.Length..].Trim());
        return await db.IngestKeys.FirstOrDefaultAsync(key => key.Hash == hash, ct);
    }

    private static string HashOf(string key) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(key)));
}
