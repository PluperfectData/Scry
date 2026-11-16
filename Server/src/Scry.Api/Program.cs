using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Scry.Api;
using Scry.Api.Storage;

var builder = WebApplication.CreateBuilder(args);

var settings = builder.Configuration.GetSection(ScrySettings.Section).Get<ScrySettings>() ?? new ScrySettings();
var dataDirectory = Path.Combine(builder.Environment.ContentRootPath, settings.DataDirectory);

#if DEBUG
// `reset` sets aside the stored settings, so the next start opens the installer at its first step.
if (args is ["reset"])
{
    Environment.ExitCode = InstanceReset.Run(builder.Environment.IsDevelopment(), dataDirectory, builder.Configuration, Console.Out, TimeProvider.System);
    return;
}
#endif

builder.Services.AddSingleton(settings);
builder.Services.AddSingleton(TimeProvider.System);

// The keys that encrypt stored connections and the instance's database password live with the workspace's files,
// outside the database they protect.
builder.Services.AddDataProtection()
    .SetApplicationName("Scry")
    .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(dataDirectory, "keys")));

// What the installer and the Settings page set, and the configuration that may stand in for any of it.
builder.Services.AddSingleton(services => new InstanceFile(dataDirectory, services.GetRequiredService<IDataProtectionProvider>()));
builder.Services.AddSingleton<Instance>();
builder.Services.AddSingleton<IDatabaseHost, MySqlDatabaseHost>();
builder.Services.AddSingleton<InstallCode>();
builder.Services.AddSingleton<InstallAccess>();
builder.Services.AddSingleton<Installation>();
builder.Services.AddDbContext<ScryDbContext>((services, options) => services.GetRequiredService<IDatabaseHost>().Configure(
    options,
    services.GetRequiredService<Installation>().ConnectionString ?? throw new InvalidOperationException(InstallGate.NotSetUp)));

builder.Services.AddSingleton(builder.Configuration.GetSection(SchwabApp.Section).Get<SchwabApp>() ?? new SchwabApp());
builder.Services.AddSingleton<Workspace>();
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
builder.Services.AddCors();
builder.Services.Replace(ServiceDescriptor.Singleton<ICorsPolicyProvider, InstanceCorsPolicy>());
builder.Services.AddProblemDetails();
builder.Services.AddControllers().AddJsonOptions(json =>
    json.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

var app = builder.Build();

await app.Services.GetRequiredService<Installation>().StartAsync(CancellationToken.None);

app.UseCors();
app.UseInstallGate();
app.MapControllers();

await app.RunAsync();

/// <summary>Exposed so WebApplicationFactory can find the entry point.</summary>
public partial class Program;
