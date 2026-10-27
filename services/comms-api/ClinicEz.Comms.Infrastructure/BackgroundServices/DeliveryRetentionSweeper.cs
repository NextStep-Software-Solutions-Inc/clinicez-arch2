using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Comms.Infrastructure.BackgroundServices;

public class DeliveryRetentionSweeper : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<DeliveryRetentionSweeper> _logger;
    private readonly TimeSpan _interval;

    public DeliveryRetentionSweeper(
        IServiceProvider serviceProvider,
        ILogger<DeliveryRetentionSweeper> logger,
        TimeSpan? interval = null)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _interval = interval ?? TimeSpan.FromMinutes(1);
    }

    public async Task<int> SweepOnceAsync(CancellationToken ct = default)
    {
        using var scope = _serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ICommsDbContext>();
        var notifier = scope.ServiceProvider.GetRequiredService<ICommsRealtimeNotifier>();

        var now = DateTime.UtcNow;
        var expiredMessages = await db.Messages
            .Where(m => m.State == DeliveryState.Waiting && m.RetentionDeadlineUtc <= now)
            .Take(100)
            .ToListAsync(ct);

        if (expiredMessages.Count == 0) return 0;

        foreach (var msg in expiredMessages)
        {
            msg.State = DeliveryState.NotReceived;
            msg.UpdatedAtUtc = now;
        }

        await db.SaveChangesAsync(ct);

        foreach (var msg in expiredMessages)
        {
            await notifier.NotifyMessageStateChangedAsync(msg.ConversationId, msg.Id, DeliveryState.NotReceived, now, ct);
        }

        return expiredMessages.Count;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SweepOnceAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred during delivery retention sweep.");
            }

            try
            {
                await Task.Delay(_interval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
