using Scry.Api.Storage;

namespace Scry.Api;

public enum InstallStage
{
    Database,
    Address,
    Done,
}

/// <summary>
/// Whether the instance is set up: its database opens and is up to date, and it knows its client's address and its
/// own. Until then, only the installer and the health check answer.
/// </summary>
public sealed partial class Installation(
    Instance instance,
    IDatabaseHost database,
    IServiceScopeFactory scopes,
    PendingSyncs syncs,
    InstallCode code,
    ILogger<Installation> logger) : IDisposable
{
    private static readonly TimeSpan RepairLifetime = TimeSpan.FromHours(1);

    private readonly SemaphoreSlim _switching = new(1, 1);
    private volatile bool _ready;
    private volatile string? _problem;

    /// <summary>The database contexts open, or null before one is set.</summary>
    public string? ConnectionString => instance.ConfiguredConnectionString ?? instance.File.Database?.ConnectionString;

    public bool DatabaseReady => _ready;

    /// <summary>Why the database set could not be opened, in the server's words.</summary>
    public string? DatabaseProblem => _problem;

    public InstallStage Stage =>
        !_ready ? InstallStage.Database
        : instance.ClientOrigin is null || instance.ApiOrigin is null ? InstallStage.Address
        : InstallStage.Done;

    public bool IsInstalled => Stage == InstallStage.Done;

    /// <summary>Opens the database at Scry's start, and writes the install code to the log while it is not set up.</summary>
    public async Task StartAsync(CancellationToken ct)
    {
        if (ConnectionString is { } connectionString)
        {
            await OpenAsync(connectionString, ct);
        }
        else if (instance.File.DatabasePlace is not null)
        {
            _problem = "Scry cannot decrypt its database's password, since the keys in its data folder changed. Enter the password again.";
        }

        if (!IsInstalled)
        {
            Announce();
        }
    }

    /// <summary>
    /// Opens the database, makes it if it is missing, and brings it up to date, then keeps it in place of any set before.
    /// Answers why it could not, leaving the one before in place.
    /// </summary>
    public async Task<string?> UseDatabaseAsync(DatabaseSettings settings, CancellationToken ct)
    {
        await _switching.WaitAsync(ct);
        try
        {
            try
            {
                await database.PrepareAsync(settings.ConnectionString, ct);
            }
            catch (DatabaseException ex)
            {
                return ex.Message;
            }

            var moved = !_ready || instance.File.DatabasePlace is not { } before || !before.SamePlace(settings);
            instance.File.SaveDatabase(settings);
            _problem = null;
            if (moved)
            {
                // Queued syncs name sources in the database left behind.
                syncs.Forget();
                _ready = true;
                await RequeueAsync(ct);
            }

            return null;
        }
        finally
        {
            _switching.Release();
        }
    }

    /// <summary>Spends the install code once saving the addresses sets the instance up.</summary>
    public void AddressesSaved()
    {
        if (IsInstalled)
        {
            code.Clear();
        }
    }

    /// <summary>
    /// Writes the install code to the log, with the installer's address. On an instance already set up, the code is one
    /// for changing its addresses, and lasts an hour.
    /// </summary>
    public void Announce()
    {
        var installed = IsInstalled;
        var issued = code.Issue(installed ? RepairLifetime : null);
        if (!code.MayAnnounce())
        {
            return;
        }

        var page = instance.ClientOrigin is { } client ? $"{client}/install#{issued}" : "/install on the Scry client";
        if (installed)
        {
            LogRepair(logger, page, issued);
        }
        else
        {
            LogInstall(logger, page, issued);
        }
    }

    private async Task OpenAsync(string connectionString, CancellationToken ct)
    {
        try
        {
            await database.PrepareAsync(connectionString, ct);
        }
        catch (DatabaseException ex)
        {
            _problem = ex.Message;
            LogUnreachable(logger, ex.Message);
            return;
        }

        _ready = true;
        await RequeueAsync(ct);
    }

    // A sync that a restart, or a change of database, cut off starts again.
    private async Task RequeueAsync(CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        await syncs.RequeueAsync(scope.ServiceProvider.GetRequiredService<ScryDbContext>(), ct);
    }

    public void Dispose() => _switching.Dispose();

    [LoggerMessage(Level = LogLevel.Warning, Message = "Scry is not set up yet. Open {Page} to set it up. A page on another machine asks for this install code: {Code}")]
    private static partial void LogInstall(ILogger logger, string page, string code);

    [LoggerMessage(Level = LogLevel.Warning, Message = "An install code was asked for, to change Scry's addresses. Open {Page} within an hour, and enter this code: {Code}")]
    private static partial void LogRepair(ILogger logger, string page, string code);

    [LoggerMessage(Level = LogLevel.Error, Message = "Scry cannot open its database: {Problem}")]
    private static partial void LogUnreachable(ILogger logger, string problem);
}
