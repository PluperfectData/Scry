using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Nexus;
using Scry.Api.Data;

namespace Scry.Api.Controllers;

/// <summary>A database Scry can read, and the settings its Nexus connector asks for.</summary>
public sealed record DatabaseView(string Id, string Name, IReadOnlyList<SettingField> Fields);

/// <summary>A database's connector and the settings to reach it, password included.</summary>
public sealed record DatabaseRequest(string Connector, Dictionary<string, string?> Settings);

/// <summary>A table a database offers, by the name its connector gives it, such as <c>public.orders</c>.</summary>
public sealed record DatabaseTable(string Name, int Columns);

/// <summary>A table to add, and the name of the source it becomes.</summary>
public sealed record TableChoice(string Table, string Name);

public sealed record DatabaseSourcesRequest(string Connector, Dictionary<string, string?> Settings, IReadOnlyList<TableChoice> Tables);

[ApiController]
[Route("databases")]
public sealed class DatabasesController(
    ScryDbContext db,
    Workspace workspace,
    DatabaseConnectors connectors,
    ConnectionSecrets secrets) : ControllerBase
{
    /// <summary>The databases Scry reads, each with the settings its connector asks for.</summary>
    [HttpGet]
    public IEnumerable<DatabaseView> List() =>
        connectors.All.Select(connector => new DatabaseView(connector.Spec.Id, connector.Spec.DisplayName, connector.Spec.Fields));

    /// <summary>Connects with the settings and lists the database's tables. Nothing is kept.</summary>
    [HttpPost("tables")]
    public async Task<ActionResult<IReadOnlyList<DatabaseTable>>> Tables(DatabaseRequest request, CancellationToken ct)
    {
        if (connectors.Find(request.Connector) is not { } connector)
        {
            return UnknownConnector(request.Connector);
        }

        var config = new ConnectorConfig(request.Settings);
        try
        {
            var check = await connector.CheckAsync(config, ct);
            if (!check.Succeeded)
            {
                return Problem(check.Message, statusCode: StatusCodes.Status400BadRequest);
            }

            var catalog = await connector.DiscoverAsync(config, ct);
            return catalog.Streams.Select(stream => new DatabaseTable(stream.Name, stream.Columns.Count)).ToList();
        }
        catch (ConnectorException ex)
        {
            return this.ConnectorProblem(ex);
        }
    }

    /// <summary>
    /// Keeps the connection, its settings encrypted, and adds each chosen table as a source, copied into DuckDB. A
    /// failure saves no source and no connection.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<IReadOnlyList<SourceView>>> Add(DatabaseSourcesRequest request, CancellationToken ct)
    {
        if (connectors.Find(request.Connector) is not { } connector)
        {
            return UnknownConnector(request.Connector);
        }

        if (request.Tables.Count == 0)
        {
            return Problem("Choose at least one table.", statusCode: StatusCodes.Status400BadRequest);
        }

        var names = request.Tables.Select(choice => choice.Name.Trim()).ToList();
        if (names.FirstOrDefault(name => !Source.IsValidName(name)) is { } invalid)
        {
            return Problem($"'{invalid}': {Source.NameRule}", statusCode: StatusCodes.Status400BadRequest);
        }

        if (names.GroupBy(name => name).FirstOrDefault(group => group.Count() > 1) is { } repeated)
        {
            return Problem($"Two tables are both named '{repeated.Key}'.", statusCode: StatusCodes.Status400BadRequest);
        }

        if (await db.Sources.Where(source => names.Contains(source.Name)).Select(source => source.Name).FirstOrDefaultAsync(ct)
            is { } taken)
        {
            return Problem($"A source named '{taken}' already exists.", statusCode: StatusCodes.Status409Conflict);
        }

        var connection = new Connection
        {
            Connector = connector.Spec.Id,
            Settings = secrets.Protect(request.Settings),
            CreatedAt = DateTime.UtcNow,
        };
        var config = new ConnectorConfig(request.Settings);
        var sources = new List<Source>();
        try
        {
            foreach (var (choice, name) in request.Tables.Zip(names))
            {
                var result = await workspace.SyncAsync(connector, config, choice.Table, name, ct);
                sources.Add(new Source
                {
                    Name = name,
                    Connection = connection,
                    Stream = choice.Table,
                    Columns = ColumnInfo.Serialize(result.Columns),
                    RowCount = result.RowCount,
                    SyncedAt = DateTime.UtcNow,
                });
            }
        }
        catch (ConnectorException ex)
        {
            return this.ConnectorProblem(ex);
        }

        db.Connections.Add(connection);
        db.Sources.AddRange(sources);
        await db.SaveChangesAsync(ct);
        return sources.Select(SourceView.From).ToList();
    }

    private ObjectResult UnknownConnector(string id) =>
        Problem($"'{id}' is not a database Scry reads.", statusCode: StatusCodes.Status400BadRequest);
}
