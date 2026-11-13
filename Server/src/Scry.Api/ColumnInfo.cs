using System.Text.Json;
using System.Text.Json.Serialization;
using Nexus;

namespace Scry.Api;

/// <summary>One column of a source's table.</summary>
public sealed record ColumnInfo(string Name, ColumnType Type)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };

    public static string Serialize(IReadOnlyList<ColumnInfo> columns) => JsonSerializer.Serialize(columns, Json);

    public static IReadOnlyList<ColumnInfo> Deserialize(string json) =>
        JsonSerializer.Deserialize<List<ColumnInfo>>(json, Json) ?? [];
}
