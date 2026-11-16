using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;

namespace Scry.Api.Controllers;

public sealed record DatabaseRequest(string? Host, int? Port, string? Name, string? User, string? Password);

public sealed record AddressesRequest(string? ClientOrigin, string? ApiOrigin);

/// <summary>A database's place, without its password.</summary>
public sealed record DatabaseView(string Host, int Port, string Name, string User);

/// <summary>
/// Where the instance stands, for the installer page. <c>Local</c> says the page is on the machine Scry runs on, which
/// needs no code; <c>Allowed</c> says this request may use the installer, and only then are the database and the
/// addresses shown.
/// </summary>
public sealed record InstallView(
    bool Installed,
    InstallStage Stage,
    bool Local,
    bool Allowed,
    bool DatabaseConfigured,
    DatabaseView? Database,
    string? DatabaseProblem,
    string? ClientOrigin,
    bool ClientOriginConfigured,
    string? ApiOrigin,
    bool ApiOriginConfigured);

/// <summary>
/// The first-run installer: the database, then the client's address and the API's. On an instance already set up, it
/// changes the addresses, for when a wrong client address keeps the Settings page from reaching the API. A page on the
/// machine Scry runs on may use it; any other page needs the install code from Scry's log.
/// </summary>
[ApiController]
[Route("install")]
public sealed class InstallController(Installation installation, Instance instance, InstallAccess access) : ControllerBase
{
    [HttpGet]
    public InstallView Get() => View(access.Check(HttpContext) == InstallAccessResult.Allowed);

    [HttpPost("database")]
    public async Task<ActionResult<InstallView>> Database(DatabaseRequest request, CancellationToken ct)
    {
        if (Refusal() is { } refused)
        {
            return refused;
        }

        if (instance.ConfiguredConnectionString is not null)
        {
            return Problem(DatabaseForm.Configured, statusCode: StatusCodes.Status409Conflict);
        }

        if (installation.DatabaseReady)
        {
            return Problem("The database is set up. Change it on the Settings page.", statusCode: StatusCodes.Status409Conflict);
        }

        var (settings, problem) = DatabaseForm.Read(request, kept: null);
        if (problem is not null)
        {
            return Problem(problem, statusCode: StatusCodes.Status400BadRequest);
        }

        if (await installation.UseDatabaseAsync(settings!, ct) is { } failed)
        {
            return Problem(failed, statusCode: StatusCodes.Status400BadRequest);
        }

        return View(allowed: true);
    }

    /// <summary>Sets the client's address and the API's, which sets the instance up once its database is ready.</summary>
    [HttpPost("addresses")]
    public ActionResult<InstallView> Addresses(AddressesRequest request)
    {
        if (Refusal() is { } refused)
        {
            return refused;
        }

        if (!installation.DatabaseReady)
        {
            return Problem("Set up the database first.", statusCode: StatusCodes.Status409Conflict);
        }

        if (AddressForm.Save(request, instance) is { } failed)
        {
            return Problem(failed.Problem, statusCode: failed.Status);
        }

        installation.AddressesSaved();
        return View(allowed: true);
    }

    /// <summary>Writes the install code to Scry's log, for a page on another machine. It is written at most once a minute.</summary>
    [HttpPost("code")]
    public IActionResult Code()
    {
        installation.Announce();
        return NoContent();
    }

    private ObjectResult? Refusal() => access.Check(HttpContext) switch
    {
        InstallAccessResult.Allowed => null,
        InstallAccessResult.LockedOut => Problem("Too many wrong codes. Wait 15 minutes, then try again.", statusCode: StatusCodes.Status429TooManyRequests),
        InstallAccessResult.WrongCode => Problem(
            "That is not the install code. Ask for one, then copy it from Scry's log.",
            statusCode: StatusCodes.Status401Unauthorized),
        _ => Problem(
            "This page is not on the machine Scry runs on, so it needs the install code from Scry's log.",
            statusCode: StatusCodes.Status401Unauthorized),
    };

