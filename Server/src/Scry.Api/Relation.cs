using Nexus;
using static Scry.Api.ChartQueries;

namespace Scry.Api;

/// <summary>
/// What a chart query reads: one source's table, or two sources joined. <see cref="From"/> goes after <c>FROM</c>,
/// <see cref="Columns"/> are the columns it offers, and <see cref="Order"/> sorts its rows into source order.
/// </summary>
public sealed record Relation(string From, IReadOnlyList<ColumnInfo> Columns, string Order)
{
    public static readonly IReadOnlyList<string> JoinKinds = ["inner", "left", "right", "full"];

    public static Relation Of(string table, IReadOnlyList<ColumnInfo> columns) => new(Quote(table), columns, "rowid");

    /// <summary>
    /// Two sources' rows where <paramref name="on"/> in the first equals <paramref name="to"/> in the second. Each
    /// column is named for its source, as <c>orders.amount</c>. <paramref name="kind"/> keeps unmatched rows from
    /// neither source (<c>inner</c>), the first (<c>left</c>), the second (<c>right</c>), or both (<c>full</c>).
    /// </summary>
    public static Relation Join(
        string table,
        IReadOnlyList<ColumnInfo> columns,
        string otherTable,
        IReadOnlyList<ColumnInfo> otherColumns,
        string on,
        string to,
        string kind)
    {
        if (table == otherTable)
        {
            throw new ArgumentException("A source cannot be joined to itself.");
        }

        var join = kind switch
        {
            "inner" => "INNER JOIN",
            "left" => "LEFT JOIN",
            "right" => "RIGHT JOIN",
            "full" => "FULL OUTER JOIN",
            _ => throw new ArgumentException($"The join must be one of: {string.Join(", ", JoinKinds)}."),
        };
        var leftKey = Key(columns, on, table);
        var rightKey = Key(otherColumns, to, otherTable);
        var left = $"l.{Quote(leftKey.Name)}";
        var right = $"r.{Quote(rightKey.Name)}";
        var match = Comparable(leftKey.Type, rightKey.Type)
            ? $"{left} = {right}"
            : $"CAST({left} AS VARCHAR) = CAST({right} AS VARCHAR)";

        var sides = columns.Select(column => (Alias: "l", Table: table, Column: column))
            .Concat(otherColumns.Select(column => (Alias: "r", Table: otherTable, Column: column)))
            .ToList();
        var cells = sides.Select(side => $"{side.Alias}.{Quote(side.Column.Name)} AS {Quote($"{side.Table}.{side.Column.Name}")}");
        var offered = sides.Select(side => side.Column with { Name = $"{side.Table}.{side.Column.Name}" }).ToList();

        // Each side's rowid travels along, so the joined rows keep the first source's order, then the second's.
        var from = $"(SELECT {string.Join(", ", cells)}, l.rowid AS __scry_left, r.rowid AS __scry_right "
            + $"FROM {Quote(table)} AS l {join} {Quote(otherTable)} AS r ON {match}) AS __scry_joined";
        return new Relation(from, offered, "__scry_left NULLS LAST, __scry_right NULLS LAST");
    }

    private static ColumnInfo Key(IReadOnlyList<ColumnInfo> columns, string name, string table)
    {
        var column = columns.FirstOrDefault(candidate => candidate.Name == name)
            ?? throw new ArgumentException($"The source {table} has no column named '{name}'.");
        return column.Type is ColumnType.Json or ColumnType.Binary
            ? throw new ArgumentException($"'{column.Name}' cannot match rows.")
            : column;
    }

    // Two numbers, two times, or two columns of one type compare as they are; anything else compares as text.
    private static bool Comparable(ColumnType left, ColumnType right) =>
        left == right || (IsNumber(left) && IsNumber(right)) || (IsTime(left) && IsTime(right));

    private static bool IsNumber(ColumnType type) => type is ColumnType.Int64 or ColumnType.Decimal or ColumnType.Float64;

    private static bool IsTime(ColumnType type) => type is ColumnType.Date or ColumnType.Timestamp or ColumnType.DateTime;
}
