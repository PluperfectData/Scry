using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Scry.Api.Auth;
using Scry.Api.Storage;
using Serilog.Core;

namespace Scry.Api.Tests;

/// <summary>
/// Hosts the real API over a SQLite file in a temporary data directory. An installed factory starts as the installer
/// leaves an instance: a stored database, client address, and API address, and an owner who is an admin and signs in
/// with <see cref="OwnerPassword"/>. It also has the workspace an instance's data moves into, Default, whose routes
/// start <see cref="InDefault"/>. It runs as Development, so cookies go over plain http, and mail lands as files in
/// <see cref="MailDirectory"/> unless the factory sends it to <see cref="Postmark"/>.
/// </summary>
public sealed class ScryApiFactory : WebApplicationFactory<Program>
{
    public const string ClientOrigin = "http://localhost:6160";

    public const string ApiOrigin = "http://localhost:6161";

    public const string OwnerEmail = "owner@scry.test";

    public const string OwnerPassword = "correct horse battery";

    /// <summary>A request carrying this header reaches the API as one from this machine.</summary>
    public const string LocalHeader = "X-Test-Local";

    /// <summary>Where the Default workspace's routes start. It is the first workspace a new database holds.</summary>
    public const string InDefault = "/workspaces/1";

    public static readonly DatabaseSettings StoredDatabase = new("db.scry.test", 3306, "scry", "scry", "stored-password");

    private static readonly string[] ConfiguredKeys =
    [
        "ConnectionStrings:Scry",
        "Jwt:SigningKey",
        "Mail:ServerToken",
        $"{ScrySettings.Section}:{nameof(ScrySettings.ClientOrigin)}",
        $"{ScrySettings.Section}:{nameof(ScrySettings.ApiOrigin)}",
        $"{ScrySettings.Section}:{nameof(ScrySettings.MailFrom)}",
        $"{ScrySettings.Section}:{nameof(ScrySettings.MailFromName)}",
    ];

    private readonly bool _mailToFiles;

    public ScryApiFactory(bool installed = true, bool mailToFiles = true)
    {
        _mailToFiles = mailToFiles;
        Directory.CreateDirectory(DataDirectory);
        Database = new SqliteDatabaseHost(SqliteConnectionString);
        if (installed)
        {
            var file = NewInstanceFile();
            file.SaveDatabase(StoredDatabase);
            file.SaveOrigins(ClientOrigin, ApiOrigin);
            using var db = NewContext();
            db.Database.EnsureCreated();
            var owner = new User { Email = OwnerEmail, IsAdmin = true, LinkStamp = SignInLinks.NewStamp(), CreatedAt = DateTime.UtcNow };
            owner.PasswordHash = Passwords.Hash(owner, OwnerPassword);
            db.Users.Add(owner);
            db.Workspaces.Add(new Workspace { Name = "Default", Folder = "default", CreatedAt = DateTime.UtcNow });
            db.SaveChanges();
        }
    }

    public string DataDirectory { get; } = Path.Combine(Path.GetTempPath(), "scry-tests", Guid.NewGuid().ToString("N"));

    public string MailDirectory => Path.Combine(DataDirectory, "mail");

    /// <summary>Postmark's API, for a factory that does not write mail to files.</summary>
    internal FakePostmark Postmark { get; } = new();

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

    /// <summary>A browser with its own cookies, signed out.</summary>
    public Browser NewBrowser()
    {
        var cookies = new CookieContainer();
        return new Browser(CreateDefaultClient(new Uri("http://localhost/"), new CookieContainerHandler(cookies)), cookies);
    }

    /// <summary>A browser signed in as a new user with a password.</summary>
    public async Task<Browser> SignedInAsync(string email, bool admin = false)
    {
        await AddUserAsync(email, Browser.Password, admin);
        var browser = NewBrowser();
        (await browser.SignInAsync(email, Browser.Password)).EnsureSuccessStatusCode();
        return browser;
    }

    /// <summary>A context on the API's database, usable before the API starts.</summary>
    public ScryDbContext NewContext() => new(new DbContextOptionsBuilder<ScryDbContext>().UseSqlite(SqliteConnectionString).Options);

    /// <summary>Adds a user, with a password when one is given.</summary>
    public async Task<User> AddUserAsync(string email, string? password = null, bool admin = false)
    {
        await using var db = NewContext();
        var user = new User { Email = email, IsAdmin = admin, LinkStamp = SignInLinks.NewStamp(), CreatedAt = DateTime.UtcNow };
        if (password is not null)
        {
            user.PasswordHash = Passwords.Hash(user, password);
        }

        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    /// <summary>Puts a user in a workspace with a role: in Default, unless another workspace is named.</summary>
    public async Task JoinAsync(string email, WorkspaceRole role, int workspaceId = 1)
    {
        await using var db = NewContext();
        var user = await db.Users.SingleAsync(u => u.Email == email);
        db.WorkspaceMembers.Add(new WorkspaceMember { WorkspaceId = workspaceId, UserId = user.Id, Role = role });
        await db.SaveChangesAsync();
    }

    /// <summary>The API's stored settings, from the same file and keys, usable before the API starts.</summary>
    public InstanceFile NewInstanceFile() =>
        new(DataDirectory, DataProtectionProvider.Create(new DirectoryInfo(Path.Combine(DataDirectory, "keys")), builder => builder.SetApplicationName("Scry")));

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");

        // Each value an operator may configure is blanked, so none reaches a test from this machine, and a test that
        // wants one sets it.
        foreach (var key in ConfiguredKeys)
        {
            builder.UseSetting(key, string.Empty);
        }

        builder.UseSetting($"{ScrySettings.Section}:{nameof(ScrySettings.DataDirectory)}", DataDirectory);
        builder.UseSetting("Mail:PickupDirectory", _mailToFiles ? MailDirectory : string.Empty);
        builder.UseSetting($"{SchwabApp.Section}:{nameof(SchwabApp.AppKey)}", "app-key");
        builder.UseSetting($"{SchwabApp.Section}:{nameof(SchwabApp.AppSecret)}", "app-secret");

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IDatabaseHost>();
            services.AddSingleton<IDatabaseHost>(Database);
            services.AddHttpClient(SchwabConnector.HttpClientName).ConfigurePrimaryHttpMessageHandler(() => Schwab);
            services.AddHttpClient(NexusApi.HttpClientName).ConfigurePrimaryHttpMessageHandler(() => Nexus);
            services.AddHttpClient(InstanceMailer.HttpClientName).ConfigurePrimaryHttpMessageHandler(() => Postmark);
            services.AddSingleton<IStartupFilter, PretendLocal>();
            services.AddSingleton<ILogEventSink>(Logs);
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

public static class SignedInClients
{
    /// <summary>
    /// A client that signs in as the user on its first request, and sends each unsafe request with a CSRF token, as the
    /// client's pages do.
    /// </summary>
    public static HttpClient SignedIn(
        this WebApplicationFactory<Program> factory,
        string email = ScryApiFactory.OwnerEmail,
        string password = ScryApiFactory.OwnerPassword) =>
        factory.CreateDefaultClient(new Uri("http://localhost/"), new SessionHandler(email, password), new CookieContainerHandler(new CookieContainer()));
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
