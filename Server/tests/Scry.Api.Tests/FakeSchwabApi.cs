using System.Net;
using System.Text;

namespace Scry.Api.Tests;

/// <summary>
/// Answers Schwab's token and accounts calls as a test sets them, in place of Schwab, and records each request's path
/// and body.
/// </summary>
public sealed class FakeSchwabApi : HttpMessageHandler
{
    public const string Tokens = """{ "expires_in": 1800, "refresh_token": "refresh-token", "access_token": "access-token" }""";

    public const string OneAccount = """
        [{
          "securitiesAccount": {
            "type": "MARGIN", "accountNumber": "11111111",
            "currentBalances": { "cashBalance": 250.75, "equity": 1600.5 }
          },
          "aggregatedBalance": { "liquidationValue": 1600.5 }
        }]
        """;

    public List<(string Path, string? Body)> Requests { get; } = [];

    public (HttpStatusCode Status, string Body) TokenReply { get; set; } = (HttpStatusCode.OK, Tokens);

    public (HttpStatusCode Status, string Body) AccountsReply { get; set; } = (HttpStatusCode.OK, OneAccount);

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var body = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
        var path = request.RequestUri!.AbsolutePath;
        lock (Requests)
        {
            Requests.Add((path, body));
        }

        var (status, json) = path switch
        {
            "/v1/oauth/token" => TokenReply,
            "/trader/v1/accounts" => AccountsReply,
            _ => (HttpStatusCode.NotFound, "{}"),
        };
        return new HttpResponseMessage(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
    }
}
