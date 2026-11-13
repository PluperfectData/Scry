using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using NUnit.Framework;
using Shouldly;

namespace Scry.Api.Tests;

[TestFixture]
public sealed class ApiTests
{
    private const string Orders = "day,amount,region\n2026-01-01,10,east\n2026-01-01,5,west\n2026-01-02,7,east\n";

    private ScryApiFactory _factory = null!;
    private HttpClient _client = null!;

    [SetUp]
    public void SetUp()
    {
        _factory = new ScryApiFactory();
        _client = _factory.CreateClient();
    }

    [TearDown]
    public void TearDown()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    [Test]
    public async Task Health_answers_ok()
    {
        using var response = await _client.GetAsync(new Uri("/health", UriKind.Relative));

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Test]
    public async Task Uploading_a_csv_creates_a_source_with_its_columns()
    {
        using var response = await Upload("orders", Orders);

        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        var source = await response.Content.ReadFromJsonAsync<JsonElement>();
        source.GetProperty("name").GetString().ShouldBe("orders");
        source.GetProperty("rowCount").GetInt64().ShouldBe(3);
        source.GetProperty("columns").EnumerateArray()
            .Select(column => (column.GetProperty("name").GetString(), column.GetProperty("type").GetString()))
            .ShouldBe([("day", "Date"), ("amount", "Int64"), ("region", "String")]);
        File.Exists(Path.Combine(_factory.DataDirectory, "workspaces", "default", "data.duckdb")).ShouldBeTrue();
    }

    [Test]
    public async Task A_series_sums_y_per_x_in_x_order()
    {
        var id = await UploadId("orders", Orders);

        var series = await _client.GetFromJsonAsync<JsonElement>($"/sources/{id}/series?x=day&y=amount&aggregate=sum");

        series.GetProperty("xType").GetString().ShouldBe("time");
        series.GetProperty("truncated").GetBoolean().ShouldBeFalse();
        series.GetProperty("points").EnumerateArray()
            .Select(point => (point[0].GetInt64(), point[1].GetDouble()))
            .ShouldBe([(Milliseconds(2026, 1, 1), 15.0), (Milliseconds(2026, 1, 2), 7.0)]);
    }

    [Test]
    public async Task A_series_over_text_counts_rows_per_category()
    {
        var id = await UploadId("orders", Orders);

        var series = await _client.GetFromJsonAsync<JsonElement>($"/sources/{id}/series?x=region&aggregate=count");

        series.GetProperty("xType").GetString().ShouldBe("category");
        series.GetProperty("points").EnumerateArray()
            .Select(point => (point[0].GetString(), point[1].GetDouble()))
            .ShouldBe([("east", 2.0), ("west", 1.0)]);
    }

    [Test]
    public async Task A_scatter_has_one_point_per_row()
    {
        var id = await UploadId("trades", "price,qty\n2.5,4\n1.5,2\n1.5,3\n");

        var points = await _client.GetFromJsonAsync<JsonElement>($"/sources/{id}/points?x=price&y=qty");

        points.GetProperty("xType").GetString().ShouldBe("value");
        points.GetProperty("points").EnumerateArray()
            .Select(point => (point[0].GetDouble(), point[1].GetDouble()))
            .OrderBy(point => point)
            .ShouldBe([(1.5, 2.0), (1.5, 3.0), (2.5, 4.0)]);
    }

    [Test]
    public async Task Candles_come_in_x_order_as_open_close_low_high()
    {
        var id = await UploadId("prices", "day,open,high,low,close\n2026-01-02,11,13,10,12\n2026-01-01,10,12,9,11\n");

        var candles = await _client.GetFromJsonAsync<JsonElement>(
            $"/sources/{id}/candles?x=day&open=open&high=high&low=low&close=close");

        candles.GetProperty("xType").GetString().ShouldBe("time");
        candles.GetProperty("points").EnumerateArray()
            .Select(point => point.EnumerateArray().Select(value => value.GetDouble()).ToArray())
            .ShouldBe([[Milliseconds(2026, 1, 1), 10, 11, 9, 12], [Milliseconds(2026, 1, 2), 11, 12, 10, 13]]);
    }

    [Test]
    public async Task Rows_hold_the_chosen_columns_as_text_in_source_order()
    {
        var id = await UploadId("orders", Orders);

        var rows = await _client.GetFromJsonAsync<JsonElement>($"/sources/{id}/rows?columns=region&columns=amount");

        rows.GetProperty("columns").EnumerateArray().Select(column => column.GetProperty("name").GetString())
            .ShouldBe(["region", "amount"]);
        rows.GetProperty("values").EnumerateArray()
            .Select(row => (row[0].GetString(), row[1].GetString()))
            .ShouldBe([("east", "10"), ("west", "5"), ("east", "7")]);
        rows.GetProperty("truncated").GetBoolean().ShouldBeFalse();
    }

