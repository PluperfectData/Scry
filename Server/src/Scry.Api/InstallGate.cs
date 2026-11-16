using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Scry.Api;

public static class InstallGate
{
    public const string NotSetUp = "Scry is not set up yet. Open /install on its client to set it up.";

    /// <summary>The routes that answer before the instance is set up.</summary>
    public static bool IsOpen(PathString path) => path.StartsWithSegments("/install") || path.StartsWithSegments("/health");

    /// <summary>Answers 503 to every route but the open ones until the instance is set up.</summary>
    public static IApplicationBuilder UseInstallGate(this IApplicationBuilder app) => app.Use(async (http, next) =>
    {
        if (IsOpen(http.Request.Path) || http.RequestServices.GetRequiredService<Installation>().IsInstalled)
        {
            await next(http);
            return;
        }

        http.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
        await http.RequestServices.GetRequiredService<IProblemDetailsService>().WriteAsync(new ProblemDetailsContext
        {
            HttpContext = http,
            ProblemDetails = new ProblemDetails { Status = StatusCodes.Status503ServiceUnavailable, Title = "Not set up", Detail = NotSetUp },
        });
    });
}

/// <summary>
/// CORS for the client's origin alone, read from the instance on each request. Before the instance is set up, and on
/// the installer's routes, any origin's page may call: those routes check the caller themselves.
/// </summary>
public sealed class InstanceCorsPolicy(Installation installation, Instance instance) : ICorsPolicyProvider
{
    public Task<CorsPolicy?> GetPolicyAsync(HttpContext context, string? policyName)
    {
        var origin = context.Request.Headers.Origin.ToString();
        if (string.IsNullOrEmpty(origin))
        {
            return Task.FromResult<CorsPolicy?>(null);
        }

        var open = InstallGate.IsOpen(context.Request.Path) || !installation.IsInstalled;
        var allowed = open ? origin : instance.ClientOrigin;
        return Task.FromResult(allowed is null ? null : new CorsPolicyBuilder().WithOrigins(allowed).AllowAnyHeader().AllowAnyMethod().Build());
    }
}
