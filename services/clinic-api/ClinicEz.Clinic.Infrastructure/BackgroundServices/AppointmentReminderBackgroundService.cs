using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Features.Appointments.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Workspace;
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
        List<FacilitySettings> activeClinics;

        using (var initialScope = _scopeFactory.CreateScope())
        {
            var db = initialScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            activeClinics = await db.Settings
                .IgnoreQueryFilters()
                .Where(s => !s.IsDeleted && (s.EnableAppointmentReminders || s.EnableStaffAppointmentNotifications))
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
                var workspaceProfiles = clinicScope.ServiceProvider.GetService<IWorkspaceProfileProvider>();

                var remindersSent = await ProcessClinicRemindersAsync(db, dispatcher, clinic, utcNow, ct, workspaceProfiles);
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

    public Task<int> ProcessClinicRemindersAsync(
        ApplicationDbContext db,
        IAppointmentNotificationDispatcher? dispatcher,
        FacilitySettings clinic,
        DateTime utcNow,
        CancellationToken ct = default) =>
        ProcessClinicRemindersAsync(db, dispatcher, clinic, utcNow, ct, null);

    public async Task<int> ProcessClinicRemindersAsync(
        ApplicationDbContext db,
        IAppointmentNotificationDispatcher? dispatcher,
        FacilitySettings clinic,
        DateTime utcNow,
        CancellationToken ct,
        IWorkspaceProfileProvider? workspaceProfiles)
    {
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(clinic);

        if (clinic.IsDeleted || (!clinic.EnableAppointmentReminders && !clinic.EnableStaffAppointmentNotifications))
        {
            return 0;
        }

        var clinicReminders = 0;

        if (clinic.EnableAppointmentReminders)
        {
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
        }

        if (clinic.EnableStaffAppointmentNotifications)
        {
            // 1. Day-of Morning Digest (08:00 - 11:59 clinic local time)
            if (clinic.EnableStaffMorningDigest)
            {
                WorkspaceProfile? workspaceProfile = null;
                if (workspaceProfiles != null && !string.IsNullOrWhiteSpace(clinic.TenantId))
                {
                    try
                    {
                        workspaceProfile = await workspaceProfiles.GetAsync(clinic.TenantId, ct);
                    }
                    catch
                    {
                        workspaceProfile = null;
                    }
                }

                var effectiveTzId = ClinicTimeZoneResolver.ResolveEffectiveTimeZoneId(clinic, workspaceProfile);
                var tz = ClinicTimeZoneResolver.ResolveTimeZone(effectiveTzId);
                var utcNormalized = utcNow.Kind == DateTimeKind.Utc
                    ? utcNow
                    : DateTime.SpecifyKind(utcNow, DateTimeKind.Utc);
                var localNow = TimeZoneInfo.ConvertTimeFromUtc(utcNormalized, tz);
                var localTime = TimeOnly.FromDateTime(localNow);

                if (localTime >= new TimeOnly(8, 0) && localTime < new TimeOnly(12, 0))
                {
                    var localDate = DateOnly.FromDateTime(localNow);
                    var localStartUtc = TimeZoneInfo.ConvertTimeToUtc(
                        DateTime.SpecifyKind(localDate.ToDateTime(TimeOnly.MinValue), DateTimeKind.Unspecified), tz);
                    var localEndUtc = TimeZoneInfo.ConvertTimeToUtc(
                        DateTime.SpecifyKind(localDate.AddDays(1).ToDateTime(TimeOnly.MinValue), DateTimeKind.Unspecified), tz);

                    var todaysAppointments = await db.Appointments
                        .IgnoreQueryFilters()
                        .Where(a => a.ClinicId == clinic.ClinicId &&
                                    !a.IsDeleted &&
                                    a.DoctorId.HasValue &&
                                    a.DoctorId.Value != Guid.Empty &&
                                    a.Status != AppointmentStatus.Cancelled &&
                                    a.Status != AppointmentStatus.NoShow &&
                                    a.ScheduledAt >= localStartUtc &&
                                    a.ScheduledAt < localEndUtc)
                        .AsNoTracking()
                        .ToListAsync(ct);

                    if (todaysAppointments.Count > 0)
                    {
                        var byDoctor = todaysAppointments
                            .GroupBy(a => a.DoctorId!.Value)
                            .ToList();

                        var candidateSourceIds = byDoctor
                            .Select(g => AppointmentNotificationDispatcher.BuildMorningDigestSourceId(clinic.ClinicId, g.Key, localDate))
                            .ToList();

                        var existingSourceIds = await db.StaffNotifications
                            .IgnoreQueryFilters()
                            .Where(n => n.ClinicId == clinic.ClinicId &&
                                        !n.IsDeleted &&
                                        n.SourceType == AppointmentNotificationDispatcher.MorningDigestSourceType &&
                                        n.SourceId != null &&
                                        candidateSourceIds.Contains(n.SourceId))
                            .Select(n => n.SourceId!)
                            .ToListAsync(ct);

                        var existingSet = new HashSet<string>(existingSourceIds, StringComparer.Ordinal);

                        foreach (var doctorGroup in byDoctor)
                        {
                            var sourceId = AppointmentNotificationDispatcher.BuildMorningDigestSourceId(
                                clinic.ClinicId, doctorGroup.Key, localDate);
                            if (existingSet.Contains(sourceId)) continue;

                            var totalCount = doctorGroup.Count();
                            var teleconsultCount = doctorGroup.Count(a => a.IsTeleconsult);
                            var pendingCount = doctorGroup.Count(a => a.Status == AppointmentStatus.Pending);

                            if (dispatcher != null)
                            {
                                await dispatcher.DispatchStaffMorningDigestAsync(
                                    clinic.ClinicId,
                                    clinic.TenantId,
                                    doctorGroup.Key,
                                    localDate,
                                    totalCount,
                                    teleconsultCount,
                                    pendingCount,
                                    ct);
                            }

                            clinicReminders++;
                        }
                    }
                }
            }

            // 2. Pre-Appointment Alert (15 min before ScheduledAt, prioritizing Teleconsults)
            if (clinic.EnableStaffPreSlotReminders)
            {
                var preSlotEnd = utcNow.AddMinutes(15);

                var preSlotCandidates = await db.Appointments
                    .IgnoreQueryFilters()
                    .Where(a => a.ClinicId == clinic.ClinicId &&
                                !a.IsDeleted &&
                                (a.Status == AppointmentStatus.Pending || a.Status == AppointmentStatus.Confirmed) &&
                                a.DoctorId.HasValue &&
                                a.DoctorId.Value != Guid.Empty &&
                                a.StaffPreSlotNotifiedAt == null &&
                                a.ScheduledAt > utcNow &&
                                a.ScheduledAt <= preSlotEnd)
                    .ToListAsync(ct);

                foreach (var appt in preSlotCandidates
                    .OrderByDescending(a => a.IsTeleconsult)
                    .ThenBy(a => a.ScheduledAt))
                {
                    if (dispatcher != null)
                    {
                        await dispatcher.DispatchStaffNotificationAsync(
                            appt, AppointmentNotificationDispatcher.StaffEventPreSlot, ct);
                    }

                    appt.StaffPreSlotNotifiedAt = utcNow;
                    appt.UpdatedAt = utcNow;
                    appt.UpdatedBy = "AppointmentReminderBackgroundService";
                    clinicReminders++;
                }
            }

            // 3. Overdue Escalation (ScheduledAt + 15 min, up to 24h lookback)
            if (clinic.EnableStaffOverdueAlerts)
            {
                var overdueCutoff = utcNow.AddMinutes(-15);
                var overdueLookbackStart = utcNow.AddHours(-24);

                var overdueCandidates = await db.Appointments
                    .IgnoreQueryFilters()
                    .Where(a => a.ClinicId == clinic.ClinicId &&
                                !a.IsDeleted &&
                                (a.Status == AppointmentStatus.Pending || a.Status == AppointmentStatus.Confirmed) &&
                                a.DoctorId.HasValue &&
                                a.DoctorId.Value != Guid.Empty &&
                                a.StaffOverdueNotifiedAt == null &&
                                a.ScheduledAt >= overdueLookbackStart &&
                                a.ScheduledAt <= overdueCutoff)
                    .ToListAsync(ct);

                foreach (var appt in overdueCandidates)
                {
                    if (dispatcher != null)
                    {
                        await dispatcher.DispatchStaffNotificationAsync(
                            appt, AppointmentNotificationDispatcher.StaffEventOverdue, ct);
                    }

                    appt.StaffOverdueNotifiedAt = utcNow;
                    appt.UpdatedAt = utcNow;
                    appt.UpdatedBy = "AppointmentReminderBackgroundService";
                    clinicReminders++;
                }
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
