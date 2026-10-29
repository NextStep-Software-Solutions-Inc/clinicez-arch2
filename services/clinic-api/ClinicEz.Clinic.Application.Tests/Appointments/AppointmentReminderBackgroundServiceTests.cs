using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Appointments.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.BackgroundServices;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Appointments;

public sealed class AppointmentReminderBackgroundServiceTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "test-tenant-bg";
    private readonly IClinicContext _clinicContext;

    public AppointmentReminderBackgroundServiceTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
    }

    [Fact]
    public async Task ProcessClinicRemindersAsync_WhenAppointmentIn24hWindow_Dispatches24hAlertAndUpdatesFlags()
    {
        // Arrange
        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();
        var logger = NullLogger<AppointmentReminderBackgroundService>.Instance;
        var service = new AppointmentReminderBackgroundService(Substitute.For<IServiceScopeFactory>(), logger);

        var utcNow = new DateTime(2026, 10, 20, 10, 0, 0, DateTimeKind.Utc);

        var clinic = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Manila Health Center",
            EnableAppointmentReminders = true,
            AppointmentReminder24hEnabled = true,
            AppointmentReminder2hEnabled = true
        };

        var appt24h = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Dela Cruz",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose",
            ScheduledAt = utcNow.AddHours(24),
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            Reminder24hSent = false,
            Reminder2hSent = false
        };

        await context.Settings.AddAsync(clinic);
        await context.Appointments.AddAsync(appt24h);
        await context.SaveChangesAsync();

        // Act
        var count = await service.ProcessClinicRemindersAsync(context, dispatcher, clinic, utcNow, CancellationToken.None);

        // Assert
        count.Should().Be(1);

        await dispatcher.Received(1).DispatchAlertAsync(
            Arg.Is<Appointment>(a => a.Id == appt24h.Id),
            AppointmentAlertKinds.Reminder24h,
            Arg.Any<CancellationToken>());

        var reloaded = await context.Appointments.IgnoreQueryFilters().FirstAsync(a => a.Id == appt24h.Id);
        reloaded.Reminder24hSent.Should().BeTrue();
        reloaded.Reminder24hSentAt.Should().Be(utcNow);
        reloaded.LastReminderSentAt.Should().Be(utcNow);
        reloaded.LastReminderType.Should().Be("24h");
        reloaded.Reminder2hSent.Should().BeFalse();
    }

    [Fact]
    public async Task ProcessClinicRemindersAsync_WhenAppointmentIn2hWindow_Dispatches2hAlertAndUpdatesFlags()
    {
        // Arrange
        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();
        var logger = NullLogger<AppointmentReminderBackgroundService>.Instance;
        var service = new AppointmentReminderBackgroundService(Substitute.For<IServiceScopeFactory>(), logger);

        var utcNow = new DateTime(2026, 10, 20, 10, 0, 0, DateTimeKind.Utc);

        var clinic = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Manila Health Center",
            EnableAppointmentReminders = true,
            AppointmentReminder24hEnabled = true,
            AppointmentReminder2hEnabled = true
        };

        var appt2h = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Melchora Aquino",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose",
            ScheduledAt = utcNow.AddHours(2),
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            Reminder24hSent = true,
            Reminder24hSentAt = utcNow.AddHours(-22),
            Reminder2hSent = false
        };

        await context.Settings.AddAsync(clinic);
        await context.Appointments.AddAsync(appt2h);
        await context.SaveChangesAsync();

        // Act
        var count = await service.ProcessClinicRemindersAsync(context, dispatcher, clinic, utcNow, CancellationToken.None);

        // Assert
        count.Should().Be(1);

        await dispatcher.Received(1).DispatchAlertAsync(
            Arg.Is<Appointment>(a => a.Id == appt2h.Id),
            AppointmentAlertKinds.Reminder2h,
            Arg.Any<CancellationToken>());

        var reloaded = await context.Appointments.IgnoreQueryFilters().FirstAsync(a => a.Id == appt2h.Id);
        reloaded.Reminder2hSent.Should().BeTrue();
        reloaded.Reminder2hSentAt.Should().Be(utcNow);
        reloaded.LastReminderSentAt.Should().Be(utcNow);
        reloaded.LastReminderType.Should().Be("2h");
    }

    [Fact]
    public async Task ProcessClinicRemindersAsync_WhenRemindersAlreadySent_SkipsIdempotently()
    {
        // Arrange
        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();
        var logger = NullLogger<AppointmentReminderBackgroundService>.Instance;
        var service = new AppointmentReminderBackgroundService(Substitute.For<IServiceScopeFactory>(), logger);

        var utcNow = new DateTime(2026, 10, 20, 10, 0, 0, DateTimeKind.Utc);

        var clinic = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Manila Health Center",
            EnableAppointmentReminders = true,
            AppointmentReminder24hEnabled = true,
            AppointmentReminder2hEnabled = true
        };

        var appt24h = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient 1",
            ScheduledAt = utcNow.AddHours(24),
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            Reminder24hSent = true,
            Reminder24hSentAt = utcNow.AddMinutes(-30)
        };

        var appt2h = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient 2",
            ScheduledAt = utcNow.AddHours(2),
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            Reminder2hSent = true,
            Reminder2hSentAt = utcNow.AddMinutes(-10)
        };

        await context.Settings.AddAsync(clinic);
        await context.Appointments.AddRangeAsync(appt24h, appt2h);
        await context.SaveChangesAsync();

        // Act
        var count = await service.ProcessClinicRemindersAsync(context, dispatcher, clinic, utcNow, CancellationToken.None);

        // Assert
        count.Should().Be(0);
        await dispatcher.DidNotReceive().DispatchAlertAsync(
            Arg.Any<Appointment>(), Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ProcessClinicRemindersAsync_WhenClinicRemindersDisabled_SkipsClinicCompletely()
    {
        // Arrange
        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();
        var logger = NullLogger<AppointmentReminderBackgroundService>.Instance;
        var service = new AppointmentReminderBackgroundService(Substitute.For<IServiceScopeFactory>(), logger);

        var utcNow = new DateTime(2026, 10, 20, 10, 0, 0, DateTimeKind.Utc);

        var clinic = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Disabled Clinic",
            EnableAppointmentReminders = false,
            AppointmentReminder24hEnabled = true,
            AppointmentReminder2hEnabled = true
        };

        var appt = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient 1",
            ScheduledAt = utcNow.AddHours(24),
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            Reminder24hSent = false
        };

        await context.Settings.AddAsync(clinic);
        await context.Appointments.AddAsync(appt);
        await context.SaveChangesAsync();

        // Act
        var count = await service.ProcessClinicRemindersAsync(context, dispatcher, clinic, utcNow, CancellationToken.None);

        // Assert
        count.Should().Be(0);
        await dispatcher.DidNotReceive().DispatchAlertAsync(
            Arg.Any<Appointment>(), Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ProcessClinicRemindersAsync_When24hDisabledBut2hEnabled_OnlyDispatches2h()
    {
        // Arrange
        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();
        var logger = NullLogger<AppointmentReminderBackgroundService>.Instance;
        var service = new AppointmentReminderBackgroundService(Substitute.For<IServiceScopeFactory>(), logger);

        var utcNow = new DateTime(2026, 10, 20, 10, 0, 0, DateTimeKind.Utc);

        var clinic = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Clinic 2h Only",
            EnableAppointmentReminders = true,
            AppointmentReminder24hEnabled = false,
            AppointmentReminder2hEnabled = true
        };

        var appt24h = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient 24h",
            ScheduledAt = utcNow.AddHours(24),
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            Reminder24hSent = false
        };

        var appt2h = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient 2h",
            ScheduledAt = utcNow.AddHours(2),
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            Reminder2hSent = false
        };

        await context.Settings.AddAsync(clinic);
        await context.Appointments.AddRangeAsync(appt24h, appt2h);
        await context.SaveChangesAsync();

        // Act
        var count = await service.ProcessClinicRemindersAsync(context, dispatcher, clinic, utcNow, CancellationToken.None);

        // Assert
        count.Should().Be(1);

        await dispatcher.DidNotReceive().DispatchAlertAsync(
            Arg.Is<Appointment>(a => a.Id == appt24h.Id),
            AppointmentAlertKinds.Reminder24h,
            Arg.Any<CancellationToken>());

        await dispatcher.Received(1).DispatchAlertAsync(
            Arg.Is<Appointment>(a => a.Id == appt2h.Id),
            AppointmentAlertKinds.Reminder2h,
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ProcessClinicRemindersAsync_When2hDisabledBut24hEnabled_OnlyDispatches24h()
    {
        // Arrange
        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();
        var logger = NullLogger<AppointmentReminderBackgroundService>.Instance;
        var service = new AppointmentReminderBackgroundService(Substitute.For<IServiceScopeFactory>(), logger);

        var utcNow = new DateTime(2026, 10, 20, 10, 0, 0, DateTimeKind.Utc);

        var clinic = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Clinic 24h Only",
            EnableAppointmentReminders = true,
            AppointmentReminder24hEnabled = true,
            AppointmentReminder2hEnabled = false
        };

        var appt24h = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient 24h",
            ScheduledAt = utcNow.AddHours(24),
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            Reminder24hSent = false
        };

        var appt2h = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient 2h",
            ScheduledAt = utcNow.AddHours(2),
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            Reminder2hSent = false
        };

        await context.Settings.AddAsync(clinic);
        await context.Appointments.AddRangeAsync(appt24h, appt2h);
        await context.SaveChangesAsync();

        // Act
        var count = await service.ProcessClinicRemindersAsync(context, dispatcher, clinic, utcNow, CancellationToken.None);

        // Assert
        count.Should().Be(1);

        await dispatcher.Received(1).DispatchAlertAsync(
            Arg.Is<Appointment>(a => a.Id == appt24h.Id),
            AppointmentAlertKinds.Reminder24h,
            Arg.Any<CancellationToken>());

        await dispatcher.DidNotReceive().DispatchAlertAsync(
            Arg.Is<Appointment>(a => a.Id == appt2h.Id),
            AppointmentAlertKinds.Reminder2h,
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ProcessClinicRemindersAsync_WhenAppointmentCancelledOrNotConfirmed_DoesNotDispatch()
    {
        // Arrange
        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();
        var logger = NullLogger<AppointmentReminderBackgroundService>.Instance;
        var service = new AppointmentReminderBackgroundService(Substitute.For<IServiceScopeFactory>(), logger);

        var utcNow = new DateTime(2026, 10, 20, 10, 0, 0, DateTimeKind.Utc);

        var clinic = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Manila Health Center",
            EnableAppointmentReminders = true,
            AppointmentReminder24hEnabled = true,
            AppointmentReminder2hEnabled = true
        };

        var cancelled = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Cancelled Patient",
            ScheduledAt = utcNow.AddHours(24),
            DurationMinutes = 30,
            Status = AppointmentStatus.Cancelled,
            Reminder24hSent = false
        };

        var completed = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Completed Patient",
            ScheduledAt = utcNow.AddHours(2),
            DurationMinutes = 30,
            Status = AppointmentStatus.Completed,
            Reminder2hSent = false
        };

        await context.Settings.AddAsync(clinic);
        await context.Appointments.AddRangeAsync(cancelled, completed);
        await context.SaveChangesAsync();

        // Act
        var count = await service.ProcessClinicRemindersAsync(context, dispatcher, clinic, utcNow, CancellationToken.None);

        // Assert
        count.Should().Be(0);
        await dispatcher.DidNotReceive().DispatchAlertAsync(
            Arg.Any<Appointment>(), Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ProcessClinicRemindersAsync_WhenAppointmentOutsideWindows_DoesNotDispatch()
    {
        // Arrange
        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();
        var logger = NullLogger<AppointmentReminderBackgroundService>.Instance;
        var service = new AppointmentReminderBackgroundService(Substitute.For<IServiceScopeFactory>(), logger);

        var utcNow = new DateTime(2026, 10, 20, 10, 0, 0, DateTimeKind.Utc);

        var clinic = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Manila Health Center",
            EnableAppointmentReminders = true,
            AppointmentReminder24hEnabled = true,
            AppointmentReminder2hEnabled = true
        };

        // Scheduled at 12 hours out (between 2.5h and 23h)
        var appt12h = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "12h Patient",
            ScheduledAt = utcNow.AddHours(12),
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            Reminder24hSent = false,
            Reminder2hSent = false
        };

        // Scheduled at 48 hours out (past 25h)
        var appt48h = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "48h Patient",
            ScheduledAt = utcNow.AddHours(48),
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            Reminder24hSent = false,
            Reminder2hSent = false
        };

        await context.Settings.AddAsync(clinic);
        await context.Appointments.AddRangeAsync(appt12h, appt48h);
        await context.SaveChangesAsync();

        // Act
        var count = await service.ProcessClinicRemindersAsync(context, dispatcher, clinic, utcNow, CancellationToken.None);

        // Assert
        count.Should().Be(0);
        await dispatcher.DidNotReceive().DispatchAlertAsync(
            Arg.Any<Appointment>(), Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task RunReminderCycleAsync_EndToEndScopeExecution_ScansActiveClinicsAndDispatches()
    {
        // Arrange
        var dbName = $"ClinicEz_ReminderCycleTest_{Guid.NewGuid()}";
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

        var serviceProvider = services.BuildServiceProvider();
        var scopeFactory = serviceProvider.GetRequiredService<IServiceScopeFactory>();

        var utcNow = new DateTime(2026, 10, 20, 10, 0, 0, DateTimeKind.Utc);

        // Seed data using a fresh scope
        using (var seedScope = scopeFactory.CreateScope())
        {
            var db = seedScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var clinicA = new FacilitySettings
            {
                Id = Guid.NewGuid(),
                ClinicId = _clinicId,
                TenantId = _tenantId,
                ClinicName = "Active Clinic A",
                EnableAppointmentReminders = true,
                AppointmentReminder24hEnabled = true,
                AppointmentReminder2hEnabled = true
            };

            var otherClinicId = Guid.NewGuid();
            var clinicB = new FacilitySettings
            {
                Id = Guid.NewGuid(),
                ClinicId = otherClinicId,
                TenantId = "tenant-b",
                ClinicName = "Disabled Clinic B",
                EnableAppointmentReminders = false,
                AppointmentReminder24hEnabled = true,
                AppointmentReminder2hEnabled = true
            };

            var apptA = new Appointment
            {
                Id = Guid.NewGuid(),
                ClinicId = _clinicId,
                TenantId = _tenantId,
                PatientId = Guid.NewGuid(),
                PatientName = "Patient A",
                ScheduledAt = utcNow.AddHours(24),
                DurationMinutes = 30,
                Status = AppointmentStatus.Confirmed,
                Reminder24hSent = false
            };

            var apptB = new Appointment
            {
                Id = Guid.NewGuid(),
                ClinicId = otherClinicId,
                TenantId = "tenant-b",
                PatientId = Guid.NewGuid(),
                PatientName = "Patient B",
                ScheduledAt = utcNow.AddHours(24),
                DurationMinutes = 30,
                Status = AppointmentStatus.Confirmed,
                Reminder24hSent = false
            };

            await db.Settings.AddRangeAsync(clinicA, clinicB);
            await db.Appointments.AddRangeAsync(apptA, apptB);
            await db.SaveChangesAsync();
        }

        var logger = NullLogger<AppointmentReminderBackgroundService>.Instance;
        var service = new AppointmentReminderBackgroundService(scopeFactory, logger);

        // Act
        var totalSent = await service.RunReminderCycleAsync(utcNow, CancellationToken.None);

        // Assert
        totalSent.Should().Be(1);

        await dispatcher.Received(1).DispatchAlertAsync(
            Arg.Is<Appointment>(a => a.PatientName == "Patient A"),
            AppointmentAlertKinds.Reminder24h,
            Arg.Any<CancellationToken>());

        await dispatcher.DidNotReceive().DispatchAlertAsync(
            Arg.Is<Appointment>(a => a.PatientName == "Patient B"),
            Arg.Any<string>(),
            Arg.Any<CancellationToken>());

        // Verify DB update persisted
        using (var verifyScope = scopeFactory.CreateScope())
        {
            var db = verifyScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var reloadedA = await db.Appointments.IgnoreQueryFilters().FirstAsync(a => a.PatientName == "Patient A");
            reloadedA.Reminder24hSent.Should().BeTrue();
            reloadedA.Reminder24hSentAt.Should().Be(utcNow);
            reloadedA.LastReminderSentAt.Should().Be(utcNow);
            reloadedA.LastReminderType.Should().Be("24h");
        }
    }
}
