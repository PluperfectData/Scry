using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Scry.Api.Storage;

namespace Scry.Api.Tests;

/// <summary>Hosts the real API over a SQLite file in a temporary data directory.</summary>
public sealed class ScryApiFactory : WebApplicationFactory<Program>
{
    public string DataDirectory { get; } = Path.Combine(Path.GetTempPath(), "scry-tests", Guid.NewGuid().ToString("N"));

    /// <summary>The one database the API can read in tests, in place of Nexus's real ones.</summary>
    public FakeDatabase Database { get; } = new();

    /// <summary>Schwab's API as the Schwab connector and sign-in reach it in tests.</summary>
    public FakeSchwabApi Schwab { get; } = new();

    // Every context opens its own connection, since the background sync worker runs beside requests. Without
    // pooling, no connection holds the file open once its context is done, so the directory can be deleted.
    private string SqliteConnectionString => $"Data Source={Path.Combine(DataDirectory, "scry.db")};Pooling=False";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Scry", "Server=unused");
        builder.UseSetting($"{ScrySettings.Section}:{nameof(ScrySettings.DataDirectory)}", DataDirectory);
        builder.UseSetting($"{SchwabApp.Section}:{nameof(SchwabApp.AppKey)}", "app-key");
        builder.UseSetting($"{SchwabApp.Section}:{nameof(SchwabApp.AppSecret)}", "app-secret");

        builder.ConfigureTestServices(services =>
        {
            Directory.CreateDirectory(DataDirectory);
            services.RemoveAll<DbContextOptions<ScryDbContext>>();
            services.RemoveAll<IDbContextOptionsConfiguration<ScryDbContext>>();
            services.AddDbContext<ScryDbContext>(options => options.UseSqlite(SqliteConnectionString));
            services.RemoveAll<DatabaseConnectors>();
            services.AddSingleton(new DatabaseConnectors([Database]));
            services.AddHttpClient(SchwabConnector.HttpClientName).ConfigurePrimaryHttpMessageHandler(() => Schwab);
        });
    }

    protected override IHost CreateHost(IHostBuilder builder)
    {
        var host = base.CreateHost(builder);
        using var scope = host.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<ScryDbContext>().Database.EnsureCreated();
        return host;
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing && Directory.Exists(DataDirectory))
        {
            Directory.Delete(DataDirectory, recursive: true);
        }
    }
}
