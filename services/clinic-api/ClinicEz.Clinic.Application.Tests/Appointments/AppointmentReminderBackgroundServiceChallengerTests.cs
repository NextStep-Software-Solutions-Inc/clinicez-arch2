using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Appointments.Services;
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

/// <summary>
/// Empirical Challenger Verification Suite for Milestone 4:
/// Stress-tests AppointmentReminderBackgroundService across various time windows,
/// boundary values, clinic settings permutations, status filters, atomic persistence,
/// idempotency, time progression, and error isolation.
/// </summary>
public sealed class AppointmentReminderBackgroundServiceChallengerTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-challenger-m4";
    private readonly IClinicContext _clinicContext;

    public AppointmentReminderBackgroundServiceChallengerTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
    }

    [Fact]
    public async Task MultiClinic_SettingsCombinationsMatrix_CorrectlyFiltersAndDispatches()
    {
        // Arrange: 5 clinics with distinct settings combinations in a single DB
        var dbName = $"ClinicEz_MultiClinicMatrix_{Guid.NewGuid()}";
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

        var clinic1Id = Guid.NewGuid(); // Master disabled
        var clinic2Id = Guid.NewGuid(); // 24h disabled, 2h enabled
        var clinic3Id = Guid.NewGuid(); // 24h enabled, 2h disabled
        var clinic4Id = Guid.NewGuid(); // All enabled
        var clinic5Id = Guid.NewGuid(); // Deleted clinic

        using (var seedScope = scopeFactory.CreateScope())
        {
            var db = seedScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var c1 = new FacilitySettings
            {
                Id = Guid.NewGuid(),
                ClinicId = clinic1Id,
                TenantId = "tenant-c1",
                ClinicName = "Clinic 1 - Master Disabled",
                EnableAppointmentReminders = false,
                AppointmentReminder24hEnabled = true,
                AppointmentReminder2hEnabled = true
            };

            var c2 = new FacilitySettings
            {
                Id = Guid.NewGuid(),
                ClinicId = clinic2Id,
                TenantId = "tenant-c2",
                ClinicName = "Clinic 2 - 2h Only",
                EnableAppointmentReminders = true,
                AppointmentReminder24hEnabled = false,
                AppointmentReminder2hEnabled = true
            };

            var c3 = new FacilitySettings
            {
                Id = Guid.NewGuid(),
                ClinicId = clinic3Id,
                TenantId = "tenant-c3",
                ClinicName = "Clinic 3 - 24h Only",
                EnableAppointmentReminders = true,
                AppointmentReminder24hEnabled = true,
                AppointmentReminder2hEnabled = false
            };

            var c4 = new FacilitySettings
            {
                Id = Guid.NewGuid(),
                ClinicId = clinic4Id,
                TenantId = "tenant-c4",
                ClinicName = "Clinic 4 - All Enabled",
                EnableAppointmentReminders = true,
                AppointmentReminder24hEnabled = true,
                AppointmentReminder2hEnabled = true
            };

            var c5 = new FacilitySettings
            {
                Id = Guid.NewGuid(),
                ClinicId = clinic5Id,
                TenantId = "tenant-c5",
                ClinicName = "Clinic 5 - Deleted",
                EnableAppointmentReminders = true,
                AppointmentReminder24hEnabled = true,
                AppointmentReminder2hEnabled = true,
                IsDeleted = true
            };

            await db.Settings.AddRangeAsync(c1, c2, c3, c4, c5);

            // Seed two appointments (24h and 2h) for each clinic
            var appointments = new List<Appointment>();
            foreach (var (cid, tid) in new[] { (clinic1Id, "tenant-c1"), (clinic2Id, "tenant-c2"), (clinic3Id, "tenant-c3"), (clinic4Id, "tenant-c4"), (clinic5Id, "tenant-c5") })
            {
                appointments.Add(new Appointment
                {
                    Id = Guid.NewGuid(),
                    ClinicId = cid,
                    TenantId = tid,
                    PatientId = Guid.NewGuid(),
                    PatientName = $"Patient 24h {tid}",
                    ScheduledAt = utcNow.AddHours(24),
                    DurationMinutes = 30,
                    Status = AppointmentStatus.Confirmed,
                    Reminder24hSent = false,
                    Reminder2hSent = false
                });

                appointments.Add(new Appointment
                {
                    Id = Guid.NewGuid(),
                    ClinicId = cid,
                    TenantId = tid,
                    PatientId = Guid.NewGuid(),
                    PatientName = $"Patient 2h {tid}",
                    ScheduledAt = utcNow.AddHours(2),
                    DurationMinutes = 30,
                    Status = AppointmentStatus.Confirmed,
                    Reminder24hSent = false,
                    Reminder2hSent = false
                });
            }

            await db.Appointments.AddRangeAsync(appointments);
            await db.SaveChangesAsync();
        }

        var logger = NullLogger<AppointmentReminderBackgroundService>.Instance;
        var service = new AppointmentReminderBackgroundService(scopeFactory, logger);

        // Act
        var totalDispatched = await service.RunReminderCycleAsync(utcNow, CancellationToken.None);

        // Assert:
        // Clinic 1: 0 (master disabled)
        // Clinic 2: 1 (only 2h)
        // Clinic 3: 1 (only 24h)
        // Clinic 4: 2 (both 24h and 2h)
        // Clinic 5: 0 (deleted)
        // Total expected = 4
        totalDispatched.Should().Be(4);

        // Verify Clinic 1 appointments untouched
        using (var verifyScope = scopeFactory.CreateScope())
        {
            var db = verifyScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var c1Appts = await db.Appointments.IgnoreQueryFilters().Where(a => a.ClinicId == clinic1Id).ToListAsync();
            c1Appts.Should().AllSatisfy(a =>
            {
                a.Reminder24hSent.Should().BeFalse();
                a.Reminder2hSent.Should().BeFalse();
                a.LastReminderSentAt.Should().BeNull();
            });

            // Clinic 2: 24h appt untouched, 2h appt sent
            var c2_24h = await db.Appointments.IgnoreQueryFilters().FirstAsync(a => a.ClinicId == clinic2Id && a.ScheduledAt == utcNow.AddHours(24));
            var c2_2h = await db.Appointments.IgnoreQueryFilters().FirstAsync(a => a.ClinicId == clinic2Id && a.ScheduledAt == utcNow.AddHours(2));
            c2_24h.Reminder24hSent.Should().BeFalse();
            c2_2h.Reminder2hSent.Should().BeTrue();
            c2_2h.LastReminderType.Should().Be("2h");

            // Clinic 3: 24h appt sent, 2h appt untouched
            var c3_24h = await db.Appointments.IgnoreQueryFilters().FirstAsync(a => a.ClinicId == clinic3Id && a.ScheduledAt == utcNow.AddHours(24));
            var c3_2h = await db.Appointments.IgnoreQueryFilters().FirstAsync(a => a.ClinicId == clinic3Id && a.ScheduledAt == utcNow.AddHours(2));
            c3_24h.Reminder24hSent.Should().BeTrue();
            c3_24h.LastReminderType.Should().Be("24h");
            c3_2h.Reminder2hSent.Should().BeFalse();

            // Clinic 4: both sent
            var c4_24h = await db.Appointments.IgnoreQueryFilters().FirstAsync(a => a.ClinicId == clinic4Id && a.ScheduledAt == utcNow.AddHours(24));
            var c4_2h = await db.Appointments.IgnoreQueryFilters().FirstAsync(a => a.ClinicId == clinic4Id && a.ScheduledAt == utcNow.AddHours(2));
            c4_24h.Reminder24hSent.Should().BeTrue();
            c4_24h.LastReminderType.Should().Be("24h");
            c4_2h.Reminder2hSent.Should().BeTrue();
            c4_2h.LastReminderType.Should().Be("2h");

            // Clinic 5: deleted, untouched
            var c5Appts = await db.Appointments.IgnoreQueryFilters().Where(a => a.ClinicId == clinic5Id).ToListAsync();
            c5Appts.Should().AllSatisfy(a =>
            {
                a.Reminder24hSent.Should().BeFalse();
                a.Reminder2hSent.Should().BeFalse();
            });
        }
    }

    [Fact]
    public async Task BoundaryTesting_24HourWindow_DispatchesInsideBoundsAndExcludesOutside()
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
            ClinicName = "Boundary Clinic 24h",
            EnableAppointmentReminders = true,
            AppointmentReminder24hEnabled = true,
            AppointmentReminder2hEnabled = false
        };

        // Window is [now + 23h, now + 25h]
        var appt22h = CreateAppointment("Appt 22h (Outside lower)", utcNow.AddHours(22));
        var appt23h = CreateAppointment("Appt 23h (Exact lower bound)", utcNow.AddHours(23));
        var appt24h = CreateAppointment("Appt 24h (Midpoint)", utcNow.AddHours(24));
        var appt25h = CreateAppointment("Appt 25h (Exact upper bound)", utcNow.AddHours(25));
        var appt26h = CreateAppointment("Appt 26h (Outside upper)", utcNow.AddHours(26));

        await context.Settings.AddAsync(clinic);
        await context.Appointments.AddRangeAsync(appt22h, appt23h, appt24h, appt25h, appt26h);
        await context.SaveChangesAsync();

        // Act
        var dispatched = await service.ProcessClinicRemindersAsync(context, dispatcher, clinic, utcNow, CancellationToken.None);

        // Assert
        dispatched.Should().Be(3);

        await dispatcher.DidNotReceive().DispatchAlertAsync(Arg.Is<Appointment>(a => a.Id == appt22h.Id), Arg.Any<string>(), Arg.Any<CancellationToken>());
        await dispatcher.Received(1).DispatchAlertAsync(Arg.Is<Appointment>(a => a.Id == appt23h.Id), AppointmentAlertKinds.Reminder24h, Arg.Any<CancellationToken>());
        await dispatcher.Received(1).DispatchAlertAsync(Arg.Is<Appointment>(a => a.Id == appt24h.Id), AppointmentAlertKinds.Reminder24h, Arg.Any<CancellationToken>());
        await dispatcher.Received(1).DispatchAlertAsync(Arg.Is<Appointment>(a => a.Id == appt25h.Id), AppointmentAlertKinds.Reminder24h, Arg.Any<CancellationToken>());
        await dispatcher.DidNotReceive().DispatchAlertAsync(Arg.Is<Appointment>(a => a.Id == appt26h.Id), Arg.Any<string>(), Arg.Any<CancellationToken>());

        var reloaded22h = await context.Appointments.IgnoreQueryFilters().FirstAsync(a => a.Id == appt22h.Id);
        reloaded22h.Reminder24hSent.Should().BeFalse();

        var reloaded23h = await context.Appointments.IgnoreQueryFilters().FirstAsync(a => a.Id == appt23h.Id);
        reloaded23h.Reminder24hSent.Should().BeTrue();
        reloaded23h.Reminder24hSentAt.Should().Be(utcNow);
        reloaded23h.LastReminderType.Should().Be("24h");

        var reloaded24h = await context.Appointments.IgnoreQueryFilters().FirstAsync(a => a.Id == appt24h.Id);
        reloaded24h.Reminder24hSent.Should().BeTrue();

        var reloaded25h = await context.Appointments.IgnoreQueryFilters().FirstAsync(a => a.Id == appt25h.Id);
        reloaded25h.Reminder24hSent.Should().BeTrue();

        var reloaded26h = await context.Appointments.IgnoreQueryFilters().FirstAsync(a => a.Id == appt26h.Id);
        reloaded26h.Reminder24hSent.Should().BeFalse();
    }

    [Fact]
    public async Task BoundaryTesting_2HourWindow_DispatchesInsideBoundsAndExcludesOutside()
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
            ClinicName = "Boundary Clinic 2h",
            EnableAppointmentReminders = true,
            AppointmentReminder24hEnabled = false,
            AppointmentReminder2hEnabled = true
        };

        // Window is [now + 1h, now + 2.5h]
        var appt30m = CreateAppointment("Appt 30m (Outside lower)", utcNow.AddMinutes(30));
        var appt1h = CreateAppointment("Appt 1h (Exact lower bound)", utcNow.AddHours(1));
        var appt2h = CreateAppointment("Appt 2h (Midpoint)", utcNow.AddHours(2));
        var appt2_5h = CreateAppointment("Appt 2.5h (Exact upper bound)", utcNow.AddHours(2.5));
        var appt3h = CreateAppointment("Appt 3h (Outside upper)", utcNow.AddHours(3));

        await context.Settings.AddAsync(clinic);
        await context.Appointments.AddRangeAsync(appt30m, appt1h, appt2h, appt2_5h, appt3h);
        await context.SaveChangesAsync();

        // Act
        var dispatched = await service.ProcessClinicRemindersAsync(context, dispatcher, clinic, utcNow, CancellationToken.None);

        // Assert
        dispatched.Should().Be(3);

        await dispatcher.DidNotReceive().DispatchAlertAsync(Arg.Is<Appointment>(a => a.Id == appt30m.Id), Arg.Any<string>(), Arg.Any<CancellationToken>());
        await dispatcher.Received(1).DispatchAlertAsync(Arg.Is<Appointment>(a => a.Id == appt1h.Id), AppointmentAlertKinds.Reminder2h, Arg.Any<CancellationToken>());
        await dispatcher.Received(1).DispatchAlertAsync(Arg.Is<Appointment>(a => a.Id == appt2h.Id), AppointmentAlertKinds.Reminder2h, Arg.Any<CancellationToken>());
        await dispatcher.Received(1).DispatchAlertAsync(Arg.Is<Appointment>(a => a.Id == appt2_5h.Id), AppointmentAlertKinds.Reminder2h, Arg.Any<CancellationToken>());
        await dispatcher.DidNotReceive().DispatchAlertAsync(Arg.Is<Appointment>(a => a.Id == appt3h.Id), Arg.Any<string>(), Arg.Any<CancellationToken>());

        var reloaded30m = await context.Appointments.IgnoreQueryFilters().FirstAsync(a => a.Id == appt30m.Id);
        reloaded30m.Reminder2hSent.Should().BeFalse();

        var reloaded1h = await context.Appointments.IgnoreQueryFilters().FirstAsync(a => a.Id == appt1h.Id);
        reloaded1h.Reminder2hSent.Should().BeTrue();
        reloaded1h.Reminder2hSentAt.Should().Be(utcNow);
        reloaded1h.LastReminderType.Should().Be("2h");

        var reloaded2h = await context.Appointments.IgnoreQueryFilters().FirstAsync(a => a.Id == appt2h.Id);
        reloaded2h.Reminder2hSent.Should().BeTrue();

        var reloaded2_5h = await context.Appointments.IgnoreQueryFilters().FirstAsync(a => a.Id == appt2_5h.Id);
        reloaded2_5h.Reminder2hSent.Should().BeTrue();

        var reloaded3h = await context.Appointments.IgnoreQueryFilters().FirstAsync(a => a.Id == appt3h.Id);
        reloaded3h.Reminder2hSent.Should().BeFalse();
    }

    [Fact]
    public async Task BoundaryTesting_OffByOneSecond_StrictInclusionExclusion()
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
            ClinicName = "OffByOne Clinic",
            EnableAppointmentReminders = true,
            AppointmentReminder24hEnabled = true,
            AppointmentReminder2hEnabled = true
        };

        // 24h window: [23h, 25h]
        var appt24hBelow = CreateAppointment("24h Below by 1s", utcNow.AddHours(23).AddSeconds(-1));
        var appt24hAbove = CreateAppointment("24h Above by 1s", utcNow.AddHours(25).AddSeconds(1));

        // 2h window: [1h, 2.5h]
        var appt2hBelow = CreateAppointment("2h Below by 1s", utcNow.AddHours(1).AddSeconds(-1));
        var appt2hAbove = CreateAppointment("2h Above by 1s", utcNow.AddHours(2.5).AddSeconds(1));

        await context.Settings.AddAsync(clinic);
        await context.Appointments.AddRangeAsync(appt24hBelow, appt24hAbove, appt2hBelow, appt2hAbove);
        await context.SaveChangesAsync();

        // Act
        var dispatched = await service.ProcessClinicRemindersAsync(context, dispatcher, clinic, utcNow, CancellationToken.None);

        // Assert: all 4 are strictly outside windows
        dispatched.Should().Be(0);
        await dispatcher.DidNotReceive().DispatchAlertAsync(Arg.Any<Appointment>(), Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task StatusExclusion_CancelledAndNonConfirmedAppointments_NeverDispatched()
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
            ClinicName = "Status Test Clinic",
            EnableAppointmentReminders = true,
            AppointmentReminder24hEnabled = true,
            AppointmentReminder2hEnabled = true
        };

        var appts = new List<Appointment>
        {
            CreateAppointmentWithStatus("Cancelled 24h", utcNow.AddHours(24), AppointmentStatus.Cancelled),
            CreateAppointmentWithStatus("Cancelled 2h", utcNow.AddHours(2), AppointmentStatus.Cancelled),
            CreateAppointmentWithStatus("Completed 24h", utcNow.AddHours(24), AppointmentStatus.Completed),
            CreateAppointmentWithStatus("Completed 2h", utcNow.AddHours(2), AppointmentStatus.Completed),
            CreateAppointmentWithStatus("Pending 24h", utcNow.AddHours(24), AppointmentStatus.Pending),
            CreateAppointmentWithStatus("Pending 2h", utcNow.AddHours(2), AppointmentStatus.Pending),
            CreateAppointmentWithStatus("CheckedIn 24h", utcNow.AddHours(24), AppointmentStatus.CheckedIn),
            CreateAppointmentWithStatus("CheckedIn 2h", utcNow.AddHours(2), AppointmentStatus.CheckedIn),
            CreateAppointmentWithStatus("InConsultation 24h", utcNow.AddHours(24), AppointmentStatus.InConsultation),
            CreateAppointmentWithStatus("InConsultation 2h", utcNow.AddHours(2), AppointmentStatus.InConsultation),
            // Soft deleted confirmed appointment
            new Appointment
            {
                Id = Guid.NewGuid(),
                ClinicId = _clinicId,
                TenantId = _tenantId,
                PatientId = Guid.NewGuid(),
                PatientName = "Soft Deleted Confirmed",
                ScheduledAt = utcNow.AddHours(24),
                DurationMinutes = 30,
                Status = AppointmentStatus.Confirmed,
                IsDeleted = true
            }
        };

        // And one single Confirmed appointment that SHOULD be dispatched
        var confirmed24h = CreateAppointmentWithStatus("Confirmed 24h", utcNow.AddHours(24), AppointmentStatus.Confirmed);
        appts.Add(confirmed24h);

        await context.Settings.AddAsync(clinic);
        await context.Appointments.AddRangeAsync(appts);
        await context.SaveChangesAsync();

        // Act
        var dispatched = await service.ProcessClinicRemindersAsync(context, dispatcher, clinic, utcNow, CancellationToken.None);

        // Assert
        dispatched.Should().Be(1);
        await dispatcher.Received(1).DispatchAlertAsync(
            Arg.Is<Appointment>(a => a.Id == confirmed24h.Id),
            AppointmentAlertKinds.Reminder24h,
            Arg.Any<CancellationToken>());

        // Verify none of the other appointments were touched
        var nonConfirmedIds = appts.Where(a => a.Id != confirmed24h.Id).Select(a => a.Id).ToList();
        var reloadedNonConfirmed = await context.Appointments.IgnoreQueryFilters()
            .Where(a => nonConfirmedIds.Contains(a.Id))
            .ToListAsync();

        reloadedNonConfirmed.Should().AllSatisfy(a =>
        {
            a.Reminder24hSent.Should().BeFalse();
            a.Reminder2hSent.Should().BeFalse();
            a.LastReminderSentAt.Should().BeNull();
        });
    }

    [Fact]
    public async Task LifecycleProgression_AdvanceTimeAcrossTicks_CorrectlyDispatches24hThen2hWithoutDuplicates()
    {
        // Arrange
        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();
        var logger = NullLogger<AppointmentReminderBackgroundService>.Instance;
        var service = new AppointmentReminderBackgroundService(Substitute.For<IServiceScopeFactory>(), logger);

        var t0 = new DateTime(2026, 10, 20, 10, 0, 0, DateTimeKind.Utc);
        var scheduledAt = t0.AddHours(24); // Scheduled at tomorrow 10:00

        var clinic = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Lifecycle Clinic",
            EnableAppointmentReminders = true,
            AppointmentReminder24hEnabled = true,
            AppointmentReminder2hEnabled = true
        };

        var appt = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Progression Patient",
            ScheduledAt = scheduledAt,
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            Reminder24hSent = false,
            Reminder2hSent = false
        };

        await context.Settings.AddAsync(clinic);
        await context.Appointments.AddAsync(appt);
        await context.SaveChangesAsync();

        // Act 1: Tick 1 at T0 (24h before appointment)
        var count1 = await service.ProcessClinicRemindersAsync(context, dispatcher, clinic, t0, CancellationToken.None);
        count1.Should().Be(1);

        var reload1 = await context.Appointments.IgnoreQueryFilters().FirstAsync(a => a.Id == appt.Id);
        reload1.Reminder24hSent.Should().BeTrue();
        reload1.Reminder24hSentAt.Should().Be(t0);
        reload1.LastReminderSentAt.Should().Be(t0);
        reload1.LastReminderType.Should().Be("24h");
        reload1.Reminder2hSent.Should().BeFalse();

        // Act 2: Tick 1.5 at T0 + 1 hour (23h before appointment - still in 24h window, but already sent)
        var count1_5 = await service.ProcessClinicRemindersAsync(context, dispatcher, clinic, t0.AddHours(1), CancellationToken.None);
        count1_5.Should().Be(0);

        // Act 3: Tick 2 at T0 + 22 hours (2h before appointment)
        var t2 = t0.AddHours(22);
        var count2 = await service.ProcessClinicRemindersAsync(context, dispatcher, clinic, t2, CancellationToken.None);
        count2.Should().Be(1);

        var reload2 = await context.Appointments.IgnoreQueryFilters().FirstAsync(a => a.Id == appt.Id);
        reload2.Reminder24hSent.Should().BeTrue();
        reload2.Reminder24hSentAt.Should().Be(t0);
        reload2.Reminder2hSent.Should().BeTrue();
        reload2.Reminder2hSentAt.Should().Be(t2);
        reload2.LastReminderSentAt.Should().Be(t2);
        reload2.LastReminderType.Should().Be("2h");

        // Act 4: Tick 3 at T0 + 22.5 hours (1.5h before appointment - in 2h window, but already sent)
        var count3 = await service.ProcessClinicRemindersAsync(context, dispatcher, clinic, t0.AddHours(22.5), CancellationToken.None);
        count3.Should().Be(0);

        // Verify total dispatcher invocations: exactly 1 for 24h, 1 for 2h
        await dispatcher.Received(1).DispatchAlertAsync(
            Arg.Is<Appointment>(a => a.Id == appt.Id),
            AppointmentAlertKinds.Reminder24h,
            Arg.Any<CancellationToken>());

        await dispatcher.Received(1).DispatchAlertAsync(
            Arg.Is<Appointment>(a => a.Id == appt.Id),
            AppointmentAlertKinds.Reminder2h,
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ShortNoticeAppointment_NeverReceived24h_StillReceives2hReminder()
    {
        // Arrange: appointment booked 1.5h before appointment time
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
            ClinicName = "Short Notice Clinic",
            EnableAppointmentReminders = true,
            AppointmentReminder24hEnabled = true,
            AppointmentReminder2hEnabled = true
        };

        var appt = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Short Notice Patient",
            ScheduledAt = utcNow.AddHours(1.5), // In 2h window [1h, 2.5h]
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            Reminder24hSent = false,
            Reminder2hSent = false
        };

        await context.Settings.AddAsync(clinic);
        await context.Appointments.AddAsync(appt);
        await context.SaveChangesAsync();

        // Act
        var dispatched = await service.ProcessClinicRemindersAsync(context, dispatcher, clinic, utcNow, CancellationToken.None);

        // Assert
        dispatched.Should().Be(1);

        await dispatcher.Received(1).DispatchAlertAsync(
            Arg.Is<Appointment>(a => a.Id == appt.Id),
            AppointmentAlertKinds.Reminder2h,
            Arg.Any<CancellationToken>());

        var reloaded = await context.Appointments.IgnoreQueryFilters().FirstAsync(a => a.Id == appt.Id);
        reloaded.Reminder24hSent.Should().BeFalse();
        reloaded.Reminder24hSentAt.Should().BeNull();
        reloaded.Reminder2hSent.Should().BeTrue();
        reloaded.Reminder2hSentAt.Should().Be(utcNow);
        reloaded.LastReminderType.Should().Be("2h");
    }

    [Fact]
    public async Task AtomicPersistence_WithRealDispatcherAndOutbox_BothAppointmentAndOutboxCommittedTogether()
    {
        // Arrange: Full end-to-end integration test with real AppointmentNotificationDispatcher and InteropPublisher
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffNotificationRepo = TestDbHelper.CreateRepository<StaffNotification>(context, sieve);
        var publisher = new InteropPublisher(context);
        var dispatcherLogger = NullLogger<AppointmentNotificationDispatcher>.Instance;
        var dispatcher = new AppointmentNotificationDispatcher(patientRepo, settingsRepo, staffNotificationRepo, publisher, dispatcherLogger);

        var bgLogger = NullLogger<AppointmentReminderBackgroundService>.Instance;
        var service = new AppointmentReminderBackgroundService(Substitute.For<IServiceScopeFactory>(), bgLogger);

        var utcNow = new DateTime(2026, 10, 20, 10, 0, 0, DateTimeKind.Utc);
        var syncPatientId = Guid.NewGuid();

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            FirstName = "Andres",
            LastName = "Bonifacio",
            PatientCode = "P-BONIFACIO",
            DateOfBirth = new DateOnly(1990, 11, 30),
            ContactNumber = "0917-888-9999",
            CloudPatientId = syncPatientId
        };

        var clinic = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Katipunan Health Hub",
            EnableAppointmentReminders = true,
            AppointmentReminder24hEnabled = true,
            AppointmentReminder2hEnabled = true
        };

        var doctorId = Guid.NewGuid();
        var appt = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = patient.Id,
            PatientName = $"{patient.FirstName} {patient.LastName}",
            DoctorId = doctorId,
            DoctorName = "Dr. Valenzuela",
            ServiceType = "General Consultation",
            ScheduledAt = utcNow.AddHours(24),
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            Reminder24hSent = false,
            Reminder2hSent = false
        };

        await patientRepo.AddAsync(patient);
        await settingsRepo.AddAsync(clinic);
        await context.Appointments.AddAsync(appt);
        await context.SaveChangesAsync();

        // Act
        var dispatched = await service.ProcessClinicRemindersAsync(context, dispatcher, clinic, utcNow, CancellationToken.None);

        // Assert: 1 reminder processed and committed atomically
        dispatched.Should().Be(1);

        // Verify appointment entity state in DB
        var reloadedAppt = await context.Appointments.IgnoreQueryFilters().FirstAsync(a => a.Id == appt.Id);
        reloadedAppt.Reminder24hSent.Should().BeTrue();
        reloadedAppt.Reminder24hSentAt.Should().Be(utcNow);
        reloadedAppt.LastReminderSentAt.Should().Be(utcNow);
        reloadedAppt.LastReminderType.Should().Be("24h");
        reloadedAppt.UpdatedBy.Should().Be("AppointmentReminderBackgroundService");
        reloadedAppt.UpdatedAt.Should().Be(utcNow);

        // Verify outbox message committed in same transaction
        var outboxMessages = await context.InteropOutbox.ToListAsync();
        outboxMessages.Should().ContainSingle();

        var message = outboxMessages.Single();
        message.Type.Should().Be(InteropTypes.PatientAppointmentAlert);
        message.CorrelationId.Should().Be(appt.Id);
        message.EnvelopeJson.Should().NotBeNullOrWhiteSpace();

        // Parse and verify payload via official InteropEnvelope deserializer
        var envelope = InteropEnvelope.FromJson(message.EnvelopeJson);
        envelope.Type.Should().Be(InteropTypes.PatientAppointmentAlert);
        envelope.CorrelationId.Should().Be(appt.Id);

        var payload = envelope.GetPayload<PatientAppointmentAlertPayload>();
        payload.AlertKind.Should().Be(AppointmentAlertKinds.Reminder24h);
        payload.AppointmentId.Should().Be(appt.Id);
        payload.ClinicName.Should().Be("Katipunan Health Hub");
        payload.DoctorName.Should().Be("Dr. Valenzuela");
        payload.Message.Should().Contain("tomorrow at");
    }

    [Fact]
    public async Task ErrorIsolation_WhenDispatcherThrowsForOneClinic_OtherClinicsStillSucceed()
    {
        // Arrange
        var dbName = $"ClinicEz_ErrorIsolation_{Guid.NewGuid()}";
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("DbSchema", "public") })
            .Build();

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;

        var clinicGood1 = Guid.NewGuid();
        var clinicBad = Guid.NewGuid();
        var clinicGood2 = Guid.NewGuid();

        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();

        // Set up dispatcher to throw for clinicBad's appointment
        dispatcher.When(d => d.DispatchAlertAsync(
            Arg.Is<Appointment>(a => a.ClinicId == clinicBad),
            Arg.Any<string>(),
            Arg.Any<CancellationToken>()))
            .Do(_ => throw new InvalidOperationException("Simulated connection failure during dispatch."));

        var services = new ServiceCollection();
        services.AddScoped(_ => new ApplicationDbContext(options, config, _clinicContext));
        services.AddScoped(_ => dispatcher);

        var serviceProvider = services.BuildServiceProvider();
        var scopeFactory = serviceProvider.GetRequiredService<IServiceScopeFactory>();

        var utcNow = new DateTime(2026, 10, 20, 10, 0, 0, DateTimeKind.Utc);

        using (var seedScope = scopeFactory.CreateScope())
        {
            var db = seedScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var c1 = new FacilitySettings
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicGood1,
                TenantId = "tenant-g1",
                ClinicName = "Good Clinic 1",
                EnableAppointmentReminders = true,
                AppointmentReminder24hEnabled = true,
                AppointmentReminder2hEnabled = true
            };

            var c2 = new FacilitySettings
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicBad,
                TenantId = "tenant-bad",
                ClinicName = "Faulty Clinic",
                EnableAppointmentReminders = true,
                AppointmentReminder24hEnabled = true,
                AppointmentReminder2hEnabled = true
            };

            var c3 = new FacilitySettings
            {
                Id = Guid.NewGuid(),
                ClinicId = clinicGood2,
                TenantId = "tenant-g2",
                ClinicName = "Good Clinic 2",
                EnableAppointmentReminders = true,
                AppointmentReminder24hEnabled = true,
                AppointmentReminder2hEnabled = true
            };

            await db.Settings.AddRangeAsync(c1, c2, c3);

            var a1 = CreateAppointmentForClinic("Appt Good 1", clinicGood1, "tenant-g1", utcNow.AddHours(24));
            var a2 = CreateAppointmentForClinic("Appt Bad", clinicBad, "tenant-bad", utcNow.AddHours(24));
            var a3 = CreateAppointmentForClinic("Appt Good 2", clinicGood2, "tenant-g2", utcNow.AddHours(24));

            await db.Appointments.AddRangeAsync(a1, a2, a3);
            await db.SaveChangesAsync();
        }

        var logger = NullLogger<AppointmentReminderBackgroundService>.Instance;
        var service = new AppointmentReminderBackgroundService(scopeFactory, logger);

        // Act: Run cycle - should isolate error from clinicBad and succeed for clinicGood1 and clinicGood2
        var totalReminders = await service.RunReminderCycleAsync(utcNow, CancellationToken.None);

        // Assert: 2 reminders succeeded, faulty clinic did not crash host
        totalReminders.Should().Be(2);

        using (var verifyScope = scopeFactory.CreateScope())
        {
            var db = verifyScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var reloaded1 = await db.Appointments.IgnoreQueryFilters().FirstAsync(a => a.ClinicId == clinicGood1);
            reloaded1.Reminder24hSent.Should().BeTrue();

            var reloadedBad = await db.Appointments.IgnoreQueryFilters().FirstAsync(a => a.ClinicId == clinicBad);
            // Bad clinic failed before SaveChangesAsync, so entity was not committed
            reloadedBad.Reminder24hSent.Should().BeFalse();

            var reloaded2 = await db.Appointments.IgnoreQueryFilters().FirstAsync(a => a.ClinicId == clinicGood2);
            reloaded2.Reminder24hSent.Should().BeTrue();
        }
    }

    [Fact]
    public async Task CrossClinicIsolation_DoesNotTouchAppointmentsFromOtherClinics()
    {
        // Arrange
        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();
        var logger = NullLogger<AppointmentReminderBackgroundService>.Instance;
        var service = new AppointmentReminderBackgroundService(Substitute.For<IServiceScopeFactory>(), logger);

        var utcNow = new DateTime(2026, 10, 20, 10, 0, 0, DateTimeKind.Utc);
        var otherClinicId = Guid.NewGuid();

        var clinicA = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Clinic A",
            EnableAppointmentReminders = true,
            AppointmentReminder24hEnabled = true,
            AppointmentReminder2hEnabled = true
        };

        var apptA = CreateAppointmentForClinic("Appt A", _clinicId, _tenantId, utcNow.AddHours(24));
        var apptB = CreateAppointmentForClinic("Appt B", otherClinicId, "tenant-b", utcNow.AddHours(24));

        await context.Settings.AddAsync(clinicA);
        await context.Appointments.AddRangeAsync(apptA, apptB);
        await context.SaveChangesAsync();

        // Act: Process Clinic A only
        var dispatched = await service.ProcessClinicRemindersAsync(context, dispatcher, clinicA, utcNow, CancellationToken.None);

        // Assert
        dispatched.Should().Be(1);

        var reloadedA = await context.Appointments.IgnoreQueryFilters().FirstAsync(a => a.Id == apptA.Id);
        reloadedA.Reminder24hSent.Should().BeTrue();

        var reloadedB = await context.Appointments.IgnoreQueryFilters().FirstAsync(a => a.Id == apptB.Id);
        reloadedB.Reminder24hSent.Should().BeFalse();
        reloadedB.LastReminderSentAt.Should().BeNull();
    }

    private Appointment CreateAppointment(string name, DateTime scheduledAt)
    {
        return new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = name,
            ScheduledAt = scheduledAt,
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            Reminder24hSent = false,
            Reminder2hSent = false
        };
    }

    private Appointment CreateAppointmentWithStatus(string name, DateTime scheduledAt, AppointmentStatus status)
    {
        return new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = name,
            ScheduledAt = scheduledAt,
            DurationMinutes = 30,
            Status = status,
            Reminder24hSent = false,
            Reminder2hSent = false
        };
    }

    private static Appointment CreateAppointmentForClinic(string name, Guid clinicId, string tenantId, DateTime scheduledAt)
    {
        return new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = clinicId,
            TenantId = tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = name,
            ScheduledAt = scheduledAt,
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            Reminder24hSent = false,
            Reminder2hSent = false
        };
    }
}
