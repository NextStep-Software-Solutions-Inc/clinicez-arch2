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
