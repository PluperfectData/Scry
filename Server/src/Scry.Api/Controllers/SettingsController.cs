using Microsoft.AspNetCore.Mvc;

namespace Scry.Api.Controllers;

/// <summary>The instance's addresses and database. A value set by Scry's configuration is shown, and cannot be changed here.</summary>
public sealed record SettingsView(
    string? ClientOrigin,
    bool ClientOriginConfigured,
    string? ApiOrigin,
    bool ApiOriginConfigured,
    DatabaseView? Database,
    bool DatabaseConfigured);

/// <summary>The instance's own settings: its addresses and its database.</summary>
[ApiController]
[Route("settings")]
public sealed class SettingsController(Instance instance, Installation installation) : ControllerBase
{
    [HttpGet]
    public SettingsView Get() => View();

    [HttpPut("addresses")]
    public ActionResult<SettingsView> Addresses(AddressesRequest request)
    {
        if (AddressForm.Save(request, instance) is { } failed)
        {
            return Problem(failed.Problem, statusCode: failed.Status);
        }

        return View();
    }

    /// <summary>Moves Scry to another database, or changes how it signs in to this one, once the new one opens and is brought up to date.</summary>
    [HttpPut("database")]
    public async Task<ActionResult<SettingsView>> Database(DatabaseRequest request, CancellationToken ct)
    {
        if (instance.ConfiguredConnectionString is not null)
        {
            return Problem(DatabaseForm.Configured, statusCode: StatusCodes.Status409Conflict);
        }

        var (settings, problem) = DatabaseForm.Read(request, instance.File.Database);
        if (problem is not null)
        {
            return Problem(problem, statusCode: StatusCodes.Status400BadRequest);
        }

        if (await installation.UseDatabaseAsync(settings!, ct) is { } failed)
        {
            return Problem(failed, statusCode: StatusCodes.Status400BadRequest);
        }

        return View();
    }

    private SettingsView View()
    {
        var configured = instance.ConfiguredConnectionString;
        var place = configured is not null ? DatabaseSettings.Describe(configured) : instance.File.DatabasePlace;
        return new SettingsView(
            instance.ClientOrigin,
            instance.ClientOriginConfigured,
            instance.ApiOrigin,
            instance.ApiOriginConfigured,
            place is null ? null : new DatabaseView(place.Host, place.Port, place.Name, place.User),
            configured is not null);
    }
}
