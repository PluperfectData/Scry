using System.Diagnostics.CodeAnalysis;
using DuckDB.NET.Data;
using Nexus;
using Nexus.Csv;
using Nexus.DuckDb;

namespace Scry.Api;

/// <summary>A synced table's columns and row count.</summary>
public sealed record SyncResult(IReadOnlyList<ColumnInfo> Columns, long RowCount);

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
    public async Task<SyncResult> SyncCsvAsync(string table, string fileName, string storedPath, string? delimiter, CancellationToken ct)
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
        var destinationConfig = new ConnectorConfig(
            new Dictionary<string, string?> { [DuckDbDestination.PathSetting] = Database });

        StreamSpec? spec = null;
        long rows;

        async IAsyncEnumerable<SyncMessage> Watched(IAsyncEnumerable<SyncMessage> messages)
        {
            await foreach (var message in messages)
            {
                if (message is SchemaMessage schema && schema.Stream.Name == table)
                {
                    spec = schema.Stream;
                }

                yield return message;
            }
        }

        await _lock.WaitAsync(ct);
        try
        {
            Directory.CreateDirectory(Root);
            var read = new CsvSource().ReadAsync(config, new ReadRequest([new StreamSelection(table, SyncMode.FullRefresh)]), ct);
            var write = new DuckDbDestination().WriteAsync(
                destinationConfig,
                new WriteRequest(new Dictionary<string, WriteMode> { [table] = WriteMode.Overwrite }),
                Watched(read),
                ct);

            // The destination writes the rows as its messages are read.
            await foreach (var _ in write)
            {
            }

            rows = spec is null ? 0 : await CountAsync(table, ct);
        }
        finally
        {
            _lock.Release();
        }

        var written = spec ?? throw new InvalidOperationException($"The file sent no schema for {table}.");
        return new SyncResult(written.Columns.Select(column => new ColumnInfo(column.Name, column.Type)).ToList(), rows);
    }

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
