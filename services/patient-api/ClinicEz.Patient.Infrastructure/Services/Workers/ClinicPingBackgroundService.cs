using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Infrastructure.Services.Workers;

public class ClinicPingBackgroundService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<ClinicPingBackgroundService> _logger;

    public ClinicPingBackgroundService(IServiceProvider serviceProvider, ILogger<ClinicPingBackgroundService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Run immediately on startup, then every 5 minutes
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await PingClinicsAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while pinging clinics.");
            }

            await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
        }
    }

    private async Task PingClinicsAsync(CancellationToken cancellationToken)
    {
        using var scope = _serviceProvider.CreateScope();
        var clinicRepository = scope.ServiceProvider.GetRequiredService<IClinicRepository>();
        var clinicDashboardService = scope.ServiceProvider.GetRequiredService<IClinicDashboardService>();

        // Get all active clinics that have a BaseUrl configured
        var allClinics = await clinicRepository.GetAllAsync(cancellationToken);
        var activeClinics = allClinics.Where(c => !string.IsNullOrWhiteSpace(c.BaseUrl)).ToList();

        _logger.LogInformation("Pinging {Count} clinics...", activeClinics.Count);

        foreach (var clinic in activeClinics)
        {
            if (cancellationToken.IsCancellationRequested) break;

            try
            {
                var isAlive = await clinicDashboardService.PingClinicAsync(clinic.BaseUrl!, cancellationToken);
                if (!isAlive)
                {
                    _logger.LogWarning("Clinic {ClinicName} ({ClinicId}) at {BaseUrl} did not respond successfully to ping.",
                        clinic.Name, clinic.Id, clinic.BaseUrl);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to ping clinic {ClinicId}", clinic.Id);
            }
        }
    }
}
