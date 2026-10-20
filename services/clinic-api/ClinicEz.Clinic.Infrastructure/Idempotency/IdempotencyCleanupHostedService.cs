using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Idempotency;

/// <summary>Forgets stored idempotent responses after a week (clients retry within minutes or hours, not weeks).</summary>
public sealed class IdempotencyCleanupHostedService : BackgroundService
{
    public static readonly TimeSpan Retention = TimeSpan.FromDays(7);
    private static readonly TimeSpan Interval = TimeSpan.FromHours(6);

    private readonly IServiceProvider _services;
    private readonly ILogger<IdempotencyCleanupHostedService> _logger;

    public IdempotencyCleanupHostedService(IServiceProvider services, ILogger<IdempotencyCleanupHostedService> logger)
    {
        _services = services;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _services.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var cutoff = DateTime.UtcNow - Retention;
                var removed = await db.Set<IdempotencyRecord>()
                    .IgnoreQueryFilters()
                    .Where(r => r.CreatedAt < cutoff)
                    .ExecuteDeleteAsync(stoppingToken);
                if (removed > 0) _logger.LogInformation("Removed {Count} expired idempotency records.", removed);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Idempotency cleanup failed; it will retry later.");
            }

            try
            {
                await Task.Delay(Interval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }
}
