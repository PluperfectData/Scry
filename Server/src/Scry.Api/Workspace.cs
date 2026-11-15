using System.Diagnostics.CodeAnalysis;
using DuckDB.NET.Data;
using Nexus;
using Nexus.Csv;
using Nexus.DuckDb;

namespace Scry.Api;

public sealed record SyncResult(IReadOnlyList<ColumnInfo> Columns, long RowCount);

/// <summary>The one built-in workspace: its uploads and its DuckDB file. Every DuckDB access takes one lock.</summary>
public sealed class Workspace : IDisposable
{
    private readonly SemaphoreSlim _lock = new(1, 1);

    public Workspace(ScrySettings settings, IHostEnvironment environment)
    {
        Root = Path.GetFullPath(Path.Combine(environment.ContentRootPath, settings.DataDirectory, "workspaces", "default"));
        Uploads = Path.Combine(Root, "uploads");
        Database = Path.Combine(Root, "data.duckdb");
    }

    public string Root { get; }

    public string Uploads { get; }

    public string Database { get; }

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
    public async Task<SyncResult> SyncAsync(
        ISourceConnector source,
        ConnectorConfig config,
        string stream,
        string table,
        CancellationToken ct)
    {
        var destinationConfig = new ConnectorConfig(
            new Dictionary<string, string?> { [DuckDbDestination.PathSetting] = Database });

        StreamSpec? spec = null;
        long rows = 0;

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
                        rows += batch.Rows.Count;
                        yield return batch with { Stream = table };
                        break;
                    case StateCheckpoint checkpoint when checkpoint.Stream == stream:
                        yield return checkpoint with { Stream = table };
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
            var read = source.ReadAsync(config, new ReadRequest([new StreamSelection(stream, SyncMode.FullRefresh)]), ct);
            var write = new DuckDbDestination().WriteAsync(
                destinationConfig,
                new WriteRequest(new Dictionary<string, WriteMode> { [table] = WriteMode.Overwrite }),
                Renamed(read),
                ct);

            // The destination commits as it yields checkpoints; only reaching the end matters here.
            await foreach (var _ in write)
            {
            }
        }
        finally
        {
            _lock.Release();
        }

        var written = spec ?? throw new InvalidOperationException($"The source sent no schema for {stream}.");
        return new SyncResult(written.Columns.Select(column => new ColumnInfo(column.Name, column.Type)).ToList(), rows);
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
