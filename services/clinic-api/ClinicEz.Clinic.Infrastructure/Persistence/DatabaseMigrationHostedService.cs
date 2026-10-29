using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Persistence;

/// <summary>
/// Applies pending EF migrations at startup so a fresh on-prem install (or an upgrade) has its schema before anything
/// else runs. Disable with <c>Database:AutoMigrate=false</c> when migrations are applied by a separate release step.
/// </summary>
public sealed class DatabaseMigrationHostedService : IHostedService
{
    private const string BaselineMigrationId = "20261028232311_InitialCreate";

    private readonly IServiceProvider _services;
    private readonly IConfiguration _configuration;
    private readonly IHostEnvironment _environment;
    private readonly ILogger<DatabaseMigrationHostedService> _logger;

    public DatabaseMigrationHostedService(
        IServiceProvider services,
        IConfiguration configuration,
        IHostEnvironment environment,
        ILogger<DatabaseMigrationHostedService> logger)
    {
        _services = services;
        _configuration = configuration;
        _environment = environment;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (!_configuration.GetValue("Database:AutoMigrate", true)) return;

        using var scope = _services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        if (!db.Database.IsRelational()) return;

        var pending = (await db.Database.GetPendingMigrationsAsync(cancellationToken)).ToList();
        if (pending.Count == 0) return;

        if (_environment.IsDevelopment() &&
            pending.Contains(BaselineMigrationId, StringComparer.OrdinalIgnoreCase))
        {
            var applied = (await db.Database.GetAppliedMigrationsAsync(cancellationToken)).ToList();
            var hasExistingPublicTables = applied.Count > 0;
            if (!hasExistingPublicTables)
            {
                var count = await db.Database
                    .SqlQueryRaw<int>(
                        """
                        SELECT COUNT(*)::int AS "Value"
                        FROM information_schema.tables
                        WHERE table_schema = 'public'
                          AND table_type = 'BASE TABLE'
                          AND table_name <> '__EFMigrationsHistory'
                        """)
                    .FirstOrDefaultAsync(cancellationToken);
                hasExistingPublicTables = count > 0;
            }

            if (hasExistingPublicTables)
            {
                _logger.LogWarning(
                    "Detected pre-squash schema state ({AppliedCount} prior migration(s)) in Development without baseline {BaselineId}. Resetting public schema for clean 1NF baseline...",
                    applied.Count,
                    BaselineMigrationId);

                await db.Database.ExecuteSqlRawAsync(
                    """
                    DROP SCHEMA IF EXISTS public CASCADE;
                    CREATE SCHEMA public;
                    GRANT ALL ON SCHEMA public TO public;
                    """,
                    cancellationToken);

                try
                {
                    await db.Database.ExecuteSqlRawAsync("CREATE EXTENSION IF NOT EXISTS vector;", cancellationToken);
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "pgvector extension not available during Development schema reset; continuing.");
                }

                Npgsql.NpgsqlConnection.ClearAllPools();
            }
        }

        _logger.LogInformation("Applying {Count} pending database migration(s)", pending.Count);
        await db.Database.MigrateAsync(cancellationToken);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
