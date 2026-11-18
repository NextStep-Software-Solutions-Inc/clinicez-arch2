using System;
using System.Data;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace ClinicEz.Shared.Persistence;

/// <summary>
/// Development-only helper that checks if the target PostgreSQL database exists and automatically
/// creates it (along with the 'vector' extension if supported) before EF Core migrations run.
///
/// Under Production or any non-Development environment, this helper is a strict no-op to uphold
/// the principle of least privilege and prevent accidental phantom database creation.
/// </summary>
public static class DevelopmentDatabaseAutoCreator
{
    private static readonly string[] MaintenanceDatabases = ["postgres", "neondb", "template1"];

    /// <summary>
    /// Checks if the target database exists on the PostgreSQL host and creates it if missing,
    /// strictly when <paramref name="env"/> indicates a Development environment.
    /// </summary>
    public static async Task EnsureDevelopmentDatabaseCreatedAsync(
        this DbContext dbContext,
        IHostEnvironment? env,
        ILogger? logger = null,
        CancellationToken cancellationToken = default)
    {
        // 1. Strict Environment Guard: Only execute in Development environment
        if (env is not null && !env.IsDevelopment())
        {
            return;
        }

        // 2. Only applicable to relational PostgreSQL databases
        if (!dbContext.Database.IsRelational())
        {
            return;
        }

        var providerName = dbContext.Database.ProviderName;
        if (providerName is null || !providerName.Contains("Npgsql", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        var connectionString = dbContext.Database.GetConnectionString();
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return;
        }

        NpgsqlConnectionStringBuilder targetBuilder;
        try
        {
            targetBuilder = new NpgsqlConnectionStringBuilder(connectionString);
        }
        catch (Exception ex)
        {
            logger?.LogWarning(ex, "[DevelopmentDatabaseAutoCreator] Failed to parse connection string: {Message}", ex.Message);
            return;
        }

        var targetDatabase = targetBuilder.Database;
        if (string.IsNullOrWhiteSpace(targetDatabase) ||
            targetDatabase.Equals("postgres", StringComparison.OrdinalIgnoreCase) ||
            targetDatabase.Equals("template1", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        bool databaseCreatedOrVerified = false;

        foreach (var maintenanceDb in MaintenanceDatabases)
        {
            var adminBuilder = new NpgsqlConnectionStringBuilder(connectionString)
            {
                Database = maintenanceDb,
                Timeout = 15,
                CommandTimeout = 30
            };

            const int maxRetries = 3;
            for (var attempt = 1; attempt <= maxRetries; attempt++)
            {
                try
                {
                    await using var adminConn = new NpgsqlConnection(adminBuilder.ConnectionString);
                    await adminConn.OpenAsync(cancellationToken);

                    bool exists;
                    await using (var checkCmd = adminConn.CreateCommand())
                    {
                        checkCmd.CommandText = "SELECT 1 FROM pg_database WHERE datname = @name;";
                        checkCmd.Parameters.AddWithValue("name", targetDatabase);
                        var scalar = await checkCmd.ExecuteScalarAsync(cancellationToken);
                        exists = scalar != null && scalar != DBNull.Value;
                    }

                    if (!exists)
                    {
                        logger?.LogInformation(
                            "[DevelopmentDatabaseAutoCreator] Database '{Database}' does not exist on PostgreSQL server. Auto-creating for Development...",
                            targetDatabase);

                        var escapedDbName = targetDatabase.Replace("\"", "\"\"");
                        await using (var createCmd = adminConn.CreateCommand())
                        {
                            createCmd.CommandText = $"CREATE DATABASE \"{escapedDbName}\" ENCODING 'UTF8';";
                            await createCmd.ExecuteNonQueryAsync(cancellationToken);
                        }

                        logger?.LogInformation(
                            "[DevelopmentDatabaseAutoCreator] Database '{Database}' created successfully.",
                            targetDatabase);
                    }

                    databaseCreatedOrVerified = true;
                    break;
                }
                catch (PostgresException ex) when (ex.SqlState == "3D000") // Database does not exist (maintenance db)
                {
                    // If maintenance db (e.g. 'postgres') doesn't exist, try next maintenance db
                    break;
                }
                catch (NpgsqlException ex) when (attempt < maxRetries && !cancellationToken.IsCancellationRequested)
                {
                    logger?.LogDebug(
                        "[DevelopmentDatabaseAutoCreator] Waiting for PostgreSQL host connection (attempt {Attempt}/{Max}): {Message}",
                        attempt, maxRetries, ex.Message);
                    try
                    {
                        await Task.Delay(1000, cancellationToken);
                    }
                    catch (OperationCanceledException)
                    {
                        return;
                    }
                }
                catch (Exception ex)
                {
                    logger?.LogWarning(
                        ex,
                        "[DevelopmentDatabaseAutoCreator] Notice: Could not auto-create database '{Database}' via maintenance DB '{MaintenanceDb}': {Message}",
                        targetDatabase,
                        maintenanceDb,
                        ex.Message);
                    break;
                }
            }

            if (databaseCreatedOrVerified)
            {
                break;
            }
        }

        // 3. Best-effort enable 'vector' extension for pgvector compatibility in Development
        if (databaseCreatedOrVerified)
        {
            try
            {
                var appBuilder = new NpgsqlConnectionStringBuilder(connectionString)
                {
                    Database = targetDatabase,
                    Timeout = 15,
                    CommandTimeout = 30
                };

                await using var appConn = new NpgsqlConnection(appBuilder.ConnectionString);
                await appConn.OpenAsync(cancellationToken);

                await using var extCmd = appConn.CreateCommand();
                extCmd.CommandText = "CREATE EXTENSION IF NOT EXISTS vector;";
                await extCmd.ExecuteNonQueryAsync(cancellationToken);
            }
            catch (Exception ex)
            {
                // Extension may not be installed in current image or user lacks superuser rights; harmless in dev
                logger?.LogDebug(
                    "[DevelopmentDatabaseAutoCreator] Notice: Could not enable 'vector' extension on '{Database}': {Message}",
                    targetDatabase,
                    ex.Message);
            }
        }
    }

    /// <summary>
    /// Synchronously checks if the target database exists on the PostgreSQL host and creates it if missing,
    /// strictly when <paramref name="env"/> indicates a Development environment.
    /// </summary>
    public static void EnsureDevelopmentDatabaseCreated(
        this DbContext dbContext,
        IHostEnvironment? env,
        ILogger? logger = null)
    {
        EnsureDevelopmentDatabaseCreatedAsync(dbContext, env, logger).GetAwaiter().GetResult();
    }

    /// <summary>
    /// In Development, ensures the database is created and then applies EF Core migrations.
    /// In non-Development environments, this simply applies migrations if relational.
    /// </summary>
    public static async Task EnsureDevelopmentDatabaseCreatedAndMigratedAsync(
        this DbContext dbContext,
        IHostEnvironment? env,
        ILogger? logger = null,
        CancellationToken cancellationToken = default)
    {
        await dbContext.EnsureDevelopmentDatabaseCreatedAsync(env, logger, cancellationToken);
        if (dbContext.Database.IsRelational())
        {
            await dbContext.Database.MigrateAsync(cancellationToken);
        }
    }

    /// <summary>
    /// Synchronously ensures the database is created in Development and applies EF Core migrations.
    /// </summary>
    public static void EnsureDevelopmentDatabaseCreatedAndMigrated(
        this DbContext dbContext,
        IHostEnvironment? env,
        ILogger? logger = null)
    {
        EnsureDevelopmentDatabaseCreated(dbContext, env, logger);
        if (dbContext.Database.IsRelational())
        {
            dbContext.Database.Migrate();
        }
    }
}
