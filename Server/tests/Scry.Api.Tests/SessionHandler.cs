using System.Net.Http.Json;
using System.Text.Json;

namespace Scry.Api.Tests;

/// <summary>
/// Signs in on a client's first request, then sends every unsafe request with a CSRF token, as the client's session
/// does. Sits outside the cookie handler, so its own requests keep the cookies too.
/// </summary>
internal sealed class SessionHandler(string email, string password) : DelegatingHandler
{
    private const string CsrfHeader = "X-CSRF-TOKEN";

    private readonly SemaphoreSlim _gate = new(1, 1);
    private string? _token;

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var token = await SignInOnceAsync(request.RequestUri!, cancellationToken);
        if (request.Method != HttpMethod.Get && request.Method != HttpMethod.Head && !request.Headers.Contains(CsrfHeader))
        {
            request.Headers.Add(CsrfHeader, token);
        }

        return await base.SendAsync(request, cancellationToken);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _gate.Dispose();
        }

        base.Dispose(disposing);
    }

    private async Task<string> SignInOnceAsync(Uri at, CancellationToken ct)
    {
        if (_token is { } signedIn)
        {
            return signedIn;
        }

        await _gate.WaitAsync(ct);
        try
        {
            if (_token is { } already)
            {
                return already;
            }

            var root = new Uri(at.GetLeftPart(UriPartial.Authority));
            using var signIn = new HttpRequestMessage(HttpMethod.Post, new Uri(root, "/auth/sign-in"))
            {
                Content = JsonContent.Create(new { email, password, remember = false }),
            };
            signIn.Headers.Add(CsrfHeader, await CsrfAsync(root, ct));
            using var answer = await base.SendAsync(signIn, ct);
            if (!answer.IsSuccessStatusCode)
            {
                throw new InvalidOperationException($"Signing in as {email} answered {(int)answer.StatusCode}: {await answer.Content.ReadAsStringAsync(ct)}");
            }

            // The antiforgery token is bound to who is signed in, so the session takes a new one.
            _token = await CsrfAsync(root, ct);
            return _token;
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task<string> CsrfAsync(Uri root, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(root, "/auth/csrf"));
        using var answer = await base.SendAsync(request, ct);
        answer.EnsureSuccessStatusCode();
        return (await answer.Content.ReadFromJsonAsync<JsonElement>(ct)).GetProperty("token").GetString()!;
    }
}