    [Test]
    public async Task Groups_aggregate_y_per_x_and_group()
    {
        var id = await UploadId("orders", Orders);

        var groups = await _client.GetFromJsonAsync<JsonElement>(
            $"/sources/{id}/groups?x=day&group=region&y=amount&aggregate=sum");

        groups.GetProperty("points").EnumerateArray()
            .Select(point => (point[0].GetInt64(), point[1].GetString(), point[2].GetDouble()))
            .ShouldBe(
            [
                (Milliseconds(2026, 1, 1), "east", 10.0),
                (Milliseconds(2026, 1, 1), "west", 5.0),
                (Milliseconds(2026, 1, 2), "east", 7.0),
            ]);
    }

    [Test]
    public async Task A_histogram_counts_every_bin_and_puts_the_largest_value_in_the_last()
    {
        var id = await UploadId("values", "v\n1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n");

        var histogram = await _client.GetFromJsonAsync<JsonElement>($"/sources/{id}/histogram?column=v&bins=3");

        histogram.GetProperty("points").EnumerateArray()
            .Select(point => (point[0].GetDouble(), point[1].GetDouble(), point[2].GetDouble()))
            .ShouldBe([(1.0, 4.0, 3.0), (4.0, 7.0, 3.0), (7.0, 10.0, 4.0)]);
    }

    [Test]
    public async Task Boxes_hold_the_five_numbers_per_group()
    {
        var id = await UploadId("orders", Orders);

        var boxes = await _client.GetFromJsonAsync<JsonElement>($"/sources/{id}/boxes?value=amount&group=region");
        var all = await _client.GetFromJsonAsync<JsonElement>($"/sources/{id}/boxes?value=amount");

        boxes.GetProperty("points").EnumerateArray()
            .Select(point => string.Join(" ", point.EnumerateArray().Select(value => value.ToString())))
            .ShouldBe(["east 7 7.75 8.5 9.25 10", "west 5 5 5 5 5"]);
        all.GetProperty("points")[0][0].GetString().ShouldBe("All rows");
        all.GetProperty("points")[0][3].GetDouble().ShouldBe(7.0);
    }

    [TestCase("groups?x=day&group=missing&y=amount&aggregate=sum")]
    [TestCase("histogram?column=region")]
    [TestCase("histogram?column=amount&bins=0")]
    [TestCase("boxes?value=region")]
    [TestCase("series?x=missing&y=amount&aggregate=sum")]
    [TestCase("series?x=day&y=region&aggregate=sum")]
    [TestCase("series?x=day&y=amount&aggregate=median")]
    [TestCase("points?x=region&y=amount")]
    [TestCase("candles?x=day&open=region&high=amount&low=amount&close=amount")]
    [TestCase("rows?columns=missing")]
    public async Task A_chart_with_bad_settings_is_rejected(string query)
    {
        var id = await UploadId("orders", Orders);

        using var response = await _client.GetAsync(new Uri($"/sources/{id}/{query}", UriKind.Relative));

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Test]
    public async Task A_bad_or_taken_name_is_rejected()
    {
        using var bad = await Upload("Orders!", Orders);
        using var first = await Upload("orders", Orders);
        using var second = await Upload("orders", Orders);

        bad.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        first.StatusCode.ShouldBe(HttpStatusCode.Created);
        second.StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Test]
    public async Task A_dashboard_keeps_its_layouts_and_widgets()
    {
        using var created = await _client.PostAsJsonAsync("/dashboards", new { name = "Sales" });
        created.StatusCode.ShouldBe(HttpStatusCode.Created);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();

        using var updated = await _client.PutAsJsonAsync($"/dashboards/{id}", new
        {
            name = "Sales",
            layouts = new { lg = new[] { new { i = "a", x = 0, y = 0, w = 6, h = 4 } } },
            widgets = new[] { new { id = "a", sourceId = 1, x = "day", y = "amount", aggregate = "sum" } },
        });
        updated.StatusCode.ShouldBe(HttpStatusCode.OK);

        var dashboard = await _client.GetFromJsonAsync<JsonElement>($"/dashboards/{id}");
        dashboard.GetProperty("layouts").GetProperty("lg")[0].GetProperty("w").GetInt32().ShouldBe(6);
        dashboard.GetProperty("widgets")[0].GetProperty("x").GetString().ShouldBe("day");

        using var deleted = await _client.DeleteAsync(new Uri($"/dashboards/{id}", UriKind.Relative));
        using var gone = await _client.GetAsync(new Uri($"/dashboards/{id}", UriKind.Relative));
        deleted.StatusCode.ShouldBe(HttpStatusCode.NoContent);
        gone.StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    private static long Milliseconds(int year, int month, int day) =>
        new DateTimeOffset(year, month, day, 0, 0, 0, TimeSpan.Zero).ToUnixTimeMilliseconds();

    private async Task<HttpResponseMessage> Upload(string name, string csv)
    {
        using var content = new MultipartFormDataContent();
        content.Add(new StringContent(name), "name");
        var file = new ByteArrayContent(Encoding.UTF8.GetBytes(csv));
        file.Headers.ContentType = new MediaTypeHeaderValue("text/csv");
        content.Add(file, "file", "orders.csv");
        return await _client.PostAsync(new Uri("/sources", UriKind.Relative), content);
    }

    private async Task<int> UploadId(string name, string csv)
    {
        using var response = await Upload(name, csv);
        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
    }
}
