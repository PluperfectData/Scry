using System.Text.Json;
using System.Threading.Channels;
using Microsoft.EntityFrameworkCore;
using Nexus;
using Scry.Api.Storage;

namespace Scry.Api;

/// <summary>Syncs a connection's stream into its source's table, in its workspace, and records on the source how it went.</summary>
public sealed class SourceSync(ScryDbContext db, WorkspaceStore store, SourceConnectors connectors, ConnectionSecrets secrets, OperatorLog log)
{
    private const int MaxErrorLength = 1000;

    /// <summary>Syncs <paramref name="source"/>, loaded with its connection. A connector's failure is recorded, then thrown.</summary>
    public async Task RunAsync(Source source, CancellationToken ct)
    {
        var connection = source.Connection
            ?? throw new InvalidOperationException($"Source {source.Id} has no connection to sync from.");
        try
        {
            var connector = connectors.Find(connection.Connector)
                ?? throw new ConnectorException(ConnectorErrorKind.ConfigInvalid, $"'{connection.Connector}' is not a connector Scry reads.");
            var config = new ConnectorConfig(
                secrets.Unprotect(connection.Settings),
                Tokens: secrets.UnprotectTokens(connection.Tokens),
                Client: connectors.ClientFor(connection.Connector));

            var workspace = store.For(await db.Workspaces.AsNoTracking().SingleAsync(w => w.Id == source.WorkspaceId, ct));
            var result = await workspace.SyncAsync(
                connector,
                config,
                source.Stream!,
                source.Name,
                source.Incremental ? SyncMode.Incremental : SyncMode.FullRefresh,
                source.Incremental && source.State is { } state ? JsonSerializer.Deserialize<JsonElement>(state) : null,
                async tokens =>
                {
                    connection.Tokens = secrets.ProtectTokens(tokens);
                    await db.SaveChangesAsync(ct);
                },
                ct);

            source.Columns = ColumnInfo.Serialize(result.Columns);
            source.RowCount = result.RowCount;
            source.State = source.Incremental ? result.State?.GetRawText() : null;
            source.SyncedAt = DateTime.UtcNow;
            source.Status = SourceStatus.Ready;
            source.Error = null;
            log.Info($"Source {source.Name} synced from {connector.Spec.DisplayName}, and holds {LogWords.Rows(result.RowCount)}.", LogPlace.On(source));
        }
        catch (ConnectorException ex)
        {
            source.Status = ex.Kind == ConnectorErrorKind.AuthExpired ? SourceStatus.SignInNeeded : SourceStatus.Failed;
            source.Error = ex.Message.Length > MaxErrorLength ? ex.Message[..MaxErrorLength] : ex.Message;
            if (ex.Kind == ConnectorErrorKind.AuthExpired)
            {
                log.Warn($"Source {source.Name} needs a new sign-in before it syncs again: {ex.Message} Sign in again from its card on the Sources page.", LogPlace.On(source));
            }
            else
            {
                log.Error($"Source {source.Name} failed to sync: {ex.Message}", LogPlace.On(source));
            }

            await db.SaveChangesAsync(CancellationToken.None);
            throw;
        }

        await db.SaveChangesAsync(ct);
    }
}

/// <summary>The ids of sources waiting for <see cref="SyncWorker"/>, in the order they were added.</summary>
public sealed class PendingSyncs
{
    private readonly Channel<(int SourceId, int Database)> _ids = Channel.CreateUnbounded<(int, int)>();
    private int _database;

    public void Enqueue(int sourceId) => _ids.Writer.TryWrite((sourceId, Volatile.Read(ref _database)));

    /// <summary>Drops every source waiting: they belong to the database Scry moves away from.</summary>
    public void Forget() => Interlocked.Increment(ref _database);

    /// <summary>Queues again every source that was syncing when Scry last stopped.</summary>
    public async Task RequeueAsync(ScryDbContext db, CancellationToken ct)
    {
        foreach (var id in await db.Sources.Where(source => source.Status == SourceStatus.Syncing).OrderBy(source => source.Id).Select(source => source.Id).ToListAsync(ct))
        {
            Enqueue(id);
        }
    }

    public async IAsyncEnumerable<int> ReadAllAsync([System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        await foreach (var (id, database) in _ids.Reader.ReadAllAsync(ct))
        {
            if (database == Volatile.Read(ref _database))
            {
                yield return id;
            }
        }
    }
}

/// <summary>Syncs each queued source in turn, in the background, recording how each one went.</summary>
public sealed partial class SyncWorker(PendingSyncs queue, IServiceScopeFactory scopes, ILogger<SyncWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var id in queue.ReadAllAsync(stoppingToken))
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ScryDbContext>();
            if (await db.Sources.Include(s => s.Connection).FirstOrDefaultAsync(s => s.Id == id, stoppingToken) is not { } source)
            {
                continue;
            }

            try
            {
                await scope.ServiceProvider.GetRequiredService<SourceSync>().RunAsync(source, stoppingToken);
            }
            catch (ConnectorException)
            {
                // RunAsync has recorded the failure on the source.
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                LogFailure(logger, ex, source.Id);
                source.Status = SourceStatus.Failed;
                source.Error = "The sync stopped on an error Scry did not expect. Sync again; the Log page has the error.";
                scope.ServiceProvider.GetRequiredService<OperatorLog>().Error(
                    $"Source {source.Name} stopped syncing on an error Scry did not expect: {ex.GetType().Name}: {ex.Message}",
                    LogPlace.On(source));
                await db.SaveChangesAsync(CancellationToken.None);
            }
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "The background sync of source {SourceId} failed.")]
    private static partial void LogFailure(ILogger logger, Exception ex, int sourceId);
}
