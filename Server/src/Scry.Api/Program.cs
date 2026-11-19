using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Pluperfect.Jwt;
using Pluperfect.Mail;
using Scry.Api;
using Scry.Api.Auth;
using Scry.Api.Storage;
using Serilog;

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

// Development runs over plain http, so its cookies drop the __Host- prefix and the Secure flag. Sessions and the
// antiforgery cookie take the same answer.
var secureOrigin = !builder.Environment.IsDevelopment();

// The proxy is the only peer, so its headers are believed from any address; the setting must stay off wherever the
// API's own port can be reached.
if (settings.Proxied)
{
    builder.Services.Configure<ForwardedHeadersOptions>(options =>
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        options.KnownProxies.Clear();
        options.KnownIPNetworks.Clear();
    });
}

// Each host owns its logger and closes its file when it stops, leaving the static Log alone. Sinks registered as
// ILogEventSink, such as a test's, join the console and the file.
builder.Services.AddSerilog(
    (services, logger) => DeveloperLog.Configure(logger, builder.Configuration, dataDirectory).ReadFrom.Services(services),
    preserveStaticLogger: true);

builder.Services.AddSingleton(settings);
builder.Services.AddSingleton(TimeProvider.System);

// The keys that encrypt the Nexus links' app keys and the instance's database password live with the workspace's files,
// outside the database they protect.
builder.Services.AddDataProtection()
    .SetApplicationName("Scry")
    .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(dataDirectory, "keys")));

// What the installer and the Settings page set, and the configuration that may stand in for any of it.
builder.Services.AddSingleton(services => new InstanceFile(dataDirectory, services.GetRequiredService<IDataProtectionProvider>()));
builder.Services.AddSingleton(builder.Configuration.GetSection(PluperfectMailOptions.Section).Get<PluperfectMailOptions>() ?? new PluperfectMailOptions());
builder.Services.AddSingleton<Instance>();
builder.Services.AddSingleton<IDatabaseHost, MySqlDatabaseHost>();
builder.Services.AddSingleton<InstallCode>();
builder.Services.AddSingleton<InstallAccess>();
builder.Services.AddSingleton<Installation>();
builder.Services.AddSingleton<OperatorLogWriter>();
builder.Services.AddDbContext<ScryDbContext>((services, options) =>
{
    services.GetRequiredService<IDatabaseHost>().Configure(
        options,
        services.GetRequiredService<Installation>().ConnectionString ?? throw new InvalidOperationException(InstallGate.NotSetUp));
    options.AddInterceptors(services.GetRequiredService<OperatorLogWriter>());
});
builder.Services.AddScoped<OperatorLog>();
builder.Services.AddScoped<LogPruning>();
builder.Services.AddHostedService<LogPruner>();

builder.Services.AddSingleton<WorkspaceStore>();
builder.Services.AddScoped<WorkspaceAccess>();
builder.Services.AddScoped<CurrentWorkspace>();
builder.Services.AddSingleton<Secrets>();
builder.Services.AddMemoryCache();
builder.Services.AddHttpClient(NexusApi.HttpClientName);
builder.Services.AddSingleton<NexusApi>();
builder.Services.AddScoped<NexusSignIns>();
builder.Services.AddSingleton<NexusPairings>();
builder.Services.AddScoped<IngestKeys>();

builder.Services.AddHttpContextAccessor();
builder.Services.AddSingleton<SignInThrottle>();
builder.Services.AddSingleton<SignInLinks>();
builder.Services.AddScoped<Sessions>();
builder.Services.AddScoped<LinkMail>();
builder.Services.AddScoped<Admins>();
builder.Services.AddScoped<IRefreshTokenStore, RefreshTokenStore>();
builder.Services.AddPluperfectJwt(builder.Configuration, allowDevelopmentKey: false, secureOrigin: secureOrigin);
builder.Services.AddOptions<PluperfectJwtOptions>().PostConfigure<InstanceFile>((options, file) =>
{
    if (string.IsNullOrWhiteSpace(options.SigningKey))
    {
        options.SigningKey = file.SigningKey;
    }
});

