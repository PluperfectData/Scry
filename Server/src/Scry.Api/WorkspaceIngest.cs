using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using DuckDB.NET.Data;
using Nexus;

namespace Scry.Api;

/// <summary>A pushed source's column as the push API declares it. A decimal's digits default to 38, 10 after the point.</summary>
public sealed record IngestColumn(string Name, ColumnType Type, int? Precision = null, int? Scale = null)
{
    public const int DefaultPrecision = 38;

    public const int DefaultScale = 10;

    public string SqlType => Type switch
    {
        ColumnType.String => "VARCHAR",
        ColumnType.Int64 => "BIGINT",
        ColumnType.Decimal => string.Create(CultureInfo.InvariantCulture, $"DECIMAL({Precision ?? DefaultPrecision}, {Scale ?? DefaultScale})"),
        ColumnType.Float64 => "DOUBLE",
        ColumnType.Boolean => "BOOLEAN",
        ColumnType.Date => "DATE",
        ColumnType.Timestamp => "TIMESTAMPTZ",
        ColumnType.DateTime => "TIMESTAMP",
        ColumnType.Time => "TIME",
        ColumnType.Json => "JSON",
        ColumnType.Binary => "BLOB",
        _ => throw new UnreachableException(),
    };
}

/// <summary>The push API's writes to the workspace's DuckDB file.</summary>
[SuppressMessage("Security", "CA2100", Justification = "Every identifier is quoted by Quote, and every value is appended or bound.")]
public sealed partial class Workspace
{
    // Batch ids already written, kept beside the tables so a batch and its id commit together. A source name
    // starts with a letter, so no source can be named like these tables.
    private const string BatchIds = "_scry_ingest_batches";

    private const string Stage = "_scry_batch";

    private const string Ordinal = "_scry_ordinal";

    private static string Quote(string identifier) => "\"" + identifier.Replace("\"", "\"\"", StringComparison.Ordinal) + "\"";

    private static string ReplacementOf(string table) => $"_scry_replacement_{table}";

    private static readonly string MakeBatchIds =
        $"CREATE TABLE IF NOT EXISTS {Quote(BatchIds)} (source_table VARCHAR, batch_id VARCHAR, PRIMARY KEY (source_table, batch_id))";

    /// <summary>Drops a source's table, any replacement under way, and the batch ids written to it.</summary>
    public Task DropSourceAsync(string table, CancellationToken ct) =>
        WithConnectionAsync(
            async connection =>
            {
                await ExecuteAsync(connection, MakeBatchIds, ct);
                using var transaction = connection.BeginTransaction();
                await ExecuteAsync(connection, $"DROP TABLE IF EXISTS {Quote(table)}", ct);
                await ExecuteAsync(connection, $"DROP TABLE IF EXISTS {Quote(ReplacementOf(table))}", ct);
                await using (var forget = connection.CreateCommand())
                {
                    forget.CommandText = $"DELETE FROM {Quote(BatchIds)} WHERE source_table = $table";
                    forget.Parameters.Add(new DuckDBParameter("table", table));
                    await forget.ExecuteNonQueryAsync(ct);
                }

                transaction.Commit();
            },
            ct);

    /// <summary>Makes a pushed source's table, or adds the columns it lacks.</summary>
    public Task CreatePushedAsync(string table, IReadOnlyList<IngestColumn> columns, CancellationToken ct) =>
        WithConnectionAsync(
            async connection =>
            {
                await ExecuteAsync(connection, $"CREATE TABLE IF NOT EXISTS {Quote(table)} ({Definitions(columns)})", ct);
                var existing = await ColumnsOfAsync(connection, table, ct);
                foreach (var column in columns.Where(column => !existing.Contains(column.Name)))
                {
                    await ExecuteAsync(connection, $"ALTER TABLE {Quote(table)} ADD COLUMN {Quote(column.Name)} {column.SqlType}", ct);
                }
            },
            ct);

    /// <summary>
    /// Starts a replacement of <paramref name="table"/>: an empty staging table that batches go to until a commit, with
    /// <paramref name="columns"/>, or with the table's own columns and types when null.
    /// </summary>
    public Task StartReplacementAsync(string table, IReadOnlyList<IngestColumn>? columns, CancellationToken ct) =>
        WithConnectionAsync(
            connection => ExecuteAsync(
                connection,
                columns is null
                    ? $"CREATE OR REPLACE TABLE {Quote(ReplacementOf(table))} AS SELECT * FROM {Quote(table)} LIMIT 0"
                    : $"CREATE OR REPLACE TABLE {Quote(ReplacementOf(table))} ({Definitions(columns)})",
                ct),
            ct);

