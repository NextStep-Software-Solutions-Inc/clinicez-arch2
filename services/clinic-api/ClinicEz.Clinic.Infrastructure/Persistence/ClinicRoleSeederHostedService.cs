using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Persistence;

/// <summary>
/// Background service that executes on application startup to idempotently ensure all clinics
/// have canonical system roles (including Clinic Administrator and Data Protection Officer)
/// and that newly introduced system permissions (such as AuditRead and AuditExport) are present.
/// Strictly updates only built-in system roles (IsSystem == true); custom roles remain untouched.
/// </summary>
public sealed class ClinicRoleSeederHostedService : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<ClinicRoleSeederHostedService> _logger;

    public ClinicRoleSeederHostedService(IServiceProvider services, ILogger<ClinicRoleSeederHostedService> logger)
    {
        _services = services;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            using var scope = _services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            _logger.LogInformation("ClinicRoleSeederHostedService: Starting system role and permission synchronization across all clinics...");
            var updatedClinics = await ClinicRoleSeeder.SeedOrUpdateAllClinicsAsync(db, _logger, stoppingToken);
            _logger.LogInformation("ClinicRoleSeederHostedService: System role synchronization completed. Synchronized {Count} clinic(s).", updatedClinics);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "ClinicRoleSeederHostedService: Failed to synchronize system roles and permissions across clinics.");
        }
    }
}
