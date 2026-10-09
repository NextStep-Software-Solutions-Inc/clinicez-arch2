using ClinicEz.Interop.Application;
using ClinicEz.Interop.Application.Abstractions;
using ClinicEz.Interop.Application.Local;
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

/// <summary>Local mode: forwards the outbound queue to the cloud hub with exponential backoff (store-and-forward).</summary>
public sealed class OutboundForwarderService(IServiceScopeFactory scopes, IMailboxNotifier notifier, IOptions<HubOptions> options, ILogger<OutboundForwarderService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var opt = options.Value;
        if (!opt.UpstreamActive || !opt.Background.Enabled) return;

        while (!stoppingToken.IsCancellationRequested)
        {
            var settled = 0;
            try
            {
                using var scope = scopes.CreateScope();
                settled = await scope.ServiceProvider.GetRequiredService<OutboundForwarder>().RunOnceAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Outbound forwarding iteration failed.");
            }

            if (settled == 0)
                await notifier.WaitAsync(MailboxNames.OutboundSignal, TimeSpan.FromMilliseconds(opt.Upstream.ForwardIntervalMs), stoppingToken);
        }
    }
}

/// <summary>Local mode: long-polls the cloud cell-inbox and fans messages into local service mailboxes.</summary>
public sealed class CellInboxPullerService(IServiceScopeFactory scopes, IOptions<HubOptions> options, ILogger<CellInboxPullerService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var opt = options.Value;
        if (!opt.UpstreamActive || !opt.Background.Enabled) return;

        var failures = 0;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                await scope.ServiceProvider.GetRequiredService<CellInboxPuller>().RunOnceAsync(opt.Upstream.PollWaitSeconds, stoppingToken);
                failures = 0;
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                failures++;
                logger.LogWarning(ex, "Cell-inbox pull failed (attempt {Failures}); the upstream hub may be unreachable.", failures);
                var delay = Math.Min(Math.Pow(2, Math.Min(failures, 12)), opt.Upstream.MaxBackoffSeconds);
                await Task.Delay(TimeSpan.FromSeconds(delay), stoppingToken);
            }
        }
    }
}

/// <summary>Local mode: keeps the read-only directory copy in sync with the cloud hub.</summary>
public sealed class DirectorySyncService(IServiceScopeFactory scopes, IOptions<HubOptions> options, ILogger<DirectorySyncService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var opt = options.Value;
        if (!opt.UpstreamActive || !opt.Background.Enabled) return;

        while (!stoppingToken.IsCancellationRequested)
        {
            var delay = TimeSpan.FromSeconds(opt.Upstream.DirectorySyncSeconds);
            try
            {
                using var scope = scopes.CreateScope();
                await scope.ServiceProvider.GetRequiredService<DirectorySyncer>().RunOnceAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Directory snapshot sync failed; the local directory stays as it was.");
                delay = TimeSpan.FromSeconds(Math.Min(10, opt.Upstream.DirectorySyncSeconds));
            }

            await Task.Delay(delay, stoppingToken);
        }
    }
}