    /// <summary>
    /// Writes one batch to <paramref name="table"/>, or to its replacement, appended or merged by <paramref name="key"/>.
    /// The rows and the batch id commit together. Returns false, writing nothing, for a batch id already written.
    /// </summary>
    public Task<bool> WriteBatchAsync(
        string table,
        bool toReplacement,
        IReadOnlyList<ColumnInfo> columns,
        IReadOnlyList<string> key,
        string? batchId,
        bool merge,
        IReadOnlyList<object?[]> rows,
        CancellationToken ct) =>
        WithConnectionAsync(
            async connection =>
            {
                await ExecuteAsync(connection, MakeBatchIds, ct);

                using var transaction = connection.BeginTransaction();
                if (batchId is not null && await SeenAsync(connection, table, batchId, ct))
                {
                    return false;
                }

                var target = Quote(toReplacement ? ReplacementOf(table) : table);
                var names = string.Join(", ", columns.Select(column => Quote(column.Name)));
                await ExecuteAsync(
                    connection,
                    $"CREATE OR REPLACE TEMP TABLE {Quote(Stage)} AS SELECT {names}, 0::BIGINT AS {Quote(Ordinal)} FROM {target} LIMIT 0",
                    ct);

                using (var appender = connection.CreateAppender("temp", "main", Stage))
                {
                    for (var i = 0; i < rows.Count; i++)
                    {
                        var row = appender.CreateRow();
                        foreach (var value in rows[i])
                        {
                            Append(row, value);
                        }

                        row.AppendValue((long)i).EndRow();
                    }
                }

                var stage = Quote(Stage);
                var ordinal = Quote(Ordinal);
                if (merge)
                {
                    var keys = key.Select(Quote).ToList();
                    var match = string.Join(" AND ", keys.Select(k => $"{target}.{k} = {stage}.{k}"));
                    await ExecuteAsync(connection, $"DELETE FROM {target} USING {stage} WHERE {match}", ct);

                    // The last row for each key wins when a batch holds a key more than once.
                    await ExecuteAsync(
                        connection,
                        $"INSERT INTO {target} ({names}) SELECT {names} FROM {stage} "
                        + $"QUALIFY row_number() OVER (PARTITION BY {string.Join(", ", keys)} ORDER BY {ordinal} DESC) = 1",
                        ct);
                }
                else
                {
                    await ExecuteAsync(connection, $"INSERT INTO {target} ({names}) SELECT {names} FROM {stage} ORDER BY {ordinal}", ct);
                }

                if (batchId is not null)
                {
                    await using var record = connection.CreateCommand();
                    record.CommandText = $"INSERT INTO {Quote(BatchIds)} VALUES ($table, $batch)";
                    record.Parameters.Add(new DuckDBParameter("table", table));
                    record.Parameters.Add(new DuckDBParameter("batch", batchId));
                    await record.ExecuteNonQueryAsync(ct);
                }

                transaction.Commit();
                return true;
            },
            ct);

    /// <summary>Swaps a replacement in for <paramref name="table"/>, and returns the table's row count.</summary>
    public Task<long> CommitReplacementAsync(string table, CancellationToken ct) =>
        WithConnectionAsync(
            async connection =>
            {
                using (var transaction = connection.BeginTransaction())
                {
                    await ExecuteAsync(connection, $"DROP TABLE IF EXISTS {Quote(table)}", ct);
                    await ExecuteAsync(connection, $"ALTER TABLE {Quote(ReplacementOf(table))} RENAME TO {Quote(table)}", ct);
                    transaction.Commit();
                }

                return await CountWithAsync(connection, table, ct);
            },
            ct);

    public Task<long> RowCountAsync(string table, CancellationToken ct) =>
        WithConnectionAsync(connection => CountWithAsync(connection, table, ct), ct);

    private static string Definitions(IEnumerable<IngestColumn> columns) =>
        string.Join(", ", columns.Select(column => $"{Quote(column.Name)} {column.SqlType}"));

    private static void Append(IDuckDBAppenderRow row, object? value) =>
        _ = value switch
        {
            null => row.AppendNullValue(),
            string text => row.AppendValue(text),
            long number => row.AppendValue(number),
            decimal number => row.AppendValue(number),
            double number => row.AppendValue(number),
            bool flag => row.AppendValue(flag),
            DateOnly date => row.AppendValue(date),
            DateTimeOffset timestamp => row.AppendValue(timestamp),
            DateTime dateTime => row.AppendValue(dateTime),
            TimeOnly time => row.AppendValue(time),
            byte[] bytes => row.AppendValue(bytes),
            _ => throw new UnreachableException(),
        };

    private static async Task ExecuteAsync(DuckDBConnection connection, string sql, CancellationToken ct)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        await command.ExecuteNonQueryAsync(ct);
    }

    private static async Task<bool> SeenAsync(DuckDBConnection connection, string table, string batchId, CancellationToken ct)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = $"SELECT count(*) FROM {Quote(BatchIds)} WHERE source_table = $table AND batch_id = $batch";
        command.Parameters.Add(new DuckDBParameter("table", table));
        command.Parameters.Add(new DuckDBParameter("batch", batchId));
        return Convert.ToInt64(await command.ExecuteScalarAsync(ct), CultureInfo.InvariantCulture) > 0;
    }

    private static async Task<HashSet<string>> ColumnsOfAsync(DuckDBConnection connection, string table, CancellationToken ct)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT column_name FROM information_schema.columns WHERE table_schema = 'main' AND table_name = $table";
        command.Parameters.Add(new DuckDBParameter("table", table));
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            names.Add(reader.GetString(0));
        }

        return names;
    }

    private static async Task<long> CountWithAsync(DuckDBConnection connection, string table, CancellationToken ct)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = $"SELECT COUNT(*) FROM {Quote(table)}";
        return Convert.ToInt64(await command.ExecuteScalarAsync(ct), CultureInfo.InvariantCulture);
    }

    private Task<bool> WithConnectionAsync(Func<DuckDBConnection, Task> work, CancellationToken ct) =>
        WithConnectionAsync(
            async connection =>
            {
                await work(connection);
                return true;
            },
            ct);

    private async Task<T> WithConnectionAsync<T>(Func<DuckDBConnection, Task<T>> work, CancellationToken ct)
    {
        await _lock.WaitAsync(ct);
        try
        {
            Directory.CreateDirectory(Root);
            await using var connection = new DuckDBConnection($"Data Source={Database}");
            await connection.OpenAsync(ct);
            return await work(connection);
        }
        finally
        {
            _lock.Release();
        }
    }
}
