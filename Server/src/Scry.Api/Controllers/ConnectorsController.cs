using Microsoft.AspNetCore.Mvc;
using Nexus;
using Nexus.Csv;

namespace Scry.Api.Controllers;

/// <summary>A Nexus connector a source can come from: its name, what it reads, and the settings it asks for.</summary>
public sealed record ConnectorView(string Id, string Name, string Description, IReadOnlyList<SettingField> Fields)
{
    public static ConnectorView From(ConnectorSpec spec) => new(spec.Id, spec.DisplayName, spec.Description, spec.Fields);
}

[ApiController]
[Route("connectors")]
public sealed class ConnectorsController(DatabaseConnectors databases) : ControllerBase
{
    private static readonly ConnectorView Csv = ConnectorView.From(new CsvSource().Spec);

    /// <summary>Every connector a source can come from: CSV first, then each database.</summary>
    [HttpGet]
    public IEnumerable<ConnectorView> List() => [Csv, .. databases.All.Select(connector => ConnectorView.From(connector.Spec))];
}
