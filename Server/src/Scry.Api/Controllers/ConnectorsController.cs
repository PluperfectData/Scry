using Microsoft.AspNetCore.Mvc;
using Nexus;
using Nexus.Csv;
using Nexus.Schwab;

namespace Scry.Api.Controllers;

/// <summary>
/// A Nexus connector a source can come from: its name, what it reads, the settings it asks for, and the settings Scry
/// <paramref name="Needs"/> and lacks before it can be used, by their configuration names.
/// </summary>
public sealed record ConnectorView(
    string Id,
    string Name,
    string Description,
    IReadOnlyList<SettingField> Fields,
    IReadOnlyList<string> Needs)
{
    public static ConnectorView From(ConnectorSpec spec) => new(spec.Id, spec.DisplayName, spec.Description, spec.Fields, []);
}

[ApiController]
[Route("workspaces/{workspaceId:int}/connectors")]
[InWorkspace]
public sealed class ConnectorsController(SchwabConnector schwab) : ControllerBase
{
    private static readonly ConnectorView Csv = ConnectorView.From(new CsvSource().Spec);

    /// <summary>The connectors Scry reads through itself: CSV, then Schwab. Databases come through Nexus.</summary>
    [HttpGet]
    public IEnumerable<ConnectorView> List() => [Csv, Schwab()];

    // Scry only reads, so Schwab's setting that allows orders is left out.
    private ConnectorView Schwab()
    {
        var spec = schwab.Source().Spec;
        return ConnectorView.From(spec) with
        {
            Fields = [.. spec.Fields.Where(field => field.Name != SchwabSettings.AllowOrders)],
            Needs = schwab.App.Missing,
        };
    }
}
