using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Nexus;

namespace Scry.Api;

/// <summary>A pushed row that does not fit its source's columns, in words safe to answer with.</summary>
public sealed class InvalidIngestException(string message) : Exception(message);

/// <summary>Reads a pushed row's JSON values as the values its columns hold.</summary>
public static partial class IngestValues
{
    /// <summary>Row <paramref name="number"/>, counted from 1, as one value per column, in the columns' order.</summary>
    public static object?[] Row(JsonElement[] values, IReadOnlyList<ColumnInfo> columns, IReadOnlySet<string> key, int number)
    {
        if (values.Length != columns.Count)
        {
            throw new InvalidIngestException($"Row {number} holds {values.Length} values, and the source has {columns.Count} columns.");
        }

        var row = new object?[columns.Count];
        for (var i = 0; i < row.Length; i++)
        {
            var column = columns[i];
            if (values[i].ValueKind == JsonValueKind.Null)
            {
                row[i] = key.Contains(column.Name)
                    ? throw new InvalidIngestException($"Row {number}, column '{column.Name}': a key column cannot be null.")
                    : null;
                continue;
            }

            row[i] = Value(values[i], column.Type)
                ?? throw new InvalidIngestException($"Row {number}, column '{column.Name}': {Expected(column.Type)}");
        }

        return row;
    }

    private static object? Value(JsonElement value, ColumnType type)
    {
        var text = value.ValueKind == JsonValueKind.String ? value.GetString()! : null;
        var number = value.ValueKind == JsonValueKind.Number;
        return type switch
        {
            ColumnType.String => text,
            ColumnType.Int64 when number && value.TryGetInt64(out var whole) => whole,
            ColumnType.Int64 when text is not null && long.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var whole) => whole,
            ColumnType.Decimal when number && value.TryGetDecimal(out var exact) => exact,
            ColumnType.Decimal when text is not null && decimal.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var exact) => exact,
            ColumnType.Float64 when number && value.TryGetDouble(out var real) => real,
            ColumnType.Boolean when value.ValueKind is JsonValueKind.True or JsonValueKind.False => value.GetBoolean(),
            ColumnType.Date when text is not null
                && DateOnly.TryParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) => date,
            ColumnType.Timestamp when text is not null && Offset().IsMatch(text)
                && DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var time) => time.ToUniversalTime(),
            ColumnType.DateTime when text is not null && !Offset().IsMatch(text)
                && DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var local) => DateTime.SpecifyKind(local, DateTimeKind.Unspecified),
            ColumnType.Time when text is not null
                && TimeOnly.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var clock) => clock,
            ColumnType.Json => value.GetRawText(),
            ColumnType.Binary when text is not null && Base64(text) is { } bytes => bytes,
            _ => null,
        };
    }

    private static byte[]? Base64(string text)
    {
        var bytes = new byte[text.Length];
        return Convert.TryFromBase64String(text, bytes, out var length) ? bytes[..length] : null;
    }

    private static string Expected(ColumnType type) => type switch
    {
        ColumnType.String => "expected text.",
        ColumnType.Int64 => "expected a whole number.",
        ColumnType.Decimal => "expected a decimal number, best sent as a string to keep its digits.",
        ColumnType.Float64 => "expected a number.",
        ColumnType.Boolean => "expected true or false.",
        ColumnType.Date => "expected a date such as 2026-11-15.",
        ColumnType.Timestamp => "expected a time with its offset, such as 2026-11-15T14:30:00Z.",
        ColumnType.DateTime => "expected a date and time with no offset, such as 2026-11-15T14:30:00.",
        ColumnType.Time => "expected a time such as 14:30:00.",
        ColumnType.Binary => "expected base64 text.",
        _ => "expected a JSON value.",
    };

    // A time ends with Z or an offset such as +02:00 or -0500 when it says where it was.
    [GeneratedRegex(@"(Z|[+-]\d{2}:?\d{2})$", RegexOptions.IgnoreCase)]
    private static partial Regex Offset();
}
