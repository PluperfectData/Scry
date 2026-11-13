using System.Globalization;
using Nexus;

namespace Scry.Api;

/// <summary>Chart points in x order.</summary>
/// <param name="XType">How the client draws the x axis: <c>value</c>, <c>time</c> (epoch milliseconds in UTC), or <c>category</c>.</param>
public sealed record Series(string XType, IReadOnlyList<object?[]> Points, bool Truncated);

/// <summary>A source's rows as text, in the source's order, for a table.</summary>
public sealed record Rows(IReadOnlyList<ColumnInfo> Columns, IReadOnlyList<object?[]> Values, bool Truncated);

public sealed record ChartQuery(string Sql, string XType);

public sealed record RowsQuery(string Sql, IReadOnlyList<ColumnInfo> Columns);

/// <summary>
/// Turns chart settings into DuckDB SQL over a source's table. Every column is checked against the source and quoted;
/// a bad setting throws <see cref="ArgumentException"/> with a message safe to show.
/// </summary>
public static class ChartQueries
{
    public const int MaxPoints = 10_000;
    public const int MaxRows = 1_000;

    public static readonly IReadOnlyList<string> Aggregates = ["sum", "avg", "min", "max", "count"];

    /// <summary><paramref name="y"/> aggregated per value of <paramref name="x"/>, for line, bar, and pie charts.</summary>
    public static ChartQuery Series(
        string table,
        IReadOnlyList<ColumnInfo> columns,
        string x,
        string? y,
        string aggregate)
    {
        var xColumn = Find(columns, x);
        var function = aggregate.ToLowerInvariant() switch
        {
            "sum" => "SUM",
            "avg" => "AVG",
            "min" => "MIN",
            "max" => "MAX",
            "count" => "COUNT",
            _ => throw new ArgumentException($"The aggregate must be one of: {string.Join(", ", Aggregates)}."),
        };

        var value = function == "COUNT"
            ? "COUNT(*)"
            : $"{function}({Quote(Number(columns, y ?? throw new ArgumentException("Choose a y column, or count rows instead.")).Name)})";

        var (label, xType) = Axis(xColumn);
        var quotedX = Quote(xColumn.Name);
        return new ChartQuery(
            string.Create(
                CultureInfo.InvariantCulture,
                $"SELECT {label} AS __scry_x, CAST({value} AS DOUBLE) AS __scry_y FROM {Quote(table)} "
                + $"WHERE {quotedX} IS NOT NULL GROUP BY {quotedX} ORDER BY {quotedX} LIMIT {MaxPoints + 1}"),
            xType);
    }

    /// <summary>One point per row, unaggregated, for a scatter chart.</summary>
    public static ChartQuery Points(string table, IReadOnlyList<ColumnInfo> columns, string x, string y)
    {
        var xColumn = Find(columns, x);
        var (label, xType) = Axis(xColumn);
        if (xType == "category")
        {
            throw new ArgumentException($"'{xColumn.Name}' is not a number or a time, so it cannot place a point.");
        }

        var quotedX = Quote(xColumn.Name);
        var quotedY = Quote(Number(columns, y).Name);
        return new ChartQuery(
            string.Create(
                CultureInfo.InvariantCulture,
                $"SELECT {label} AS __scry_x, CAST({quotedY} AS DOUBLE) AS __scry_y FROM {Quote(table)} "
                + $"WHERE {quotedX} IS NOT NULL AND {quotedY} IS NOT NULL ORDER BY {quotedX} LIMIT {MaxPoints + 1}"),
            xType);
    }

    /// <summary>One candle per row in x order, as <c>[x, open, close, low, high]</c>, the order ECharts takes.</summary>
    public static ChartQuery Candles(
        string table,
        IReadOnlyList<ColumnInfo> columns,
        string x,
        string open,
        string high,
        string low,
        string close)
    {
        var xColumn = Find(columns, x);
        var (label, xType) = Axis(xColumn);
        var prices = new[] { open, close, low, high }
            .Select(name => $"CAST({Quote(Number(columns, name).Name)} AS DOUBLE)");

        var quotedX = Quote(xColumn.Name);
        return new ChartQuery(
            string.Create(
                CultureInfo.InvariantCulture,
                $"SELECT {label} AS __scry_x, {string.Join(", ", prices)} FROM {Quote(table)} "
                + $"WHERE {quotedX} IS NOT NULL ORDER BY {quotedX} LIMIT {MaxPoints + 1}"),
            xType);
    }

    /// <summary>The chosen columns as text, or every column when none is chosen, for a table.</summary>
    public static RowsQuery Rows(string table, IReadOnlyList<ColumnInfo> columns, IReadOnlyList<string> chosen)
    {
        var shown = chosen.Count == 0 ? columns : chosen.Select(name => Find(columns, name)).ToList();
        var cells = shown.Select(column => $"CAST({Quote(column.Name)} AS VARCHAR)");
        return new RowsQuery(
            string.Create(CultureInfo.InvariantCulture, $"SELECT {string.Join(", ", cells)} FROM {Quote(table)} LIMIT {MaxRows + 1}"),
            shown);
    }

    private static (string Label, string XType) Axis(ColumnInfo column)
    {
        var quoted = Quote(column.Name);
        return column.Type switch
        {
            ColumnType.Int64 or ColumnType.Decimal or ColumnType.Float64 => ($"CAST({quoted} AS DOUBLE)", "value"),
            ColumnType.Date => ($"epoch_ms(CAST({quoted} AS TIMESTAMP))", "time"),
            ColumnType.Timestamp or ColumnType.DateTime => ($"epoch_ms({quoted})", "time"),
            ColumnType.Json or ColumnType.Binary => throw new ArgumentException($"'{column.Name}' cannot be an x axis."),
            _ => ($"CAST({quoted} AS VARCHAR)", "category"),
        };
    }

    private static ColumnInfo Find(IReadOnlyList<ColumnInfo> columns, string name) =>
        columns.FirstOrDefault(column => column.Name == name)
        ?? throw new ArgumentException($"The source has no column named '{name}'.");

    private static ColumnInfo Number(IReadOnlyList<ColumnInfo> columns, string name)
    {
        var column = Find(columns, name);
        return column.Type is ColumnType.Int64 or ColumnType.Decimal or ColumnType.Float64
            ? column
            : throw new ArgumentException($"'{column.Name}' is not a number.");
    }

    private static string Quote(string identifier) => $"\"{identifier.Replace("\"", "\"\"", StringComparison.Ordinal)}\"";
}
