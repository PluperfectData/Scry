using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Scry.Api.Storage;

namespace Scry.Api.Tests;

/// <summary>
/// Hosts the real API over a SQLite file in a temporary data directory. An installed factory starts as the installer
/// leaves an instance: a stored database, client address, and API address.
/// </summary>
public sealed class ScryApiFactory : WebApplicationFactory<Program>
{
    public const string ClientOrigin = "http://localhost:6160";

    public const string ApiOrigin = "http://localhost:6161";

    /// <summary>A request carrying this header reaches the API as one from this machine.</summary>
    public const string LocalHeader = "X-Test-Local";

    public static readonly DatabaseSettings StoredDatabase = new("db.scry.test", 3306, "scry", "scry", "stored-password");

    private static readonly string[] ConfiguredKeys =
    [
        "ConnectionStrings:Scry",
        $"{ScrySettings.Section}:{nameof(ScrySettings.ClientOrigin)}",
        $"{ScrySettings.Section}:{nameof(ScrySettings.ApiOrigin)}",
    ];

    public ScryApiFactory(bool installed = true)
    {
        Directory.CreateDirectory(DataDirectory);
        Database = new SqliteDatabaseHost(SqliteConnectionString);
        if (installed)
        {
            var file = NewInstanceFile();
            file.SaveDatabase(StoredDatabase);
            file.SaveOrigins(ClientOrigin, ApiOrigin);
        }
    }

    public string DataDirectory { get; } = Path.Combine(Path.GetTempPath(), "scry-tests", Guid.NewGuid().ToString("N"));

    /// <summary>Schwab's API as the Schwab connector and sign-in reach it in tests.</summary>
    public FakeSchwabApi Schwab { get; } = new();

    /// <summary>A Nexus instance as Scry's link reaches it in tests.</summary>
    public FakeNexus Nexus { get; } = new();

    /// <summary>The database the API opens, whatever it is told to connect to.</summary>
    internal SqliteDatabaseHost Database { get; }

    /// <summary>Every line the API logged, as written.</summary>
    internal LogCapture Logs { get; } = new();

    // Every context opens its own connection, since the background sync worker runs beside requests. Without
    // pooling, no connection holds the file open once its context is done, so the directory can be deleted.
    private string SqliteConnectionString => $"Data Source={Path.Combine(DataDirectory, "scry.db")};Pooling=False";

    /// <summary>The API's stored settings, from the same file and keys, usable before the API starts.</summary>
    public InstanceFile NewInstanceFile() =>
        new(DataDirectory, DataProtectionProvider.Create(new DirectoryInfo(Path.Combine(DataDirectory, "keys")), builder => builder.SetApplicationName("Scry")));

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        // Each value an operator may configure is blanked, so none reaches a test from this machine, and a test that
        // wants one sets it.
        foreach (var key in ConfiguredKeys)
        {
            builder.UseSetting(key, string.Empty);
        }

        builder.UseSetting($"{ScrySettings.Section}:{nameof(ScrySettings.DataDirectory)}", DataDirectory);
        builder.UseSetting($"{SchwabApp.Section}:{nameof(SchwabApp.AppKey)}", "app-key");
        builder.UseSetting($"{SchwabApp.Section}:{nameof(SchwabApp.AppSecret)}", "app-secret");

        builder.ConfigureLogging(logging => logging.AddProvider(Logs));
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IDatabaseHost>();
            services.AddSingleton<IDatabaseHost>(Database);
            services.AddHttpClient(SchwabConnector.HttpClientName).ConfigurePrimaryHttpMessageHandler(() => Schwab);
            services.AddHttpClient(NexusApi.HttpClientName).ConfigurePrimaryHttpMessageHandler(() => Nexus);
            services.AddSingleton<IStartupFilter, PretendLocal>();
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing && Directory.Exists(DataDirectory))
        {
            Directory.Delete(DataDirectory, recursive: true);
        }
    }

    // The test server gives no remote address, so a request reaches the API from this machine only when it asks to.
    private sealed class PretendLocal : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            app.Use((http, after) =>
            {
                if (http.Request.Headers.Remove(LocalHeader))
                {
                    http.Connection.RemoteIpAddress = IPAddress.Loopback;
                }

                return after(http);
            });
            next(app);
        };
    }
}

/// <summary>Opens the test's SQLite file whatever database the API is told to use, and refuses when told to.</summary>
internal sealed class SqliteDatabaseHost(string connectionString) : IDatabaseHost
{
    /// <summary>Why the next databases are refused, in the words a server would use, or null to open them.</summary>
    public string? Refusal { get; set; }

    /// <summary>Each connection string the API asked to open.</summary>
    public List<string> Prepared { get; } = [];

    public void Configure(DbContextOptionsBuilder options, string given) => options.UseSqlite(connectionString);

    public async Task PrepareAsync(string given, CancellationToken ct)
    {
        Prepared.Add(given);
        if (Refusal is { } refusal)
        {
            throw new DatabaseException(refusal);
        }

        await using var db = new ScryDbContext(new DbContextOptionsBuilder<ScryDbContext>().UseSqlite(connectionString).Options);
        await db.Database.EnsureCreatedAsync(ct);
    }
}
