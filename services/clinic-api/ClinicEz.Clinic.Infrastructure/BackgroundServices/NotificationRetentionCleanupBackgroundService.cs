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

namespace ClinicEz.Clinic.Infrastructure.BackgroundServices;

public sealed class NotificationRetentionCleanupBackgroundService : BackgroundService
{
    private static readonly TimeSpan CheckInterval = TimeSpan.FromHours(1);

    private readonly IServiceProvider _services;
    private readonly ILogger<NotificationRetentionCleanupBackgroundService> _logger;

    public NotificationRetentionCleanupBackgroundService(
        IServiceProvider services,
        ILogger<NotificationRetentionCleanupBackgroundService> logger)
    {
        _services = services;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Staff Notification Retention Cleanup Background Service started.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunCleanupCycleAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error in notification retention cleanup background cycle.");
            }

            try
            {
                await Task.Delay(CheckInterval, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
        }
    }

    public async Task<int> RunCleanupCycleAsync(CancellationToken ct)
    {
        using var scope = _services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var clinics = await db.Settings
            .IgnoreQueryFilters()
            .Where(s => !s.IsDeleted)
            .Select(s => new { s.ClinicId, s.StaffNotificationRetentionDays })
            .ToListAsync(ct);

        int totalPurged = 0;

        foreach (var clinic in clinics)
        {
            var retentionDays = clinic.StaffNotificationRetentionDays;
            if (retentionDays <= 0)
            {
                // 0 means keep indefinitely
                continue;
            }

            var cutoffDate = DateTime.UtcNow.AddDays(-retentionDays);

            var expiredNotifications = await db.StaffNotifications
                .IgnoreQueryFilters()
                .Where(n => n.ClinicId == clinic.ClinicId &&
                            !n.IsDeleted &&
                            n.IsRead &&
                            n.ReadAt != null &&
                            n.ReadAt < cutoffDate)
                .ToListAsync(ct);

            if (expiredNotifications.Count > 0)
            {
                _logger.LogInformation(
                    "Purging {Count} read staff notifications older than {RetentionDays} days (cutoff: {Cutoff}) for Clinic {ClinicId}.",
                    expiredNotifications.Count, retentionDays, cutoffDate, clinic.ClinicId);

                foreach (var n in expiredNotifications)
                {
                    n.IsDeleted = true;
                    n.DeletedAt = DateTime.UtcNow;
                    n.DeletedBy = "NotificationRetentionCleanupWorker";
                }

                totalPurged += expiredNotifications.Count;
            }
        }

        if (totalPurged > 0)
        {
            await db.SaveChangesAsync(ct);
            _logger.LogInformation("Total expired staff notifications purged: {TotalPurged}", totalPurged);
        }

        return totalPurged;
    }
}
