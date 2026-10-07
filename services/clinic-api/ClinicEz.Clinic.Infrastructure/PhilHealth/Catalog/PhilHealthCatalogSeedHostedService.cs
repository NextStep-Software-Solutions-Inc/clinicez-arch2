using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using ClinicEz.Clinic.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ClinicEz.Clinic.Infrastructure.Persistence;

namespace ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog;

/// <summary>Reads the PhilHealth Catalog JSON files that ship inside the assembly.</summary>
public static class PhilHealthCatalogEmbeddedSeed
{
    public const string ResourcePrefix = "PhilHealthCatalog.Seed.";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() },
    };

    private sealed record SeedFile(string Library, string KitVersion, List<SeedItem> Items);

    private sealed record SeedItem(string Code, string Description, bool IsActive = true, Dictionary<string, string>? Attributes = null);

    public static IReadOnlyList<string> ResourceNames { get; } = typeof(PhilHealthCatalogEmbeddedSeed).Assembly
        .GetManifestResourceNames()
        .Where(n => n.StartsWith(ResourcePrefix, StringComparison.Ordinal) && n.EndsWith(".json", StringComparison.Ordinal))
        .OrderBy(n => n, StringComparer.Ordinal)
        .ToList();

    public static IEnumerable<PhilHealthCatalogFile> ReadAll()
    {
        foreach (var name in ResourceNames)
        {
            using var stream = typeof(PhilHealthCatalogEmbeddedSeed).Assembly.GetManifestResourceStream(name)!;
            yield return Parse(stream);
        }
    }

    /// <summary>Parses the uniform <c>{ library, kitVersion, items }</c> JSON (seed files and JSON uploads).</summary>
    public static PhilHealthCatalogFile Parse(Stream json)
    {
        SeedFile? file;
        try
        {
            file = JsonSerializer.Deserialize<SeedFile>(json, Json);
        }
        catch (JsonException ex)
        {
            throw new PhilHealthCatalogValidationException($"The JSON file could not be read: {ex.Message}");
        }

        if (file is null || file.Items is null)
            throw new PhilHealthCatalogValidationException("The JSON file must contain library, kitVersion and items.");

        return new PhilHealthCatalogFile(
            file.Library ?? string.Empty,
            file.KitVersion ?? string.Empty,
            file.Items
                .Select(i => new PhilHealthCatalogEntry(
                    (i.Code ?? string.Empty).Trim(),
                    (i.Description ?? string.Empty).Trim(),
                    i.IsActive,
                    i.Attributes is { Count: > 0 } ? i.Attributes : null))
                .ToList());
    }
}

/// <summary>
/// Applies pending EF migrations at startup so a fresh on-prem install (or an upgrade) has its schema before anything
/// else runs. Disable with <c>Database:AutoMigrate=false</c> when migrations are applied by a separate release step.
/// </summary>
public sealed class DatabaseMigrationHostedService : IHostedService
{
    private readonly IServiceProvider _services;
    private readonly IConfiguration _configuration;
    private readonly ILogger<DatabaseMigrationHostedService> _logger;

    public DatabaseMigrationHostedService(IServiceProvider services, IConfiguration configuration, ILogger<DatabaseMigrationHostedService> logger)
    {
        _services = services;
        _configuration = configuration;
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

        _logger.LogInformation("Applying {Count} pending database migration(s)", pending.Count);
        await db.Database.MigrateAsync(cancellationToken);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}

/// <summary>
/// Loads the bundled PhilHealth Catalog on every boot. The import is idempotent, so this is a no-op once the data is
/// current, picks up a newer bundled kit after an upgrade, and never overwrites an administrator's newer upload.
/// Runs in the background so the API accepts requests immediately.
/// </summary>
public sealed class PhilHealthCatalogSeedHostedService : BackgroundService
{
    public const string SystemActor = "system:seed";

    private readonly IServiceProvider _services;
    private readonly IConfiguration _configuration;
    private readonly ILogger<PhilHealthCatalogSeedHostedService> _logger;

    public PhilHealthCatalogSeedHostedService(IServiceProvider services, IConfiguration configuration, ILogger<PhilHealthCatalogSeedHostedService> logger)
    {
        _services = services;
        _configuration = configuration;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_configuration.GetValue("PhilHealthCatalog:SeedOnBoot", true)) return;

        try
        {
            foreach (var file in PhilHealthCatalogEmbeddedSeed.ReadAll())
            {
                stoppingToken.ThrowIfCancellationRequested();
                using var scope = _services.CreateScope();
                var import = scope.ServiceProvider.GetRequiredService<IPhilHealthCatalogImportService>();
                await import.ImportAsync(file, PhilHealthCatalogImportSource.Seed, SystemActor, dryRun: false, stoppingToken);
            }
        }
        catch (OperationCanceledException)
        {
            // shutting down
        }
        catch (Exception ex)
        {
            // The API stays usable (catalog endpoints return what is loaded); the next boot retries.
            _logger.LogError(ex, "PhilHealth Catalog seeding failed");
        }
    }
}
