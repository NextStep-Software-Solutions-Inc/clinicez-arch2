using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Appointments;
using ClinicEz.Clinic.Application.Features.Appointments.Services;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.BackgroundServices;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Appointments;

public sealed class StaffAppointmentNotificationCadenceTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "test-tenant-cadence";
    private readonly IClinicContext _clinicContext;

    public StaffAppointmentNotificationCadenceTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
    }

    private static AppointmentNotificationDispatcher CreateRealDispatcher(
        ApplicationDbContext context,
        Sieve.Services.ISieveProcessor sieve)
    {
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffNotifRepo = TestDbHelper.CreateRepository<StaffNotification>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        return new AppointmentNotificationDispatcher(
            patientRepo,
            settingsRepo,
            staffNotifRepo,
            publisher,
            NullLogger<AppointmentNotificationDispatcher>.Instance);
    }

    [Fact]
    public async Task MorningDigest_At8AmClinicLocalTime_DispatchesOncePerDoctorWithAccurateCounts()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var dispatcher = CreateRealDispatcher(context, sieve);
        var service = new AppointmentReminderBackgroundService(
            Substitute.For<IServiceScopeFactory>(),
            NullLogger<AppointmentReminderBackgroundService>.Instance);

        var doctor1 = Guid.NewGuid();
        var doctor2 = Guid.NewGuid();
        // 00:05 UTC = 08:05 Asia/Manila on 2026-11-20
        var utcNow = new DateTime(2026, 11, 20, 0, 5, 0, DateTimeKind.Utc);

        var clinic = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Manila Clinic",
            TimeZoneId = "Asia/Manila",
            EnableAppointmentReminders = false,
            EnableStaffAppointmentNotifications = true,
            EnableStaffMorningDigest = true,
            EnableStaffPreSlotReminders = false,
            EnableStaffOverdueAlerts = false
        };
        await context.Settings.AddAsync(clinic);

        await context.Appointments.AddRangeAsync(
            new Appointment
            {
                Id = Guid.NewGuid(),
                ClinicId = _clinicId,
                TenantId = _tenantId,
                PatientId = Guid.NewGuid(),
                PatientName = "Patient One",
                DoctorId = doctor1,
                ScheduledAt = new DateTime(2026, 11, 20, 2, 0, 0, DateTimeKind.Utc), // 10:00 Manila
                Status = AppointmentStatus.Pending,
                AppointmentType = AppointmentType.Teleconsult
            },
            new Appointment
            {
                Id = Guid.NewGuid(),
                ClinicId = _clinicId,
                TenantId = _tenantId,
                PatientId = Guid.NewGuid(),
                PatientName = "Patient Two",
                DoctorId = doctor1,
                ScheduledAt = new DateTime(2026, 11, 20, 6, 0, 0, DateTimeKind.Utc), // 14:00 Manila
                Status = AppointmentStatus.Confirmed,
                AppointmentType = AppointmentType.InPerson
            },
            new Appointment
            {
                Id = Guid.NewGuid(),
                ClinicId = _clinicId,
                TenantId = _tenantId,
                PatientId = Guid.NewGuid(),
                PatientName = "Cancelled Excluded",
                DoctorId = doctor1,
                ScheduledAt = new DateTime(2026, 11, 20, 7, 0, 0, DateTimeKind.Utc),
                Status = AppointmentStatus.Cancelled
            },
            new Appointment
            {
                Id = Guid.NewGuid(),
                ClinicId = _clinicId,
                TenantId = _tenantId,
                PatientId = Guid.NewGuid(),
                PatientName = "Doctor2 Patient",
                DoctorId = doctor2,
                ScheduledAt = new DateTime(2026, 11, 20, 3, 0, 0, DateTimeKind.Utc),
                Status = AppointmentStatus.Confirmed
            });
        await context.SaveChangesAsync();

        // First cycle at 08:05 Manila -> creates 2 digests (doctor1 and doctor2)
        var firstCount = await service.ProcessClinicRemindersAsync(context, dispatcher, clinic, utcNow, CancellationToken.None);
        firstCount.Should().Be(2);

        var notifications = await context.StaffNotifications.IgnoreQueryFilters().ToListAsync();
        notifications.Should().HaveCount(2);

        var d1Notif = notifications.Single(n => n.RecipientStaffId == doctor1);
        d1Notif.Urgency.Should().Be(NotificationUrgency.Routine);
        d1Notif.Category.Should().Be(StaffNotificationCategory.Appointment);
        d1Notif.ActionRoute.Should().Be("Appointments");
        d1Notif.ActionParamsJson.Should().Contain("\"date\":\"2026-11-20\"");
        d1Notif.Title.Should().Contain("2 Appointments");
        d1Notif.Body.Should().Contain("1 teleconsult");
        d1Notif.Body.Should().Contain("1 pending confirmation");

        // Second cycle 5 minutes later -> strictly deduplicated
        var secondCount = await service.ProcessClinicRemindersAsync(context, dispatcher, clinic, utcNow.AddMinutes(5), CancellationToken.None);
        secondCount.Should().Be(0);
    }

    [Fact]
    public async Task PreSlotAlert_Within15MinWindow_PrioritizesTeleconsultAndDeduplicates()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var dispatcher = CreateRealDispatcher(context, sieve);
        var service = new AppointmentReminderBackgroundService(
            Substitute.For<IServiceScopeFactory>(),
            NullLogger<AppointmentReminderBackgroundService>.Instance);

        var doctorId = Guid.NewGuid();
        var utcNow = new DateTime(2026, 11, 20, 5, 0, 0, DateTimeKind.Utc); // 13:00 Manila

        var clinic = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Care Clinic",
            TimeZoneId = "Asia/Manila",
            EnableAppointmentReminders = false,
            EnableStaffAppointmentNotifications = true,
            EnableStaffMorningDigest = false,
            EnableStaffPreSlotReminders = true,
            EnableStaffOverdueAlerts = false
        };
        await context.Settings.AddAsync(clinic);

        var teleconsultAppt = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Teleconsult Patient",
            DoctorId = doctorId,
            ScheduledAt = utcNow.AddMinutes(12),
            Status = AppointmentStatus.Pending,
            AppointmentType = AppointmentType.Teleconsult
        };
        var inPersonAppt = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "InPerson Patient",
            DoctorId = doctorId,
            ScheduledAt = utcNow.AddMinutes(10),
            Status = AppointmentStatus.Confirmed,
            AppointmentType = AppointmentType.InPerson
        };
        var checkedInAppt = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Already CheckedIn",
            DoctorId = doctorId,
            ScheduledAt = utcNow.AddMinutes(10),
            Status = AppointmentStatus.CheckedIn
        };
        var farAppt = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Outside 15m Window",
            DoctorId = doctorId,
            ScheduledAt = utcNow.AddMinutes(30),
            Status = AppointmentStatus.Confirmed
        };

        await context.Appointments.AddRangeAsync(teleconsultAppt, inPersonAppt, checkedInAppt, farAppt);
        await context.SaveChangesAsync();

        var sentCount = await service.ProcessClinicRemindersAsync(context, dispatcher, clinic, utcNow, CancellationToken.None);
        sentCount.Should().Be(2);

        var notifications = await context.StaffNotifications.IgnoreQueryFilters().ToListAsync();
        notifications.Should().HaveCount(2);
        notifications.Should().Contain(n => n.SourceId == teleconsultAppt.Id.ToString() && n.Title.Contains("Teleconsult") && n.Urgency == NotificationUrgency.Routine);
        notifications.Should().Contain(n => n.SourceId == inPersonAppt.Id.ToString() && n.Title.Contains("Upcoming Appointment") && n.Urgency == NotificationUrgency.Routine);

        var reloadedTele = await context.Appointments.IgnoreQueryFilters().FirstAsync(a => a.Id == teleconsultAppt.Id);
        reloadedTele.StaffPreSlotNotifiedAt.Should().Be(utcNow);

        // Re-run deduplicates
        var secondRun = await service.ProcessClinicRemindersAsync(context, dispatcher, clinic, utcNow.AddMinutes(1), CancellationToken.None);
        secondRun.Should().Be(0);
    }

    [Fact]
    public async Task OverdueEscalation_Past15Mins_DispatchesUrgentAlertAndDeduplicates()
    {
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var dispatcher = CreateRealDispatcher(context, sieve);
        var service = new AppointmentReminderBackgroundService(
            Substitute.For<IServiceScopeFactory>(),
            NullLogger<AppointmentReminderBackgroundService>.Instance);

        var doctorId = Guid.NewGuid();
        var utcNow = new DateTime(2026, 11, 20, 6, 0, 0, DateTimeKind.Utc); // 14:00 Manila

        var clinic = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Care Clinic",
            TimeZoneId = "Asia/Manila",
            EnableAppointmentReminders = false,
            EnableStaffAppointmentNotifications = true,
            EnableStaffMorningDigest = false,
            EnableStaffPreSlotReminders = false,
            EnableStaffOverdueAlerts = true
        };
        await context.Settings.AddAsync(clinic);

        var overdueConfirmed = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Overdue Patient",
            DoctorId = doctorId,
            ScheduledAt = utcNow.AddMinutes(-20),
            Status = AppointmentStatus.Confirmed
        };
        var only5MinsLate = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Too Early",
            DoctorId = doctorId,
            ScheduledAt = utcNow.AddMinutes(-5),
            Status = AppointmentStatus.Pending
        };
        var noShowAlreadyResolved = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "NoShow Patient",
            DoctorId = doctorId,
            ScheduledAt = utcNow.AddMinutes(-30),
            Status = AppointmentStatus.NoShow
        };

        await context.Appointments.AddRangeAsync(overdueConfirmed, only5MinsLate, noShowAlreadyResolved);
        await context.SaveChangesAsync();

        var sentCount = await service.ProcessClinicRemindersAsync(context, dispatcher, clinic, utcNow, CancellationToken.None);
        sentCount.Should().Be(1);

        var notifications = await context.StaffNotifications.IgnoreQueryFilters().ToListAsync();
        notifications.Should().HaveCount(1);
        notifications[0].Urgency.Should().Be(NotificationUrgency.Urgent);
        notifications[0].Title.Should().Contain("Overdue Appointment: Overdue Patient");
        notifications[0].ActionRoute.Should().Be("Appointments");
        notifications[0].ActionParamsJson.Should().Contain(overdueConfirmed.Id.ToString());

        var reloaded = await context.Appointments.IgnoreQueryFilters().FirstAsync(a => a.Id == overdueConfirmed.Id);
        reloaded.StaffOverdueNotifiedAt.Should().Be(utcNow);

        // Second cycle deduplicates
        var secondRun = await service.ProcessClinicRemindersAsync(context, dispatcher, clinic, utcNow.AddMinutes(2), CancellationToken.None);
        secondRun.Should().Be(0);
    }

    [Fact]
    public async Task RescheduleAppointment_ResetsStaffNotificationDeduplicationFlags()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Rescheduled Patient",
            DoctorId = Guid.NewGuid(),
            ScheduledAt = DateTime.UtcNow.AddDays(-1),
            Status = AppointmentStatus.Confirmed,
            StaffPreSlotNotifiedAt = DateTime.UtcNow.AddDays(-1).AddMinutes(-15),
            StaffOverdueNotifiedAt = DateTime.UtcNow.AddDays(-1).AddMinutes(15)
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new RescheduleAppointmentCommandHandler(repo, uow, dispatcher);
        var result = await handler.Handle(
            new RescheduleAppointmentCommand(appointment.Id, DateTime.UtcNow.AddDays(2), 30, "Moved to future"),
            CancellationToken.None);

        result.StaffPreSlotNotifiedAt.Should().BeNull();
        result.StaffOverdueNotifiedAt.Should().BeNull();

        var reloaded = await repo.GetByIdAsync(appointment.Id);
        reloaded!.StaffPreSlotNotifiedAt.Should().BeNull();
        reloaded.StaffOverdueNotifiedAt.Should().BeNull();
    }

    [Fact]
    public async Task UpdateClinicSettingsCommand_PersistsGranularStaffNotificationToggles()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Toggle Clinic"
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var handler = new UpdateClinicSettingsCommandHandler(settingsRepo, _clinicContext, uow);
        var updated = await handler.Handle(
            new UpdateClinicSettingsCommand(
                EnableStaffMorningDigest: false,
                EnableStaffPreSlotReminders: true,
                EnableStaffOverdueAlerts: false),
            CancellationToken.None);

        updated.EnableStaffMorningDigest.Should().BeFalse();
        updated.EnableStaffPreSlotReminders.Should().BeTrue();
        updated.EnableStaffOverdueAlerts.Should().BeFalse();

        var persisted = await settingsRepo.GetByIdAsync(settings.Id);
        persisted!.EnableStaffMorningDigest.Should().BeFalse();
        persisted.EnableStaffPreSlotReminders.Should().BeTrue();
        persisted.EnableStaffOverdueAlerts.Should().BeFalse();
    }

    [Fact]
    public async Task RunReminderCycleAsync_IncludesClinicsWithOnlyStaffNotificationsEnabled()
    {
        var dbName = $"ClinicEz_StaffOnlyCycle_{Guid.NewGuid()}";
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "public") })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;

        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();
        var services = new ServiceCollection();
        services.AddScoped(_ => new ApplicationDbContext(options, config, _clinicContext));
        services.AddScoped(_ => dispatcher);

        var provider = services.BuildServiceProvider();
        var scopeFactory = provider.GetRequiredService<IServiceScopeFactory>();
        var utcNow = new DateTime(2026, 11, 20, 6, 0, 0, DateTimeKind.Utc);
        var doctorId = Guid.NewGuid();

        using (var seedScope = scopeFactory.CreateScope())
        {
            var db = seedScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await db.Settings.AddAsync(new FacilitySettings
            {
                Id = Guid.NewGuid(),
                ClinicId = _clinicId,
                TenantId = _tenantId,
                ClinicName = "Staff-Only Alerts Clinic",
                EnableAppointmentReminders = false, // Patient reminders OFF
                EnableStaffAppointmentNotifications = true, // Staff notifications ON
                EnableStaffMorningDigest = false,
                EnableStaffPreSlotReminders = true,
                EnableStaffOverdueAlerts = true
            });
            await db.Appointments.AddAsync(new Appointment
            {
                Id = Guid.NewGuid(),
                ClinicId = _clinicId,
                TenantId = _tenantId,
                PatientId = Guid.NewGuid(),
                PatientName = "Upcoming Slot",
                DoctorId = doctorId,
                ScheduledAt = utcNow.AddMinutes(10),
                Status = AppointmentStatus.Confirmed
            });
            await db.SaveChangesAsync();
        }

        var bg = new AppointmentReminderBackgroundService(
            scopeFactory, NullLogger<AppointmentReminderBackgroundService>.Instance);

        var count = await bg.RunReminderCycleAsync(utcNow, CancellationToken.None);
        count.Should().Be(1);

        await dispatcher.Received(1).DispatchStaffNotificationAsync(
            Arg.Is<Appointment>(a => a.PatientName == "Upcoming Slot"),
            AppointmentNotificationDispatcher.StaffEventPreSlot,
            Arg.Any<CancellationToken>());
    }
}
