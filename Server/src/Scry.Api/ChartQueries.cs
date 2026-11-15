using System.Globalization;
using Nexus;

namespace Scry.Api;

/// <summary>Chart points in x order.</summary>
/// <param name="XType">How the client draws the x axis: <c>value</c>, <c>time</c> (epoch milliseconds in UTC), or <c>category</c>.</param>
public sealed record Series(string XType, IReadOnlyList<object?[]> Points, bool Truncated);

/// <summary>One run of a source's rows as text, for a table, and how many rows the source holds.</summary>
public sealed record Rows(IReadOnlyList<ColumnInfo> Columns, IReadOnlyList<object?[]> Values, long Total);

public sealed record ChartQuery(string Sql, string XType);

public sealed record RowsQuery(string Sql, string CountSql, IReadOnlyList<ColumnInfo> Columns);

/// <summary>
/// Turns chart settings into DuckDB SQL over a <see cref="Relation"/>: a source's table, or two sources joined. Every
/// column is checked against the relation and quoted; a bad setting throws <see cref="ArgumentException"/> with a
/// message safe to show.
/// </summary>
public static class ChartQueries
{
    public const int MaxPoints = 10_000;
    public const int MaxRows = 1_000;

    public static readonly IReadOnlyList<string> Aggregates = ["sum", "avg", "min", "max", "count"];

    public const int MaxBins = 200;
    public const int MaxLevels = 4;
    public const int MaxValues = 12;
    public const int MaxPivotColumns = 50;

    /// <summary><paramref name="y"/> aggregated per value of <paramref name="x"/>, for line, area, bar, and pie charts.</summary>
    public static ChartQuery Series(Relation from, string x, string? y, string aggregate)
    {
        var xColumn = Find(from.Columns, x);
        var value = Aggregate(from.Columns, y, aggregate);
        var (label, xType) = Axis(xColumn);
        var quotedX = Quote(xColumn.Name);
        return new ChartQuery(
            string.Create(
                CultureInfo.InvariantCulture,
                $"SELECT {label} AS __scry_x, CAST({value} AS DOUBLE) AS __scry_y FROM {from.From} "
                + $"WHERE {quotedX} IS NOT NULL GROUP BY {quotedX} ORDER BY {quotedX} LIMIT {MaxPoints + 1}"),
            xType);
    }

    /// <summary>
    /// <paramref name="y"/> aggregated per pair of <paramref name="x"/> and <paramref name="group"/>, as
    /// <c>[x, group, y]</c> with the group as text, for stacked bars and heatmaps.
    /// </summary>
    public static ChartQuery Groups(Relation from, string x, string group, string? y, string aggregate)
    {
        var xColumn = Find(from.Columns, x);
        var groupColumn = Grouping(from.Columns, group);
        var value = Aggregate(from.Columns, y, aggregate);
        var (label, xType) = Axis(xColumn);
        var quotedX = Quote(xColumn.Name);
        var quotedGroup = Quote(groupColumn.Name);
        return new ChartQuery(
            string.Create(
                CultureInfo.InvariantCulture,
                $"SELECT {label} AS __scry_x, CAST({quotedGroup} AS VARCHAR) AS __scry_group, CAST({value} AS DOUBLE) AS __scry_y "
                + $"FROM {from.From} WHERE {quotedX} IS NOT NULL AND {quotedGroup} IS NOT NULL "
                + $"GROUP BY {quotedX}, {quotedGroup} ORDER BY {quotedX}, {quotedGroup} LIMIT {MaxPoints + 1}"),
            xType);
    }

    /// <summary>
    /// <paramref name="y"/> aggregated per pair of <paramref name="row"/> and <paramref name="column"/> values, as
    /// <c>[row, column, value, row's place, column's place]</c> with both values as text, for a pivot table. The
    /// <see cref="MaxPivotColumns"/> column values largest in <paramref name="aggregate"/> keep a column each; the rest
    /// share one, whose value is null, placed last.
    /// </summary>
    public static ChartQuery Pivot(Relation from, string row, string column, string? y, string aggregate)
    {
        var quotedRow = Quote(Grouping(from.Columns, row).Name);
        var quotedColumn = Quote(Grouping(from.Columns, column).Name);
        var function = Function(aggregate);
        var measure = function == "COUNT"
            ? "1"
            : Quote(Number(from.Columns, y ?? throw new ArgumentException("Choose a value column, or count rows instead.")).Name);
        return new ChartQuery(
            string.Create(
                CultureInfo.InvariantCulture,
                $"WITH t AS (SELECT {quotedRow} AS r, {quotedColumn} AS c, {measure} AS v FROM {from.From} "
                + $"WHERE {quotedRow} IS NOT NULL AND {quotedColumn} IS NOT NULL), "
                + $"ranked AS (SELECT c, ROW_NUMBER() OVER (ORDER BY {function}(v) DESC NULLS LAST, c) <= {MaxPivotColumns} AS kept "
                + $"FROM t GROUP BY c), "
                + $"cells AS (SELECT t.r, CASE WHEN ranked.kept THEN t.c END AS c, t.v FROM t JOIN ranked ON t.c = ranked.c) "
                + $"SELECT CAST(r AS VARCHAR), CAST(c AS VARCHAR), CAST({function}(v) AS DOUBLE), "
                + $"DENSE_RANK() OVER (ORDER BY r), DENSE_RANK() OVER (ORDER BY c NULLS LAST) "
                + $"FROM cells GROUP BY r, c ORDER BY r, c NULLS LAST LIMIT {MaxPoints + 1}"),
            "category");
    }

