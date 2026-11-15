using System.Runtime.CompilerServices;
using Nexus;

namespace Scry.Api.Tests;

/// <summary>
/// A database connector the tests control: two tables, <c>public.orders</c> and <c>public.people</c>, behind a password
/// of <c>right</c>. <see cref="Orders"/> holds the orders table's amounts, so a test can change them between syncs.
/// </summary>
public sealed class FakeDatabase : ISourceConnector
{
    public const string Id = "fakedb";

    public List<decimal> Orders { get; } = [10m, 5m];

    private static readonly StreamSpec OrdersSpec = new(
        "public.orders",
        [new ColumnSpec("amount", ColumnType.Decimal, Nullable: false, Precision: 10, Scale: 2)],
        [],
        [],
        [SyncMode.FullRefresh]);

    private static readonly StreamSpec PeopleSpec = new(
        "public.people",
        [new ColumnSpec("name", ColumnType.String, Nullable: false)],
        [],
        [],
        [SyncMode.FullRefresh]);

    public ConnectorSpec Spec { get; } = new(
        Id,
        "Fake DB",
        "Reads two tables the tests control.",
        "1.0.0",
        AuthKind.ConnectionFields,
        [
            new SettingField("host", "Host", SettingKind.Text, Required: true),
            new SettingField("password", "Password", SettingKind.Secret, Required: false),
        ]);

    public Task<CheckResult> CheckAsync(ConnectorConfig config, CancellationToken ct) =>
        Task.FromResult(
            config.Values.GetValueOrDefault("password") == "right"
                ? CheckResult.Success
                : CheckResult.Failure(ConnectorErrorKind.ConfigInvalid, "The password is wrong."));

    public Task<SourceCatalog> DiscoverAsync(ConnectorConfig config, CancellationToken ct) =>
        Task.FromResult(new SourceCatalog([OrdersSpec, PeopleSpec]));

    public async IAsyncEnumerable<SyncMessage> ReadAsync(
        ConnectorConfig config,
        ReadRequest request,
        [EnumeratorCancellation] CancellationToken ct)
    {
        if (config.Values.GetValueOrDefault("password") != "right")
        {
            throw new ConnectorException(ConnectorErrorKind.ConfigInvalid, "The password is wrong.");
        }

        await Task.Yield();
        foreach (var selection in request.Streams)
        {
            var (spec, rows) = selection.Stream switch
            {
                "public.orders" => (OrdersSpec, Orders.Select(amount => new object?[] { amount }).ToList()),
                "public.people" => (PeopleSpec, [["Ada"]]),
                _ => throw new ConnectorException(ConnectorErrorKind.ConfigInvalid, $"There is no table {selection.Stream}."),
            };
            yield return new SchemaMessage(spec);
            yield return new RecordBatch(spec.Name, rows);
        }
    }
}
