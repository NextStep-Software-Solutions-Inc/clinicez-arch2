using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog;

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
