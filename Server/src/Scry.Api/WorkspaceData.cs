using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using DuckDB.NET.Data;
using Nexus;
using Nexus.Csv;
using Nexus.DuckDb;

namespace Scry.Api;

/// <summary>A synced table's columns and row count, and the connector's last checkpoint.</summary>
public sealed record SyncResult(IReadOnlyList<ColumnInfo> Columns, long RowCount, JsonElement? State);

/// <summary>A workspace's files: its uploads and its DuckDB file. Every DuckDB access takes the file's one lock.</summary>
public sealed partial class WorkspaceData : IDisposable
{
    private readonly SemaphoreSlim _lock = new(1, 1);

    public WorkspaceData(string root)
    {
        Root = root;
        Uploads = Path.Combine(Root, "uploads");
        Database = Path.Combine(Root, "data.duckdb");
    }

    public string Root { get; }

    public string Uploads { get; }

    public string Database { get; }

    /// <summary>Deletes the folder, uploads and DuckDB file with it, once no read or write of it is under way.</summary>
    public async Task DeleteAsync(CancellationToken ct)
    {
        await _lock.WaitAsync(ct);
        try
        {
            if (Directory.Exists(Root))
            {
                Directory.Delete(Root, recursive: true);
            }
        }
        finally
        {
            _lock.Release();
        }
    }

    /// <summary>Reads a CSV file through Nexus and replaces <paramref name="table"/> with it.</summary>
    public Task<SyncResult> SyncCsvAsync(string table, string fileName, string storedPath, string? delimiter, CancellationToken ct)
    {
        var config = new ConnectorConfig(
            new Dictionary<string, string?>
            {
                [CsvSource.StreamSetting] = table,
                [CsvSource.DelimiterSetting] = delimiter,
            },
            Files: new Dictionary<string, ConnectorFile>
            {
                [CsvSource.FileSetting] = new(fileName, _ => Task.FromResult<Stream>(File.OpenRead(storedPath))),
            });
        return SyncAsync(new CsvSource(), config, table, table, ct);
    }

    /// <summary>
    /// Reads all of <paramref name="stream"/> from <paramref name="source"/> through Nexus and replaces
    /// <paramref name="table"/> with it.
    /// </summary>
    public Task<SyncResult> SyncAsync(ISourceConnector source, ConnectorConfig config, string stream, string table, CancellationToken ct) =>
        SyncAsync(source, config, stream, table, SyncMode.FullRefresh, null, null, ct);

    /// <summary>
    /// Reads <paramref name="stream"/> from <paramref name="source"/> through Nexus into <paramref name="table"/>. A full
    /// refresh replaces the table; an incremental read starts from <paramref name="state"/> and merges into it by the
    /// stream's primary key. Tokens the connector refreshes go to <paramref name="saveTokens"/> as they come.
    /// </summary>
    public async Task<SyncResult> SyncAsync(
        ISourceConnector source,
        ConnectorConfig config,
        string stream,
        string table,
        SyncMode mode,
        JsonElement? state,
        Func<OAuthTokens, Task>? saveTokens,
        CancellationToken ct)
    {
        var destinationConfig = new ConnectorConfig(
            new Dictionary<string, string?> { [DuckDbDestination.PathSetting] = Database });

        StreamSpec? spec = null;
        JsonElement? checkpoint = null;
        long rows;

        // The table is named for the Scry source, not for the stream, which may be a database's schema.table.
        async IAsyncEnumerable<SyncMessage> Renamed(IAsyncEnumerable<SyncMessage> messages)
        {
            await foreach (var message in messages)
            {
                switch (message)
                {
                    case SchemaMessage schema when schema.Stream.Name == stream:
                        spec = schema.Stream with { Name = table };
                        yield return new SchemaMessage(spec);
                        break;
                    case RecordBatch batch when batch.Stream == stream:
                        yield return batch with { Stream = table };
                        break;
                    case StateCheckpoint read when read.Stream == stream:
                        yield return read with { Stream = table };
                        break;
                    case CredentialsRefreshed refreshed when saveTokens is not null:
                        await saveTokens(refreshed.Tokens);
                        yield return message;
                        break;
                    default:
                        yield return message;
                        break;
                }
            }
        }

        await _lock.WaitAsync(ct);
        try
        {
            Directory.CreateDirectory(Root);
            var request = new ReadRequest(
                [new StreamSelection(stream, mode)],
                state is { } saved ? new Dictionary<string, JsonElement> { [stream] = saved } : null);
            var read = source.ReadAsync(config, request, ct);
            var write = new DuckDbDestination().WriteAsync(
                destinationConfig,
                new WriteRequest(new Dictionary<string, WriteMode>
                {
                    [table] = mode == SyncMode.Incremental ? WriteMode.Upsert : WriteMode.Overwrite,
                }),
                Renamed(read),
                ct);

            // The destination yields each checkpoint once it has committed the rows before it.
            await foreach (var message in write)
            {
                if (message is StateCheckpoint committed)
                {
                    checkpoint = committed.State.Clone();
                }
            }

            rows = spec is null ? 0 : await CountAsync(table, ct);
        }
        finally
        {
            _lock.Release();
        }

        var written = spec ?? throw new InvalidOperationException($"The source sent no schema for {stream}.");
        return new SyncResult(written.Columns.Select(column => new ColumnInfo(column.Name, column.Type)).ToList(), rows, checkpoint);
    }

    // An incremental sync adds to the table, so the rows it read are not the rows it holds.
    [SuppressMessage("Security", "CA2100", Justification = "A source name holds only lowercase letters, digits, and underscores.")]
    private async Task<long> CountAsync(string table, CancellationToken ct)
    {
        await using var connection = new DuckDBConnection($"Data Source={Database}");
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = $"SELECT COUNT(*) FROM \"{table}\"";
        return Convert.ToInt64(await command.ExecuteScalarAsync(ct), System.Globalization.CultureInfo.InvariantCulture);
    }

    /// <summary>Runs a query built by <see cref="ChartQueries"/> and returns at most <paramref name="limit"/> rows.</summary>
    [SuppressMessage("Security", "CA2100", Justification = "ChartQueries checks every identifier against the source's columns and quotes it.")]
    public async Task<List<object?[]>> QueryAsync(string sql, int limit, CancellationToken ct)
    {
        await _lock.WaitAsync(ct);
        try
        {
            if (!File.Exists(Database))
            {
                return [];
            }

            await using var connection = new DuckDBConnection($"Data Source={Database}");
            await connection.OpenAsync(ct);
            await using var command = connection.CreateCommand();
            command.CommandText = sql;
            await using var reader = await command.ExecuteReaderAsync(ct);

            var rows = new List<object?[]>();
            while (rows.Count < limit && await reader.ReadAsync(ct))
            {
                var row = new object?[reader.FieldCount];
                for (var i = 0; i < row.Length; i++)
                {
                    row[i] = await reader.IsDBNullAsync(i, ct) ? null : reader.GetValue(i);
                }

                rows.Add(row);
            }

            return rows;
        }
        finally
        {
            _lock.Release();
        }
    }

    public void Dispose() => _lock.Dispose();
}
