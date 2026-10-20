using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Appointments.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.BackgroundServices;

public sealed class AppointmentReminderBackgroundService : BackgroundService
{
    private static readonly TimeSpan DefaultCheckInterval = TimeSpan.FromSeconds(60);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AppointmentReminderBackgroundService> _logger;
    private readonly TimeSpan _checkInterval;

    public AppointmentReminderBackgroundService(
        IServiceScopeFactory scopeFactory,
        ILogger<AppointmentReminderBackgroundService> logger)
        : this(scopeFactory, logger, DefaultCheckInterval)
    {
    }

    public AppointmentReminderBackgroundService(
        IServiceScopeFactory scopeFactory,
        ILogger<AppointmentReminderBackgroundService> logger,
        TimeSpan checkInterval)
    {
        _scopeFactory = scopeFactory ?? throw new ArgumentNullException(nameof(scopeFactory));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _checkInterval = checkInterval;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Appointment Reminder Background Service started with check interval {Interval}.", _checkInterval);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunReminderCycleAsync(null, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error in appointment reminder background cycle.");
            }

            try
            {
                await Task.Delay(_checkInterval, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
        }
    }

    public async Task<int> RunReminderCycleAsync(DateTime? utcNowOverride = null, CancellationToken ct = default)
    {
        var utcNow = utcNowOverride ?? DateTime.UtcNow;
        List<ClinicSettings> activeClinics;

        using (var initialScope = _scopeFactory.CreateScope())
        {
            var db = initialScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            activeClinics = await db.ClinicSettings
                .IgnoreQueryFilters()
                .Where(s => !s.IsDeleted && s.EnableAppointmentReminders)
                .AsNoTracking()
                .ToListAsync(ct);
        }

        var totalReminders = 0;

        foreach (var clinic in activeClinics)
        {
            if (ct.IsCancellationRequested) break;

            try
            {
                using var clinicScope = _scopeFactory.CreateScope();
                var db = clinicScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var dispatcher = clinicScope.ServiceProvider.GetService<IAppointmentNotificationDispatcher>();

                var remindersSent = await ProcessClinicRemindersAsync(db, dispatcher, clinic, utcNow, ct);
                totalReminders += remindersSent;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to process appointment reminders for clinic {ClinicId} ({ClinicName}).",
                    clinic.ClinicId, clinic.ClinicName);
            }
        }

        return totalReminders;
    }

    public async Task<int> ProcessClinicRemindersAsync(
        ApplicationDbContext db,
        IAppointmentNotificationDispatcher? dispatcher,
        ClinicSettings clinic,
        DateTime utcNow,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(clinic);

        if (!clinic.EnableAppointmentReminders || clinic.IsDeleted)
        {
            return 0;
        }

        var clinicReminders = 0;

        // 24-Hour Advance Window Scan: now+23h to now+25h
        if (clinic.AppointmentReminder24hEnabled)
        {
            var window24hStart = utcNow.AddHours(23);
            var window24hEnd = utcNow.AddHours(25);

            var candidates24h = await db.Appointments
                .IgnoreQueryFilters()
                .Where(a => a.ClinicId == clinic.ClinicId &&
                            !a.IsDeleted &&
                            a.Status == AppointmentStatus.Confirmed &&
                            !a.Reminder24hSent &&
                            a.ScheduledAt >= window24hStart &&
                            a.ScheduledAt <= window24hEnd)
                .ToListAsync(ct);

            foreach (var appt in candidates24h)
            {
                if (dispatcher != null)
                {
                    await dispatcher.DispatchAlertAsync(appt, AppointmentAlertKinds.Reminder24h, ct);
                }

                appt.Reminder24hSent = true;
                appt.Reminder24hSentAt = utcNow;
                appt.LastReminderSentAt = utcNow;
                appt.LastReminderType = "24h";
                appt.UpdatedAt = utcNow;
                appt.UpdatedBy = "AppointmentReminderBackgroundService";
                clinicReminders++;
            }
        }

        // 2-Hour Advance Window Scan: now+1h to now+2.5h
        if (clinic.AppointmentReminder2hEnabled)
        {
            var window2hStart = utcNow.AddHours(1);
            var window2hEnd = utcNow.AddHours(2.5);

            var candidates2h = await db.Appointments
                .IgnoreQueryFilters()
                .Where(a => a.ClinicId == clinic.ClinicId &&
                            !a.IsDeleted &&
                            a.Status == AppointmentStatus.Confirmed &&
                            !a.Reminder2hSent &&
                            a.ScheduledAt >= window2hStart &&
                            a.ScheduledAt <= window2hEnd)
                .ToListAsync(ct);

            foreach (var appt in candidates2h)
            {
                if (dispatcher != null)
                {
                    await dispatcher.DispatchAlertAsync(appt, AppointmentAlertKinds.Reminder2h, ct);
                }

                appt.Reminder2hSent = true;
                appt.Reminder2hSentAt = utcNow;
                appt.LastReminderSentAt = utcNow;
                appt.LastReminderType = "2h";
                appt.UpdatedAt = utcNow;
                appt.UpdatedBy = "AppointmentReminderBackgroundService";
                clinicReminders++;
            }
        }

        if (clinicReminders > 0)
        {
            await db.SaveChangesAsync(ct);
            _logger.LogInformation(
                "Successfully dispatched and committed {Count} appointment reminders for clinic {ClinicId} ({ClinicName}).",
                clinicReminders, clinic.ClinicId, clinic.ClinicName);
        }

        return clinicReminders;
    }
}
