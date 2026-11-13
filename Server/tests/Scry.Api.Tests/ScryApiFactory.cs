using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Scry.Api.Data;

namespace Scry.Api.Tests;

/// <summary>Hosts the real API over in-memory SQLite and a temporary data directory.</summary>
public sealed class ScryApiFactory : WebApplicationFactory<Program>
{
    // An in-memory SQLite database lives only while a connection to it is open.
    private readonly SqliteConnection _database = new("DataSource=:memory:");

    public string DataDirectory { get; } = Path.Combine(Path.GetTempPath(), "scry-tests", Guid.NewGuid().ToString("N"));

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Scry", "Server=unused");
        builder.UseSetting($"{ScrySettings.Section}:{nameof(ScrySettings.DataDirectory)}", DataDirectory);

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<DbContextOptions<ScryDbContext>>();
            services.RemoveAll<IDbContextOptionsConfiguration<ScryDbContext>>();
            _database.Open();
            services.AddDbContext<ScryDbContext>(options => options.UseSqlite(_database));
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
        if (disposing)
        {
            _database.Dispose();
            if (Directory.Exists(DataDirectory))
            {
                Directory.Delete(DataDirectory, recursive: true);
            }
        }
    }
}
