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

    public const int MaxBins = 200;

    /// <summary><paramref name="y"/> aggregated per value of <paramref name="x"/>, for line, area, bar, and pie charts.</summary>
    public static ChartQuery Series(
        string table,
        IReadOnlyList<ColumnInfo> columns,
        string x,
        string? y,
        string aggregate)
    {
        var xColumn = Find(columns, x);
        var value = Aggregate(columns, y, aggregate);
        var (label, xType) = Axis(xColumn);
        var quotedX = Quote(xColumn.Name);
        return new ChartQuery(
            string.Create(
                CultureInfo.InvariantCulture,
                $"SELECT {label} AS __scry_x, CAST({value} AS DOUBLE) AS __scry_y FROM {Quote(table)} "
                + $"WHERE {quotedX} IS NOT NULL GROUP BY {quotedX} ORDER BY {quotedX} LIMIT {MaxPoints + 1}"),
            xType);
    }

    /// <summary>
    /// <paramref name="y"/> aggregated per pair of <paramref name="x"/> and <paramref name="group"/>, as
    /// <c>[x, group, y]</c> with the group as text, for stacked bars and heatmaps.
    /// </summary>
    public static ChartQuery Groups(
        string table,
        IReadOnlyList<ColumnInfo> columns,
        string x,
        string group,
        string? y,
        string aggregate)
    {
        var xColumn = Find(columns, x);
        var groupColumn = Grouping(columns, group);
        var value = Aggregate(columns, y, aggregate);
        var (label, xType) = Axis(xColumn);
        var quotedX = Quote(xColumn.Name);
        var quotedGroup = Quote(groupColumn.Name);
        return new ChartQuery(
            string.Create(
                CultureInfo.InvariantCulture,
                $"SELECT {label} AS __scry_x, CAST({quotedGroup} AS VARCHAR) AS __scry_group, CAST({value} AS DOUBLE) AS __scry_y "
                + $"FROM {Quote(table)} WHERE {quotedX} IS NOT NULL AND {quotedGroup} IS NOT NULL "
                + $"GROUP BY {quotedX}, {quotedGroup} ORDER BY {quotedX}, {quotedGroup} LIMIT {MaxPoints + 1}"),
            xType);
    }

    /// <summary>
    /// <paramref name="bins"/> equal-width bins spanning a number column, empty ones included, as
    /// <c>[start, end, count]</c>. The largest value falls in the last bin.
    /// </summary>
    public static ChartQuery Histogram(string table, IReadOnlyList<ColumnInfo> columns, string column, int bins)
    {
        if (bins is < 1 or > MaxBins)
        {
            throw new ArgumentException($"A histogram has from 1 to {MaxBins} bins.");
        }

        var quoted = Quote(Number(columns, column).Name);
        return new ChartQuery(
            string.Create(
                CultureInfo.InvariantCulture,
                $"WITH v AS (SELECT CAST({quoted} AS DOUBLE) AS v FROM {Quote(table)} WHERE {quoted} IS NOT NULL), "
                + $"b AS (SELECT MIN(v) AS lo, CASE WHEN MAX(v) > MIN(v) THEN (MAX(v) - MIN(v)) / {bins} ELSE 1 END AS w FROM v), "
                + $"k AS (SELECT LEAST(CAST(FLOOR((v.v - b.lo) / b.w) AS BIGINT), {bins - 1}) AS bin FROM v CROSS JOIN b), "
                + $"c AS (SELECT bin, COUNT(*) AS n FROM k GROUP BY bin) "
                + $"SELECT b.lo + r.range * b.w AS __scry_start, b.lo + (r.range + 1) * b.w AS __scry_end, "
                + $"CAST(COALESCE(c.n, 0) AS DOUBLE) AS __scry_count "
                + $"FROM range({bins}) AS r CROSS JOIN b LEFT JOIN c ON c.bin = r.range "
                + $"WHERE b.lo IS NOT NULL ORDER BY r.range"),
            "value");
    }

    /// <summary>
    /// A box per value of <paramref name="group"/>, or one box over every row, as
    /// <c>[label, min, first quartile, median, third quartile, max]</c>.
    /// </summary>
    public static ChartQuery Boxes(string table, IReadOnlyList<ColumnInfo> columns, string value, string? group)
    {
        var quoted = Quote(Number(columns, value).Name);
        var number = $"CAST({quoted} AS DOUBLE)";
        var stats = $"MIN({number}), quantile_cont({number}, 0.25), quantile_cont({number}, 0.5), "
            + $"quantile_cont({number}, 0.75), MAX({number})";

        if (string.IsNullOrEmpty(group))
        {
            return new ChartQuery(
                $"SELECT 'All rows' AS __scry_x, {stats} FROM {Quote(table)} WHERE {quoted} IS NOT NULL HAVING COUNT(*) > 0",
                "category");
        }

        var quotedGroup = Quote(Grouping(columns, group).Name);
        return new ChartQuery(
            string.Create(
                CultureInfo.InvariantCulture,
                $"SELECT CAST({quotedGroup} AS VARCHAR) AS __scry_x, {stats} FROM {Quote(table)} "
                + $"WHERE {quoted} IS NOT NULL AND {quotedGroup} IS NOT NULL "
                + $"GROUP BY {quotedGroup} ORDER BY {quotedGroup} LIMIT {MaxPoints + 1}"),
            "category");
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

    private static string Aggregate(IReadOnlyList<ColumnInfo> columns, string? y, string aggregate)
    {
        var function = aggregate.ToLowerInvariant() switch
        {
            "sum" => "SUM",
            "avg" => "AVG",
            "min" => "MIN",
            "max" => "MAX",
            "count" => "COUNT",
            _ => throw new ArgumentException($"The aggregate must be one of: {string.Join(", ", Aggregates)}."),
        };

        return function == "COUNT"
            ? "COUNT(*)"
            : $"{function}({Quote(Number(columns, y ?? throw new ArgumentException("Choose a y column, or count rows instead.")).Name)})";
    }

    private static ColumnInfo Grouping(IReadOnlyList<ColumnInfo> columns, string name)
    {
        var column = Find(columns, name);
        return column.Type is ColumnType.Json or ColumnType.Binary
            ? throw new ArgumentException($"'{column.Name}' cannot group rows.")
            : column;
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
