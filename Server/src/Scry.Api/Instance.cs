using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using MySqlConnector;

namespace Scry.Api;

/// <summary>A MySQL database, as the installer and the Settings page take it.</summary>
public sealed record DatabaseSettings(string Host, int Port, string Name, string User, string Password)
{
    public const int DefaultPort = 3306;

    public string ConnectionString => new MySqlConnectionStringBuilder
    {
        Server = Host,
        Port = (uint)Port,
        Database = Name,
        UserID = User,
        Password = Password,
    }.ConnectionString;

    /// <summary>Whether both name the same database on the same server, whatever their passwords.</summary>
    public bool SamePlace(DatabaseSettings other) =>
        string.Equals(Host, other.Host, StringComparison.OrdinalIgnoreCase) && Port == other.Port && Name == other.Name;

    /// <summary>The database a connection string names, with no password, or null when MySQL cannot read the string.</summary>
    public static DatabaseSettings? Describe(string connectionString)
    {
        try
        {
            var parts = new MySqlConnectionStringBuilder(connectionString);
            return new DatabaseSettings(parts.Server, (int)parts.Port, parts.Database, parts.UserID, string.Empty);
        }
        catch (ArgumentException)
        {
            return null;
        }
    }
}

/// <summary>
/// What the installer and the Settings page set, kept in <c>instance.json</c> in the data folder. The database's
/// password is encrypted with Scry's Data Protection keys, which live beside it in <c>keys</c>.
/// </summary>
public sealed class InstanceFile
{
    public const string FileName = "instance.json";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    private readonly string _path;
    private readonly IDataProtector _protector;
    private readonly Lock _gate = new();
    private Stored _stored;

    public InstanceFile(string dataDirectory, IDataProtectionProvider provider)
    {
        _path = Path.Combine(dataDirectory, FileName);
        _protector = provider.CreateProtector("Scry.Instance");
        _stored = Load(_path);
    }

    public string? ClientOrigin => _stored.ClientOrigin;

    public string? ApiOrigin => _stored.ApiOrigin;

    /// <summary>The stored database without its password, or null when none is stored.</summary>
    public DatabaseSettings? DatabasePlace =>
        _stored.Database is { } stored ? new DatabaseSettings(stored.Host, stored.Port, stored.Name, stored.User, string.Empty) : null;

    /// <summary>The stored database, or null when none is stored or Scry's keys cannot decrypt its password.</summary>
    public DatabaseSettings? Database =>
        _stored.Database is { } stored && Reveal(stored.Password) is { } password
            ? new DatabaseSettings(stored.Host, stored.Port, stored.Name, stored.User, password)
            : null;

    public void SaveDatabase(DatabaseSettings database) =>
        Change(stored => stored with
        {
            Database = new StoredDatabase(database.Host, database.Port, database.Name, database.User, _protector.Protect(database.Password)),
        });

    /// <summary>Keeps each address given; a null one keeps the address stored.</summary>
    public void SaveOrigins(string? clientOrigin, string? apiOrigin) =>
        Change(stored => stored with
        {
            ClientOrigin = clientOrigin ?? stored.ClientOrigin,
            ApiOrigin = apiOrigin ?? stored.ApiOrigin,
        });

    private void Change(Func<Stored, Stored> change)
    {
        lock (_gate)
        {
            Save(change(_stored));
        }
    }

    // Written beside the target and moved over it, so the file holds the old settings or the new, never part of either.
    private void Save(Stored next)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(next, Json);
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        var temp = $"{_path}.{Guid.NewGuid():N}.tmp";
        try
        {
            using (var stream = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                stream.Write(bytes);
                stream.Flush(flushToDisk: true);
            }

            File.Move(temp, _path, overwrite: true);
        }
        finally
        {
            if (File.Exists(temp))
            {
                File.Delete(temp);
            }
        }

        _stored = next;
    }

    private string? Reveal(string stored)
    {
        try
        {
            return _protector.Unprotect(stored);
        }
        catch (CryptographicException)
        {
            return null;
        }
    }

    private static Stored Load(string path)
    {
        if (!File.Exists(path))
        {
            return new Stored();
        }

        try
        {
            return JsonSerializer.Deserialize<Stored>(File.ReadAllBytes(path), Json) ?? new Stored();
        }
        catch (JsonException ex)
        {
            throw new InvalidDataException(
                $"{path} cannot be read ({ex.Message}). Scry does not write over it. Fix the file, or move it out of the data folder to set the instance up again.",
                ex);
        }
    }

    internal sealed record Stored
    {
        public StoredDatabase? Database { get; init; }

        public string? ClientOrigin { get; init; }

        public string? ApiOrigin { get; init; }
    }

    internal sealed record StoredDatabase(string Host, int Port, string Name, string User, string Password);
}

/// <summary>
/// The instance's settings as Scry uses them. Each comes from configuration when an operator set it there, and
/// otherwise from what the installer and the Settings page stored.
/// </summary>
public sealed class Instance(InstanceFile file, ScrySettings settings, IConfiguration configuration)
{
    public InstanceFile File => file;

    public string? ConfiguredConnectionString => Given(configuration.GetConnectionString("Scry"));

    public string? ClientOrigin => Given(settings.ClientOrigin)?.TrimEnd('/') ?? file.ClientOrigin;

    public bool ClientOriginConfigured => Given(settings.ClientOrigin) is not null;

    /// <summary>The client's origin, once the instance knows it.</summary>
    public string Client => ClientOrigin ?? throw new InvalidOperationException("Scry has no client address yet. Set one at /install.");

    public string? ApiOrigin => Given(settings.ApiOrigin)?.TrimEnd('/') ?? file.ApiOrigin;

    public bool ApiOriginConfigured => Given(settings.ApiOrigin) is not null;

    /// <summary>This API's public origin, once the instance knows it.</summary>
    public string Api => ApiOrigin ?? throw new InvalidOperationException("Scry has no API address yet. Set one at /install.");

    private static string? Given(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public static class Origins
{
    /// <summary>
    /// The value as an origin, scheme and authority only, or null when it is not an http or https address with nothing
    /// after its host.
    /// </summary>
    public static string? Parse(string? value)
    {
        var text = value?.Trim().TrimEnd('/');
        if (string.IsNullOrEmpty(text) || !Uri.TryCreate(text, UriKind.Absolute, out var uri))
        {
            return null;
        }

        var schemeOk = uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp;
        var bare = uri.AbsolutePath == "/" && uri.Query.Length == 0 && uri.Fragment.Length == 0 && uri.UserInfo.Length == 0;
        return schemeOk && bare ? uri.GetLeftPart(UriPartial.Authority) : null;
    }
}
