using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Nexus;
using Nexus.MySql;
using Nexus.Postgres;
using Nexus.SqlServer;

namespace Scry.Api;

/// <summary>The Nexus connectors a database source reads through, by their spec ids.</summary>
public sealed class DatabaseConnectors(IEnumerable<ISourceConnector> connectors)
{
    private readonly Dictionary<string, ISourceConnector> _byId = connectors.ToDictionary(connector => connector.Spec.Id);

    public static DatabaseConnectors FromNexus() => new([new MySqlSource(), new PostgresSource(), new SqlServerSource()]);

    public IEnumerable<ISourceConnector> All => _byId.Values;

    public ISourceConnector? Find(string id) => _byId.GetValueOrDefault(id);
}

/// <summary>Encrypts a connection's settings for the database, and decrypts them to sync, with ASP.NET Data Protection.</summary>
public sealed class ConnectionSecrets(IDataProtectionProvider provider)
{
    private readonly IDataProtector _protector = provider.CreateProtector("Scry.Connections");

    public string Protect(IReadOnlyDictionary<string, string?> settings) =>
        _protector.Protect(JsonSerializer.Serialize(settings));

    public IReadOnlyDictionary<string, string?> Unprotect(string stored) =>
        JsonSerializer.Deserialize<Dictionary<string, string?>>(_protector.Unprotect(stored))
        ?? throw new InvalidDataException("A stored connection holds no settings.");

    public string ProtectTokens(OAuthTokens tokens) => _protector.Protect(JsonSerializer.Serialize(tokens));

    public OAuthTokens? UnprotectTokens(string? stored) =>
        stored is null ? null : JsonSerializer.Deserialize<OAuthTokens>(_protector.Unprotect(stored));
}
