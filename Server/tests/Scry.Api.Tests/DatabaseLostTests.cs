using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MySqlConnector;
using NUnit.Framework;
using Shouldly;

namespace Scry.Api.Tests;

/// <summary>The background workers losing the database while the API runs, as when MySQL restarts.</summary>
[TestFixture]
public sealed class DatabaseLostTests
{
    /// <summary>MySqlConnector's own refusal, from a connection to a local port nothing listens on.</summary>
    private static async Task<MySqlException> RefusedAsync()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        await using var connection = new MySqlConnection($"Server=127.0.0.1;Port={port};User ID=scry;Connection Timeout=10");
        return await Should.ThrowAsync<MySqlException>(() => connection.OpenAsync());
    }

    private static IServiceScopeFactory Throwing<TService>(Exception ex)
        where TService : class
    {
        var services = new ServiceCollection();
        services.AddScoped<TService>(_ => throw ex);
        return services.BuildServiceProvider().GetRequiredService<IServiceScopeFactory>();
    }

    private static async Task<(LogLevel Level, string Text, Exception? Exception)> FirstEntryAsync<T>(BackgroundService worker, ListLogger<T> logger)
    {
        await worker.StartAsync(CancellationToken.None);
        try
        {
            var deadline = DateTime.UtcNow.AddSeconds(10);
            while (logger.Entries.IsEmpty && DateTime.UtcNow < deadline)
            {
                await Task.Delay(10);
            }
        }
        finally
        {
            await worker.StopAsync(CancellationToken.None);
        }

        logger.Entries.Count.ShouldBe(1);
        return logger.Entries.Single();
    }

    [Test]
    public async Task A_refused_connection_is_not_answering_wherever_it_is_wrapped()
    {
        var refused = await RefusedAsync();

        refused.ErrorCode.ShouldBe(MySqlErrorCode.UnableToConnectToHost);
        DatabaseStart.NotAnswering(refused).ShouldBeTrue();
        DatabaseStart.NotAnswering(new InvalidOperationException("An exception was thrown while reading.", refused)).ShouldBeTrue();
        DatabaseStart.NotAnswering(new InvalidOperationException("Access denied for user 'scry'")).ShouldBeFalse();
    }

    [Test]
    public async Task Pruning_that_loses_the_database_logs_one_line()
    {
        using var factory = new ScryApiFactory();
        var installation = factory.Services.GetRequiredService<Installation>();
        installation.DatabaseReady.ShouldBeTrue();
        var logger = new ListLogger<LogPruner>();

        var entry = await FirstEntryAsync(new LogPruner(installation, Throwing<LogPruning>(await RefusedAsync()), TimeProvider.System, logger), logger);

        entry.Level.ShouldBe(LogLevel.Warning);
        entry.Text.ShouldStartWith("The operator log could not be pruned: the database is not answering.");
        entry.Exception.ShouldBeNull();
    }

    [Test]
    public async Task Pruning_that_fails_otherwise_logs_the_exception()
    {
        using var factory = new ScryApiFactory();
        var installation = factory.Services.GetRequiredService<Installation>();
        var logger = new ListLogger<LogPruner>();
        var failure = new InvalidOperationException("Something else broke.");

        var entry = await FirstEntryAsync(new LogPruner(installation, Throwing<LogPruning>(failure), TimeProvider.System, logger), logger);

        entry.Level.ShouldBe(LogLevel.Error);
        entry.Exception.ShouldBeSameAs(failure);
    }

    private sealed class ListLogger<T> : ILogger<T>
    {
        public ConcurrentQueue<(LogLevel Level, string Text, Exception? Exception)> Entries { get; } = new();

        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Entries.Enqueue((logLevel, formatter(state, exception), exception));
    }
}
