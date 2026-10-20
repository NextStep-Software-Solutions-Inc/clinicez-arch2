using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Interop.Application;
using ClinicEz.Interop.Application.Abstractions;
using ClinicEz.Interop.Application.Local;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ClinicEz.Interop.Infrastructure.Background;

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
