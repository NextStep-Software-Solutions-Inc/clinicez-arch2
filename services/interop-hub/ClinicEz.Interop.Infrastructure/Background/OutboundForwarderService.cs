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
