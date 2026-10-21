using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Interop.Application;
using ClinicEz.Interop.Application.Abstractions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ClinicEz.Interop.Infrastructure.Background;

/// <summary>
/// Housekeeping, safe to run on every hub instance at once: dead-letters messages whose last attempt lapsed, purges expired
/// messages (TTL), dead letters past retention, expired conversations/claims. Redelivery after a visibility timeout needs no job:
/// a pulled message simply becomes claimable again once its timeout passes.
/// </summary>
public sealed class HubMaintenanceService(IServiceScopeFactory scopes, IOptions<HubOptions> options, ILogger<HubMaintenanceService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var bg = options.Value.Background;
        if (!bg.Enabled) return;

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunOnceAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Hub maintenance iteration failed.");
            }

            await Task.Delay(TimeSpan.FromSeconds(bg.MaintenanceIntervalSeconds), stoppingToken);
        }
    }

    public async Task<MaintenanceReport> RunOnceAsync(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var report = await scope.ServiceProvider.GetRequiredService<IMessageStore>().RunMaintenanceAsync(ct);
        if (report.DeadLettered + report.ExpiredPurged + report.DeadLettersPurged > 0)
            logger.LogInformation("Hub maintenance: {Report}", report);
        return report;
    }
}
