using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Mvc.Filters;
using Pluperfect.Jwt;

namespace Scry.Api.Auth;

/// <summary>
/// Pluperfect.Jwt's antiforgery check, except on a request that carries an <c>Authorization</c> header, such as the
/// push API's key or the installer's code. A browser sends that header cross-site only after a CORS preflight, which
/// Scry answers for the client's origin alone, so such a request cannot be forged by another site.
/// </summary>
public sealed class BearerAwareAntiforgery(IAntiforgery antiforgery) : IAsyncAuthorizationFilter
{
    private readonly AntiforgeryFilter _inner = new(antiforgery, "/auth/csrf");

    public Task OnAuthorizationAsync(AuthorizationFilterContext context) =>
        context.HttpContext.Request.Headers.Authorization.Count > 0 ? Task.CompletedTask : _inner.OnAuthorizationAsync(context);
}
