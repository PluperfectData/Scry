using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Pluperfect.Jwt;
using Pluperfect.Mail;
using Scry.Api.Auth;
using Scry.Api.Storage;

namespace Scry.Api.Controllers;

public sealed record DatabaseRequest(string? Host, int? Port, string? Name, string? User, string? Password);

public sealed record AddressesRequest(string? ClientOrigin, string? ApiOrigin);

/// <summary>The first admin, or an admin made for someone locked out. The password may be blank once mail works.</summary>
public sealed record InstallAdminRequest(string? Email, string? Password);

public sealed record InstallTestMailRequest(string? To);

/// <summary>A database's place, without its password.</summary>
public sealed record DatabaseView(string Host, int Port, string Name, string User);

/// <summary>
/// Where the instance stands, for the installer page. <c>Local</c> says the page is on the machine Scry runs on, which
/// needs no code; <c>Allowed</c> says this request may use the installer, and only then are the database and the
/// addresses shown. <c>Mail</c> says whether Scry can send mail yet.
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
    bool ApiOriginConfigured,
    bool Mail,
    MailView? MailSettings);

/// <summary>
/// The first-run installer: the database, then the client's address and the API's, then the first admin. On an
/// instance already set up, it changes the addresses, for when a wrong client address keeps the Settings page from
/// reaching the API, and makes or restores an admin for someone locked out. A page on the machine Scry runs on may use
/// it; any other page needs the install code from Scry's log.
/// </summary>
[ApiController]
[Route("install")]
[AllowAnonymous]
[SkipAntiforgery]
[AnyOrigin]
public sealed class InstallController(
    Installation installation,
    Instance instance,
    InstallAccess access,
    IMailer mailer,
    IServiceScopeFactory scopes,
    TimeProvider time) : ControllerBase
{
    private const string MailIsSet = "Scry is set up. An admin changes its mail on the Settings page.";

    private const string NoWayBack = "Set up mail, or choose a password. Without either, there is no way to sign in again.";

    [HttpGet]
    public async Task<InstallView> Get(CancellationToken ct) => await ViewAsync(access.Check(HttpContext) == InstallAccessResult.Allowed, ct);

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

        await NoteAsync($"The installer set the database: {settings!.Name} on {settings.Host}:{settings.Port}, signing in as {settings.User}.", ct);
        return await ViewAsync(allowed: true, ct);
    }

    /// <summary>Sets the client's address and the API's, which leads to the first admin once the database is ready.</summary>
    [HttpPost("addresses")]
    public async Task<ActionResult<InstallView>> Addresses(AddressesRequest request, CancellationToken ct)
    {
        if (Refusal() is { } refused)
        {
            return refused;
        }

        if (!installation.DatabaseReady)
        {
            return Problem("Set up the database first.", statusCode: StatusCodes.Status409Conflict);
        }

        var before = (instance.ClientOrigin, instance.ApiOrigin);
        if (AddressForm.Save(request, instance) is { } failed)
        {
            return Problem(failed.Problem, statusCode: failed.Status);
        }

        if (before != (instance.ClientOrigin, instance.ApiOrigin))
        {
            await NoteAsync($"The installer set the addresses: the client is at {instance.ClientOrigin}, and the API at {instance.ApiOrigin}.", ct);
        }

        await installation.AddressesSavedAsync(ct);
        return await ViewAsync(allowed: true, ct);
    }

    /// <summary>Makes the first admin, or makes an existing user an admin with a new password, and signs them in.</summary>
    [HttpPost("admin")]
    public async Task<ActionResult<MeView>> Admin(
        InstallAdminRequest request,
        [FromServices] IServiceProvider services,
        CancellationToken ct)
    {
        if (Refusal() is { } refused)
        {
            return refused;
        }

        if (await installation.StageAsync(ct) is InstallStage.Database or InstallStage.Address)
        {
            return Problem("Set up the database and the addresses first.", statusCode: StatusCodes.Status409Conflict);
        }

        if (Emails.Normalize(request.Email) is not { } email)
        {
            return Problem("Enter an email address.", statusCode: StatusCodes.Status400BadRequest);
        }

        var password = string.IsNullOrEmpty(request.Password) ? null : request.Password;
        if (password is null && !instance.MailReady)
        {
            return Problem(NoWayBack, statusCode: StatusCodes.Status400BadRequest);
        }

        if (password is not null && Passwords.Problem(password) is { } problem)
        {
            return Problem(problem, statusCode: StatusCodes.Status400BadRequest);
        }

        var db = services.GetRequiredService<ScryDbContext>();
        var sessions = services.GetRequiredService<Sessions>();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email, ct);
        var existing = user is not null;
        if (user is null)
        {
            user = new User { Email = email, LinkStamp = SignInLinks.NewStamp(), CreatedAt = time.GetUtcNow().UtcDateTime };
            db.Users.Add(user);
        }

        // A new stamp ends the user's mailed links, since the installer signs them in. A blank password leaves theirs.
        user.IsAdmin = true;
        user.LinkStamp = SignInLinks.NewStamp();
        if (password is not null)
        {
            user.PasswordHash = Passwords.Hash(user, password);
        }

        services.GetRequiredService<OperatorLog>().Info(
            (existing, password is not null) switch
            {
                (true, true) => $"The installer made {email} an admin, with a new password.",
                (true, false) => $"The installer made {email} an admin.",
                (false, true) => $"The installer made {email}, the first admin.",
                (false, false) => $"The installer made {email}, the first admin, who signs in with mailed links.",
            },
            LogPlace.Instance);
        await db.SaveChangesAsync(ct);
        if (existing)
        {
            await sessions.EndAllAsync(user, "An admin was made from the installer.", ct);
        }

        await installation.AdminMadeAsync(ct);
        await sessions.SignInAsync(user, persistent: false, ct);
        return new MeView(true, user.Id, user.Email, true, user.PasswordHash is not null);
    }

    /// <summary>Sets Postmark's server token and the sender before the first admin, as the Settings page does after.</summary>
    [HttpPut("mail")]
    public async Task<ActionResult<InstallView>> Mail(MailSettingsRequest request, CancellationToken ct)
    {
        if (await MailRefusalAsync(ct) is { } refused)
        {
            return refused;
        }

        if (MailForm.Save(request, instance) is { } failed)
        {
            return Problem(failed.Problem, statusCode: failed.Status);
        }

        if (installation.DatabaseReady)
        {
            await NoteAsync($"The installer set mail to go through Postmark, from {instance.MailFromName} at {instance.Sender}.", ct);
        }

        return await ViewAsync(allowed: true, ct);
    }

    /// <summary>Forgets the stored token and sender, which turns mail off unless configuration sets it.</summary>
    [HttpDelete("mail")]
    public async Task<ActionResult<InstallView>> TurnOffMail(CancellationToken ct)
    {
        if (await MailRefusalAsync(ct) is { } refused)
        {
            return refused;
        }

        instance.File.ClearMail();
        return await ViewAsync(allowed: true, ct);
    }

    /// <summary>Mails the address given, to show the settings work. No admin exists yet to mail instead.</summary>
    [HttpPost("mail/test")]
    public async Task<ActionResult<TestMailView>> TestMail(InstallTestMailRequest request, CancellationToken ct)
    {
        if (await MailRefusalAsync(ct) is { } refused)
        {
            return refused;
        }

        if (!instance.MailReady)
        {
            return Problem(InstanceMailer.NotSetUp, statusCode: StatusCodes.Status409Conflict);
        }

        if (Emails.Normalize(request.To) is not { } to)
        {
            return Problem("Enter the address to send the test mail to.", statusCode: StatusCodes.Status400BadRequest);
        }

        return await MailForm.TestAsync(mailer, instance, to, ct) is { } failed
            ? Problem(failed, statusCode: StatusCodes.Status502BadGateway)
            : MailForm.Sent(to, instance);
    }

    /// <summary>Writes the install code to Scry's log, for a page on another machine. It is written at most once a minute.</summary>
    [HttpPost("code")]
    public async Task<IActionResult> Code(CancellationToken ct)
    {
        await installation.AnnounceAsync(ct);
        return NoContent();
    }

    // The installer's routes run before the database is set, so each entry is saved through a context of its own.
    private async Task NoteAsync(string text, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        scope.ServiceProvider.GetRequiredService<OperatorLog>().Info(text, LogPlace.Instance);
        await scope.ServiceProvider.GetRequiredService<ScryDbContext>().SaveChangesAsync(ct);
    }

    // Mail is the installer's only until the instance is set up; the Settings page changes it from then on.
    private async Task<ObjectResult?> MailRefusalAsync(CancellationToken ct) =>
        Refusal() ?? (await installation.IsInstalledAsync(ct) ? Problem(MailIsSet, statusCode: StatusCodes.Status409Conflict) : null);

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

    private async Task<InstallView> ViewAsync(bool allowed, CancellationToken ct)
    {
        var stage = await installation.StageAsync(ct);
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
            instance.ApiOriginConfigured,
            instance.MailReady,
            allowed ? MailForm.View(instance) : null);
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
