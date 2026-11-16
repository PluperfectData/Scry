using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Nexus;
using Nexus.Schwab;
using Scry.Api.Storage;

namespace Scry.Api.Controllers;

/// <summary>A stream Schwab offers, by its name, with its number of columns.</summary>
public sealed record StreamSummary(string Name, int Columns);

/// <summary>A stream to add, by its name as <paramref name="Table"/>, and the name of the source it becomes.</summary>
public sealed record TableChoice(string Table, string Name);

/// <summary>Schwab's settings for a new connection, and the streams to add as sources under the names given them.</summary>
public sealed record SchwabSignInRequest(Dictionary<string, string?> Settings, IReadOnlyList<TableChoice> Streams);

/// <summary>Schwab's sign-in page, for the browser to go to.</summary>
public sealed record SignInView(Uri Url);

[ApiController]
[Route("schwab")]
public sealed class SchwabController(
    ScryDbContext db,
    SchwabConnector schwab,
    SchwabSignIns signIns,
    ConnectionSecrets secrets,
    PendingSyncs queue,
    ScrySettings settings) : ControllerBase
{
    /// <summary>The streams a Schwab connection offers. Listing them needs no sign-in.</summary>
    [HttpGet("streams")]
    public async Task<IReadOnlyList<StreamSummary>> Streams(CancellationToken ct) =>
        (await Catalog(ct)).Select(stream => new StreamSummary(stream.Name, stream.Columns.Count)).ToList();

    /// <summary>Checks the picked streams' names and starts a sign-in for a new connection.</summary>
    [HttpPost("sign-in")]
    public async Task<ActionResult<SignInView>> SignIn(SchwabSignInRequest request, CancellationToken ct)
    {
        if (schwab.App.Client is not { } app)
        {
            return NotSetUp();
        }

        var streams = request.Streams.Select(choice => choice with { Name = choice.Name.Trim() }).ToList();
        if (await SourceNames.CheckAsync(db, [.. streams.Select(choice => choice.Name)], "stream", ct) is { } problem)
        {
            return Problem(problem.Detail, statusCode: problem.Status);
        }

        var offered = (await Catalog(ct)).Select(stream => stream.Name).ToHashSet();
        if (streams.FirstOrDefault(choice => !offered.Contains(choice.Table)) is { } unknown)
        {
            return Problem($"Schwab has no stream named '{unknown.Table}'.", statusCode: StatusCodes.Status400BadRequest);
        }

        // Scry only reads, so a connection never allows orders.
        var kept = request.Settings.Where(setting => setting.Key != SchwabSettings.AllowOrders).ToDictionary();
        var state = signIns.Start(new PendingSignIn(kept, streams, ConnectionId: null));
        return new SignInView(SchwabSignIn.AuthorizeUrl(app, schwab.App.CallbackUrl, state));
    }

    /// <summary>Starts a sign-in that renews the one a Schwab source's connection holds.</summary>
    [HttpPost("~/sources/{id:int}/sign-in")]
    public async Task<ActionResult<SignInView>> SignInAgain(int id, CancellationToken ct)
    {
        if (schwab.App.Client is not { } app)
        {
            return NotSetUp();
        }

        if (await db.Sources.Include(s => s.Connection).FirstOrDefaultAsync(s => s.Id == id, ct) is not { } source)
        {
            return NotFound();
        }

        if (source.Connection?.Connector != SchwabConnector.Id)
        {
            return Problem("Only a Schwab source signs in.", statusCode: StatusCodes.Status400BadRequest);
        }

        var state = signIns.Start(new PendingSignIn(new Dictionary<string, string?>(), [], source.ConnectionId));
        return new SignInView(SchwabSignIn.AuthorizeUrl(app, schwab.App.CallbackUrl, state));
    }

    /// <summary>
    /// Where Schwab sends the browser after its sign-in. Keeps the tokens, queues each source to sync in the background,
    /// and sends the browser back to the Sources page, with <c>error</c> when the sign-in failed.
    /// </summary>
    [HttpGet("callback")]
    public async Task<IActionResult> Callback(string? code, string? state, string? error, CancellationToken ct)
    {
        if (signIns.Take(state) is not { } pending)
        {
            return BackToSources("This sign-in ran out of time, or did not start in Scry. Sign in again.");
        }

        if (string.IsNullOrEmpty(code))
        {
            return BackToSources($"Schwab did not sign you in: {error ?? "no reason given"}.");
        }

        OAuthTokens tokens;
        try
        {
            tokens = await schwab.ExchangeAsync(code, ct);
        }
        catch (ConnectorException ex)
        {
            return BackToSources(ex.Message);
        }

        List<Source> sources;
        if (pending.ConnectionId is { } connectionId)
        {
            if (await db.Connections.FindAsync([connectionId], ct) is not { } connection)
            {
                return BackToSources("The Schwab connection this sign-in was for has been removed.");
            }

            connection.Tokens = secrets.ProtectTokens(tokens);
            sources = await db.Sources.Where(source => source.ConnectionId == connectionId).ToListAsync(ct);
        }
        else
        {
            // A name may have been taken while Schwab had the browser.
            if (await SourceNames.CheckAsync(db, [.. pending.Streams.Select(choice => choice.Name)], "stream", ct) is { } problem)
            {
                return BackToSources(problem.Detail);
            }

            var connection = new Connection
            {
                Connector = SchwabConnector.Id,
                Settings = secrets.Protect(pending.Settings),
                Tokens = secrets.ProtectTokens(tokens),
                CreatedAt = DateTime.UtcNow,
            };
            sources = pending.Streams
                .Select(choice => new Source
                {
                    Name = choice.Name,
                    Connection = connection,
                    Stream = choice.Table,
                    Incremental = true,
                    Columns = "[]",
                })
                .ToList();
            db.Connections.Add(connection);
            db.Sources.AddRange(sources);
        }

        foreach (var source in sources)
        {
            source.Status = SourceStatus.Syncing;
            source.Error = null;
        }

        await db.SaveChangesAsync(ct);
        foreach (var source in sources)
        {
            queue.Enqueue(source.Id);
        }

        return Redirect($"{settings.ClientOrigin}/sources");
    }

    private async Task<IReadOnlyList<StreamSpec>> Catalog(CancellationToken ct) =>
        (await schwab.Source().DiscoverAsync(new ConnectorConfig(new Dictionary<string, string?>()), ct)).Streams;

    private RedirectResult BackToSources(string error) =>
        Redirect($"{settings.ClientOrigin}/sources?error={Uri.EscapeDataString(error)}");

    private ObjectResult NotSetUp() =>
        Problem(
            $"Set {string.Join(" and ", schwab.App.Missing)} in Scry's settings before signing in to Schwab.",
            statusCode: StatusCodes.Status400BadRequest);
}