    private InstallView View(bool allowed)
    {
        var stage = installation.Stage;
        var configured = instance.ConfiguredConnectionString;
        var place = configured is not null ? DatabaseSettings.Describe(configured) : instance.File.DatabasePlace;
        return new InstallView(
            stage == InstallStage.Done,
            stage,
            InstallAccess.IsLocal(HttpContext),
            allowed,
            configured is not null,
            allowed && place is not null ? new DatabaseView(place.Host, place.Port, place.Name, place.User) : null,
            allowed ? installation.DatabaseProblem : null,
            allowed ? instance.ClientOrigin : null,
            instance.ClientOriginConfigured,
            allowed ? instance.ApiOrigin : null,
            instance.ApiOriginConfigured);
    }
}

/// <summary>Reads a database from a form, for the installer and the Settings page alike.</summary>
public static partial class DatabaseForm
{
    public const string Configured = "The database is set by Scry's configuration, in ConnectionStrings:Scry.";

    /// <summary>
    /// The database the form names, or why it names none. A blank password keeps <paramref name="kept"/>'s, when the
    /// form names the same server, user, and database.
    /// </summary>
    public static (DatabaseSettings? Settings, string? Problem) Read(DatabaseRequest request, DatabaseSettings? kept)
    {
        var host = request.Host?.Trim();
        var name = request.Name?.Trim();
        var user = request.User?.Trim();
        var port = request.Port ?? DatabaseSettings.DefaultPort;
        if (string.IsNullOrEmpty(host))
        {
            return (null, "Enter the MySQL server's host, such as localhost.");
        }

        if (port is < 1 or > 65535)
        {
            return (null, "A port is a number from 1 to 65535.");
        }

        if (name is null || !NamePattern().IsMatch(name))
        {
            return (null, "Enter the database's name: up to 64 letters, digits, dashes, and underscores.");
        }

        if (string.IsNullOrEmpty(user))
        {
            return (null, "Enter the MySQL user Scry signs in as.");
        }

        var password = request.Password;
        if (string.IsNullOrEmpty(password)
            && kept is not null
            && kept.SamePlace(new DatabaseSettings(host, port, name, user, string.Empty))
            && kept.User == user)
        {
            password = kept.Password;
        }

        return (new DatabaseSettings(host, port, name, user, password ?? string.Empty), null);
    }

    [GeneratedRegex("^[A-Za-z0-9_$-]{1,64}$")]
    private static partial Regex NamePattern();
}

/// <summary>Reads and keeps the client's address and the API's, for the installer and the Settings page alike.</summary>
public static class AddressForm
{
    public const string ClientRule = "Enter the client's address, such as https://scry.example.com, with nothing after its host.";

    public const string ApiRule = "Enter the API's address, such as https://api.scry.example.com, with nothing after its host.";

    /// <summary>
    /// Keeps the addresses the form names, or answers why it cannot, with the status to answer it with. An address set
    /// by configuration is left as it is, and the form may leave it blank.
    /// </summary>
    public static (string Problem, int Status)? Save(AddressesRequest request, Instance instance)
    {
        var client = Origins.Parse(request.ClientOrigin);
        if (instance.ClientOriginConfigured)
        {
            if (!string.IsNullOrWhiteSpace(request.ClientOrigin) && client != Origins.Parse(instance.ClientOrigin))
            {
                return ("The client's address is set by Scry's configuration, in Scry:ClientOrigin.", StatusCodes.Status409Conflict);
            }

            client = null;
        }
        else if (client is null)
        {
            return (ClientRule, StatusCodes.Status400BadRequest);
        }

        var api = Origins.Parse(request.ApiOrigin);
        if (instance.ApiOriginConfigured)
        {
            if (!string.IsNullOrWhiteSpace(request.ApiOrigin) && api != Origins.Parse(instance.ApiOrigin))
            {
                return ("The API's address is set by Scry's configuration, in Scry:ApiOrigin.", StatusCodes.Status409Conflict);
            }

            api = null;
        }
        else if (api is null)
        {
            return (ApiRule, StatusCodes.Status400BadRequest);
        }

        instance.File.SaveOrigins(client, api);
        return null;
    }
}
