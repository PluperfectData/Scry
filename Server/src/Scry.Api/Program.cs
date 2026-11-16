using System.Text.Json.Serialization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Scry.Api;
using Scry.Api.Storage;

var builder = WebApplication.CreateBuilder(args);

var settings = builder.Configuration.GetSection(ScrySettings.Section).Get<ScrySettings>() ?? new ScrySettings();
var connectionString = builder.Configuration.GetConnectionString("Scry");
if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException("Set ConnectionStrings:Scry to a MySQL connection string.");
}

builder.Services.AddSingleton(settings);
builder.Services.AddSingleton(builder.Configuration.GetSection(SchwabApp.Section).Get<SchwabApp>() ?? new SchwabApp());
builder.Services.AddSingleton<Workspace>();
builder.Services.AddSingleton(DatabaseConnectors.FromNexus());
builder.Services.AddHttpClient(SchwabConnector.HttpClientName);
builder.Services.AddSingleton<SchwabConnector>();
builder.Services.AddSingleton<SourceConnectors>();
builder.Services.AddSingleton<ConnectionSecrets>();
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<SchwabSignIns>();
builder.Services.AddHttpClient(NexusApi.HttpClientName);
builder.Services.AddSingleton<NexusApi>();
builder.Services.AddSingleton<NexusPairings>();
builder.Services.AddScoped<SourceSync>();
builder.Services.AddSingleton<PendingSyncs>();
builder.Services.AddScoped<IngestKeys>();
builder.Services.AddHostedService<SyncWorker>();
// The keys that encrypt stored connections live with the workspace's files, outside the database they protect.
builder.Services.AddDataProtection()
    .SetApplicationName("Scry")
    .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(builder.Environment.ContentRootPath, settings.DataDirectory, "keys")));
builder.Services.AddDbContext<ScryDbContext>(options => options.UseMySql(connectionString, ScryDbContext.ServerVersion));
builder.Services.AddCors(cors => cors.AddDefaultPolicy(policy =>
    policy.WithOrigins(settings.ClientOrigin).AllowAnyHeader().AllowAnyMethod()));
builder.Services.AddProblemDetails();
builder.Services.AddControllers().AddJsonOptions(json =>
    json.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ScryDbContext>();
    if (db.Database.IsMySql())
    {
        await db.Database.MigrateAsync();

        // A background sync that a restart cut off starts again.
        var queue = app.Services.GetRequiredService<PendingSyncs>();
        foreach (var id in await db.Sources.Where(source => source.Status == SourceStatus.Syncing).Select(source => source.Id).ToListAsync())
        {
            queue.Enqueue(id);
        }
    }
}

app.UseCors();
app.MapControllers();

await app.RunAsync();

/// <summary>Exposed so WebApplicationFactory can find the entry point.</summary>
public partial class Program;