builder.Services.AddHttpClient(InstanceMailer.HttpClientName, (services, client) =>
{
    client.BaseAddress = new Uri(InstanceMailer.BaseAddress);
    client.Timeout = TimeSpan.FromSeconds(services.GetRequiredService<PluperfectMailOptions>().TimeoutSeconds);
    client.DefaultRequestHeaders.Add("Accept", "application/json");
});
builder.Services.AddSingleton<IMailer, InstanceMailer>();

builder.Services.AddCors();
builder.Services.Replace(ServiceDescriptor.Singleton<ICorsPolicyProvider, InstanceCorsPolicy>());
builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
    options.Cookie.Name = (secureOrigin ? CookieTransport.HostPrefix : string.Empty) + "scrysrf";
    options.Cookie.HttpOnly = true;
    options.Cookie.SecurePolicy = secureOrigin ? CookieSecurePolicy.Always : CookieSecurePolicy.SameAsRequest;
    options.Cookie.SameSite = SameSiteMode.Lax;
});
builder.Services.AddSingleton<ClientOriginFilter>();
builder.Services.AddScoped<BearerAwareAntiforgery>();

// Deny by default: a route is open to anyone only with [AllowAnonymous], as the installer, the sign-in routes, and the
// push API are.
builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build())
    .AddPolicy(ScryClaims.AdminPolicy, policy => policy.RequireAuthenticatedUser().RequireClaim(ScryClaims.Admin, ScryClaims.True));

builder.Services.AddProblemDetails();
builder.Services
    .AddControllers(mvc =>
    {
        mvc.Filters.AddService<BearerAwareAntiforgery>();
        mvc.Filters.AddService<ClientOriginFilter>();
    })
    .AddJsonOptions(json => json.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

var app = builder.Build();

var installation = app.Services.GetRequiredService<Installation>();
await installation.StartAsync(CancellationToken.None);

// `add-admin <email>` makes or restores an admin, prints a one-time sign-in link, and exits: an operator's way in,
// beside the installer's.
if (args is ["add-admin", var email])
{
    if (!installation.DatabaseReady)
    {
        Console.Error.WriteLine($"Scry has no database it can open, so it cannot make an admin. {installation.DatabaseProblem ?? InstallGate.NotSetUp}");
        Environment.ExitCode = 1;
        return;
    }

    using var scope = app.Services.CreateScope();
    var link = await scope.ServiceProvider.GetRequiredService<Admins>().AddAsync(email, CancellationToken.None);
    Console.WriteLine($"{email} is an admin.");
    Console.WriteLine(link is null
        ? "The instance has no client address yet, so there is no sign-in link. Set it at /install."
        : $"This link signs them in once, within an hour:{Environment.NewLine}{link}");
    return;
}

// Before anything that reads the client's address or the scheme: the request log, antiforgery, and the install code.
if (settings.Proxied)
{
    app.UseForwardedHeaders();
}

app.UseSerilogRequestLogging(options =>
{
    // Without it the middleware writes to the static Log, which this host does not set.
    options.Logger = app.Services.GetRequiredService<Serilog.ILogger>();
    options.GetLevel = DeveloperLog.RequestLevel;
});

// Before authentication, so a refused preflight still carries CORS headers and the browser shows the real answer.
app.UseCors();
app.UseInstallGate();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

try
{
    await app.RunAsync();
}
catch (Exception ex) when (ex is not HostAbortedException)
{
    Program.LogStopped(app.Logger, ex);
    Environment.ExitCode = 1;
}

/// <summary>Exposed so WebApplicationFactory can find the entry point.</summary>
public partial class Program
{
    [LoggerMessage(Level = LogLevel.Critical, Message = "Scry stopped on an error it did not expect.")]
    internal static partial void LogStopped(Microsoft.Extensions.Logging.ILogger logger, Exception ex);
}
