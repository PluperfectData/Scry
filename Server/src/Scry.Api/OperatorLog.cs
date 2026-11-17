using System.Globalization;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Scry.Api.Storage;

namespace Scry.Api;

/// <summary>Where an operator log entry belongs, which decides who sees it.</summary>
public readonly record struct LogPlace(int? WorkspaceId, Workspace? Workspace, Source? Source)
{
    /// <summary>The whole instance, which only admins see.</summary>
    public static LogPlace Instance => default;

    public static LogPlace In(int workspaceId) => new(workspaceId, null, null);

    public static LogPlace In(Workspace workspace) => new(null, workspace, null);

    public static LogPlace On(Source source) => new(source.WorkspaceId, null, source);
}

/// <summary>
/// Adds operator log entries to the request's own context, so each is saved with the change it describes, or not at all.
/// The caller saves.
/// </summary>
public sealed class OperatorLog(ScryDbContext db, IHttpContextAccessor http, TimeProvider time)
{
    public static string KeyActor(string name) => "key " + name;

    public void Info(string text, LogPlace place, string? actor = null) => Add(EntryLevel.Information, text, place, actor);

    public void Warn(string text, LogPlace place, string? actor = null) => Add(EntryLevel.Warning, text, place, actor);

    public void Error(string text, LogPlace place, string? actor = null) => Add(EntryLevel.Error, text, place, actor);

    private void Add(EntryLevel level, string text, LogPlace place, string? actor)
    {
        var entry = new LogEntry
        {
            At = time.GetUtcNow().UtcDateTime,
            Level = level,
            Text = Clip(text, LogEntry.MaxTextLength),
            Actor = (actor ?? Caller()) is { } who ? Clip(who, LogEntry.MaxActorLength) : null,
            WorkspaceId = place.WorkspaceId,
            Pending = true,
        };

        // A row made in this same request has no id until it is saved, so the entry points at the row itself.
        if (place.Workspace is { } workspace)
        {
            if (workspace.Id == 0)
            {
                entry.Workspace = workspace;
            }
            else
            {
                entry.WorkspaceId = workspace.Id;
            }
        }

        if (place.Source is { } source)
        {
            if (source.Id == 0)
            {
                entry.Source = source;
            }
            else
            {
                entry.SourceId = source.Id;
            }
        }

        db.LogEntries.Add(entry);
    }

    private string? Caller()
    {
        var user = http.HttpContext?.User;
        return user?.Identity?.IsAuthenticated == true ? user.FindFirstValue(ClaimTypes.Name) : null;
    }

    private static string Clip(string text, int length) => text.Length <= length ? text : text[..(length - 1)] + "…";
}

/// <summary>The words operator log entries share.</summary>
public static class LogWords
{
    public static string Rows(long count) => count == 1 ? "1 row" : $"{count.ToString("N0", CultureInfo.InvariantCulture)} rows";

    public static string Columns(int count) => count == 1 ? "1 column" : $"{count.ToString("N0", CultureInfo.InvariantCulture)} columns";

    /// <summary>A chart by its title, or by its kind when it has none: "chart Sales by day", "a bar chart".</summary>
    public static string Chart(string? title, string? kind) =>
        !string.IsNullOrWhiteSpace(title) ? $"chart {title}" : kind is null ? "a chart" : $"a {kind} chart";
}

/// <summary>Writes each operator log entry to the developer log once it is saved.</summary>
public sealed partial class OperatorLogWriter(ILoggerFactory loggers) : SaveChangesInterceptor
{
    public const string Category = "Scry.Operator";

    private readonly ILogger _logger = loggers.CreateLogger(Category);

    public override int SavedChanges(SaveChangesCompletedEventData eventData, int result)
    {
        Write(eventData.Context);
        return result;
    }

    public override ValueTask<int> SavedChangesAsync(SaveChangesCompletedEventData eventData, int result, CancellationToken cancellationToken = default)
    {
        Write(eventData.Context);
        return ValueTask.FromResult(result);
    }

    private void Write(DbContext? context)
    {
        if (context is null)
        {
            return;
        }

        foreach (var entry in context.ChangeTracker.Entries<LogEntry>().Select(e => e.Entity).Where(e => e.Pending).ToList())
        {
            entry.Pending = false;
            var level = entry.Level switch
            {
                EntryLevel.Error => LogLevel.Error,
                EntryLevel.Warning => LogLevel.Warning,
                _ => LogLevel.Information,
            };

            if (entry.Actor is { } actor)
            {
                LogBy(_logger, level, entry.Text, actor);
            }
            else
            {
                Log(_logger, level, entry.Text);
            }
        }
    }

    [LoggerMessage(Message = "{Text}")]
    private static partial void Log(ILogger logger, LogLevel level, string text);

    [LoggerMessage(Message = "{Text} ({Actor})")]
    private static partial void LogBy(ILogger logger, LogLevel level, string text, string actor);
}

/// <summary>Deletes the operator log entries older than the instance keeps them.</summary>
public sealed class LogPruning(ScryDbContext db, Instance instance, TimeProvider time)
{
    public async Task<int> PruneAsync(CancellationToken ct)
    {
        var cutoff = time.GetUtcNow().UtcDateTime.AddDays(-instance.LogDays);
        return await db.LogEntries.Where(e => e.At < cutoff).ExecuteDeleteAsync(ct);
    }
}

/// <summary>Prunes the operator log when the API starts, and every hour after, while it has a database.</summary>
public sealed partial class LogPruner(Installation installation, IServiceScopeFactory scopes, TimeProvider time, ILogger<LogPruner> logger) : BackgroundService
{
    public static readonly TimeSpan Every = TimeSpan.FromHours(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Every, time);
        do
        {
            if (installation.DatabaseReady)
            {
                try
                {
                    using var scope = scopes.CreateScope();
                    await scope.ServiceProvider.GetRequiredService<LogPruning>().PruneAsync(stoppingToken);
                }
                catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
                {
                    LogFailure(logger, ex);
                }
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "The operator log could not be pruned.")]
    private static partial void LogFailure(ILogger logger, Exception ex);
}