    /// <summary>
    /// <paramref name="bins"/> equal-width bins spanning a number column, empty ones included, as
    /// <c>[start, end, count]</c>. The largest value falls in the last bin.
    /// </summary>
    public static ChartQuery Histogram(Relation from, string column, int bins)
    {
        if (bins is < 1 or > MaxBins)
        {
            throw new ArgumentException($"A histogram has from 1 to {MaxBins} bins.");
        }

        var quoted = Quote(Number(from.Columns, column).Name);
        return new ChartQuery(
            string.Create(
                CultureInfo.InvariantCulture,
                $"WITH v AS (SELECT CAST({quoted} AS DOUBLE) AS v FROM {from.From} WHERE {quoted} IS NOT NULL), "
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
    public static ChartQuery Boxes(Relation from, string value, string? group)
    {
        var quoted = Quote(Number(from.Columns, value).Name);
        var number = $"CAST({quoted} AS DOUBLE)";
        var stats = $"MIN({number}), quantile_cont({number}, 0.25), quantile_cont({number}, 0.5), "
            + $"quantile_cont({number}, 0.75), MAX({number})";

        if (string.IsNullOrEmpty(group))
        {
            return new ChartQuery(
                $"SELECT 'All rows' AS __scry_x, {stats} FROM {from.From} WHERE {quoted} IS NOT NULL HAVING COUNT(*) > 0",
                "category");
        }

        var quotedGroup = Quote(Grouping(from.Columns, group).Name);
        return new ChartQuery(
            string.Create(
                CultureInfo.InvariantCulture,
                $"SELECT CAST({quotedGroup} AS VARCHAR) AS __scry_x, {stats} FROM {from.From} "
                + $"WHERE {quoted} IS NOT NULL AND {quotedGroup} IS NOT NULL "
                + $"GROUP BY {quotedGroup} ORDER BY {quotedGroup} LIMIT {MaxPoints + 1}"),
            "category");
    }

    /// <summary>One point per row, unaggregated, for a scatter chart.</summary>
    public static ChartQuery Points(Relation from, string x, string y)
    {
        var xColumn = Find(from.Columns, x);
        var (label, xType) = Axis(xColumn);
        if (xType == "category")
        {
            throw new ArgumentException($"'{xColumn.Name}' is not a number or a time, so it cannot place a point.");
        }

        var quotedX = Quote(xColumn.Name);
        var quotedY = Quote(Number(from.Columns, y).Name);
        return new ChartQuery(
            string.Create(
                CultureInfo.InvariantCulture,
                $"SELECT {label} AS __scry_x, CAST({quotedY} AS DOUBLE) AS __scry_y FROM {from.From} "
                + $"WHERE {quotedX} IS NOT NULL AND {quotedY} IS NOT NULL ORDER BY {quotedX} LIMIT {MaxPoints + 1}"),
            xType);
    }

    /// <summary>One candle per row in x order, as <c>[x, open, close, low, high]</c>, the order ECharts takes.</summary>
    public static ChartQuery Candles(Relation from, string x, string open, string high, string low, string close)
    {
        var xColumn = Find(from.Columns, x);
        var (label, xType) = Axis(xColumn);
        var prices = new[] { open, close, low, high }
            .Select(name => $"CAST({Quote(Number(from.Columns, name).Name)} AS DOUBLE)");

        var quotedX = Quote(xColumn.Name);
        return new ChartQuery(
            string.Create(
                CultureInfo.InvariantCulture,
                $"SELECT {label} AS __scry_x, {string.Join(", ", prices)} FROM {from.From} "
                + $"WHERE {quotedX} IS NOT NULL ORDER BY {quotedX} LIMIT {MaxPoints + 1}"),
            xType);
    }

    /// <summary>The sort that orders a counted table by its count.</summary>
    public const string CountSort = "__scry_count";

    /// <summary>
    /// <paramref name="limit"/> rows from <paramref name="offset"/> of the chosen columns as text, or of every column when
    /// none is chosen, for a table. Sorted by <paramref name="sort"/> with blanks last, or in source order without one.
    /// With <paramref name="count"/>, rows matching in every shown column become one, with a last column, Count, saying
    /// how many there were; they sort by <see cref="CountSort"/> or a shown column, and by the count, most first, without
    /// a sort.
    /// </summary>
    public static RowsQuery Rows(
        Relation from,
        IReadOnlyList<string> chosen,
        string? sort,
        string? direction,
        bool count,
        int offset,
        int limit)
    {
        if (offset < 0)
        {
            throw new ArgumentException("A table's offset cannot be negative.");
        }

        if (limit is < 1 or > MaxRows)
        {
            throw new ArgumentException($"A table loads 1 to {MaxRows} rows at a time.");
        }

        var descending = direction switch
        {
            null or "asc" => false,
            "desc" => true,
            _ => throw new ArgumentException($"'{direction}' is not a sort direction. Use asc or desc."),
        };
        var shown = chosen.Count == 0 ? from.Columns : chosen.Select(name => Find(from.Columns, name)).ToList();
        var cells = shown.Select(column => $"CAST({Quote(column.Name)} AS VARCHAR)");
        if (count)
        {
            return Counted(from, shown, cells, sort, descending, offset, limit);
        }

        // Source order also breaks ties in the sort, so no row lands on two pages.
        var order = sort is null
            ? from.Order
            : $"{Quote(Find(from.Columns, sort).Name)} {(descending ? "DESC" : "ASC")} NULLS LAST, {from.Order}";
        return new RowsQuery(
            string.Create(
                CultureInfo.InvariantCulture,
                $"SELECT {string.Join(", ", cells)} FROM {from.From} ORDER BY {order} LIMIT {limit} OFFSET {offset}"),
            $"SELECT COUNT(*) FROM {from.From}",
            shown);
    }

    private static RowsQuery Counted(
        Relation from,
        IReadOnlyList<ColumnInfo> shown,
        IEnumerable<string> cells,
        string? sort,
        bool descending,
        int offset,
        int limit)
    {
        var keys = string.Join(", ", shown.Select(column => Quote(column.Name)));
        var way = descending ? "DESC" : "ASC";
        // Grouped rows have no source order, so the shown columns break ties instead, and no row lands on two pages.
        var order = sort switch
        {
            null => $"COUNT(*) DESC, {keys}",
            CountSort => $"COUNT(*) {way}, {keys}",
            _ when shown.Any(column => column.Name == sort) => $"{Quote(sort)} {way} NULLS LAST, {keys}",
            _ => throw new ArgumentException($"A counted table sorts by its count or a column it shows, and '{sort}' is not shown."),
        };
        return new RowsQuery(
            string.Create(
                CultureInfo.InvariantCulture,
                $"SELECT {string.Join(", ", cells)}, CAST(COUNT(*) AS VARCHAR) AS {CountSort} FROM {from.From} "
                + $"GROUP BY {keys} ORDER BY {order} LIMIT {limit} OFFSET {offset}"),
            $"SELECT COUNT(*) FROM (SELECT 1 FROM {from.From} GROUP BY {keys})",
            [.. shown, new ColumnInfo("Count", ColumnType.Int64)]);
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

    /// <summary><paramref name="y"/> aggregated over every row, as one <c>["All rows", value]</c> point, for a gauge.</summary>
    public static ChartQuery Total(Relation from, string? y, string aggregate) =>
        new(
            $"SELECT 'All rows' AS __scry_x, CAST({Aggregate(from.Columns, y, aggregate)} AS DOUBLE) AS __scry_y FROM {from.From}",
            "category");

    /// <summary>
    /// Each of <paramref name="measures"/> aggregated per value of <paramref name="group"/>, or over every row, as
    /// <c>[group, value, ...]</c> in the order given, for a radar chart.
    /// </summary>
    public static ChartQuery Measures(Relation from, IReadOnlyList<string> measures, string? group, string aggregate)
    {
        if (measures.Count == 0)
        {
            throw new ArgumentException("Choose at least one number column.");
        }

        var function = Function(aggregate);
        var values = string.Join(
            ", ",
            measures.Select(name => $"CAST({function}({Quote(Number(from.Columns, name).Name)}) AS DOUBLE)"));

        if (string.IsNullOrEmpty(group))
        {
            return new ChartQuery($"SELECT 'All rows' AS __scry_x, {values} FROM {from.From}", "category");
        }

        var quotedGroup = Quote(Grouping(from.Columns, group).Name);
        return new ChartQuery(
            string.Create(
                CultureInfo.InvariantCulture,
                $"SELECT CAST({quotedGroup} AS VARCHAR) AS __scry_x, {values} FROM {from.From} "
                + $"WHERE {quotedGroup} IS NOT NULL GROUP BY {quotedGroup} ORDER BY {quotedGroup} LIMIT {MaxPoints + 1}"),
            "category");
    }

    /// <summary>
    /// <paramref name="y"/> aggregated per path through <paramref name="levels"/>, as <c>[level, ..., value]</c> with
    /// every level as text, for treemaps and sunbursts. Rows with a blank level are left out.
    /// </summary>
    public static ChartQuery Tree(Relation from, IReadOnlyList<string> levels, string? y, string aggregate)
    {
        if (levels.Count is < 1 or > MaxLevels)
        {
            throw new ArgumentException($"A tree has from 1 to {MaxLevels} levels.");
        }

        var quoted = levels.Select(name => Quote(Grouping(from.Columns, name).Name)).ToList();
        var value = Aggregate(from.Columns, y, aggregate);
        var keys = string.Join(", ", quoted);
        return new ChartQuery(
            string.Create(
                CultureInfo.InvariantCulture,
                $"SELECT {string.Join(", ", quoted.Select(level => $"CAST({level} AS VARCHAR)"))}, CAST({value} AS DOUBLE) "
                + $"FROM {from.From} WHERE {string.Join(" AND ", quoted.Select(level => $"{level} IS NOT NULL"))} "
                + $"GROUP BY {keys} ORDER BY {keys} LIMIT {MaxPoints + 1}"),
            "category");
    }

    /// <summary>
    /// <paramref name="y"/> aggregated per pair of <paramref name="source"/> and <paramref name="target"/>, both as
    /// text, as <c>[from, to, value]</c>, for Sankey, graph, and chord charts. A row whose two ends match is left out.
    /// </summary>
    public static ChartQuery Links(Relation from, string source, string target, string? y, string aggregate)
    {
        var quotedFrom = Quote(Grouping(from.Columns, source).Name);
        var quotedTo = Quote(Grouping(from.Columns, target).Name);
        var value = Aggregate(from.Columns, y, aggregate);
        return new ChartQuery(
            string.Create(
                CultureInfo.InvariantCulture,
                $"SELECT CAST({quotedFrom} AS VARCHAR) AS __scry_from, CAST({quotedTo} AS VARCHAR) AS __scry_to, "
                + $"CAST({value} AS DOUBLE) AS __scry_y FROM {from.From} "
                + $"WHERE {quotedFrom} IS NOT NULL AND {quotedTo} IS NOT NULL "
                + $"AND CAST({quotedFrom} AS VARCHAR) <> CAST({quotedTo} AS VARCHAR) "
                + $"GROUP BY {quotedFrom}, {quotedTo} ORDER BY {quotedFrom}, {quotedTo} LIMIT {MaxPoints + 1}"),
            "category");
    }

    /// <summary>
    /// The chosen number columns, unaggregated, one row per source row with none of them blank, as
    /// <c>[value, ...]</c> in the order given, for parallel coordinates and flow maps.
    /// </summary>
    public static ChartQuery Values(Relation from, IReadOnlyList<string> chosen)
    {
        if (chosen.Count is < 1 or > MaxValues)
        {
            throw new ArgumentException($"Choose from 1 to {MaxValues} number columns.");
        }

        var quoted = chosen.Select(name => Quote(Number(from.Columns, name).Name)).ToList();
        return new ChartQuery(
            string.Create(
                CultureInfo.InvariantCulture,
                $"SELECT {string.Join(", ", quoted.Select(column => $"CAST({column} AS DOUBLE)"))} FROM {from.From} "
                + $"WHERE {string.Join(" AND ", quoted.Select(column => $"{column} IS NOT NULL"))} LIMIT {MaxPoints + 1}"),
            "value");
    }

    internal static string Quote(string identifier) => $"\"{identifier.Replace("\"", "\"\"", StringComparison.Ordinal)}\"";

    private static string Function(string aggregate) => aggregate.ToLowerInvariant() switch
    {
        "sum" => "SUM",
        "avg" => "AVG",
        "min" => "MIN",
        "max" => "MAX",
        "count" => "COUNT",
        _ => throw new ArgumentException($"The aggregate must be one of: {string.Join(", ", Aggregates)}."),
    };

    private static string Aggregate(IReadOnlyList<ColumnInfo> columns, string? y, string aggregate)
    {
        var function = Function(aggregate);
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
}
