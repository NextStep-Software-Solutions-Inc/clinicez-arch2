using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Appointments;
using ClinicEz.Clinic.Application.Features.Appointments.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Appointments;

/// <summary>
/// Empirical Challenger Verification Suite for Milestone 3:
/// Stress-tests command handler integration, outbox dispatching, doctor notification creation,
/// reminder flag resetting on rescheduling, and failure isolation / edge cases.
/// </summary>
public sealed class AppointmentCommandHandlerChallengerTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-challenger-m3";
    private readonly IClinicContext _clinicContext;

    public AppointmentCommandHandlerChallengerTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
    }

    [Fact]
    public async Task Reschedule_WhenFlagsWereTrueAndTimestampsSet_ResetsAllFourPropertiesToFalseAndNull()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();

        var doctorId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = patientId,
            PatientName = "Juan Luna",
            DoctorId = doctorId,
            DoctorName = "Dr. Rizal",
            ScheduledAt = DateTime.UtcNow.AddDays(1),
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            Reminder24hSent = true,
            Reminder2hSent = true,
            Reminder24hSentAt = DateTime.UtcNow.AddHours(-1),
            Reminder2hSentAt = DateTime.UtcNow.AddMinutes(-30),
            LastReminderSentAt = DateTime.UtcNow.AddMinutes(-30),
            LastReminderType = "2h"
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new RescheduleAppointmentCommandHandler(repo, uow, dispatcher);
        var newDate = DateTime.UtcNow.AddDays(5);

        // Act
        var result = await handler.Handle(new RescheduleAppointmentCommand(appointment.Id, newDate, 45, "Doctor emergency"), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.ScheduledAt.Should().Be(newDate.ToUniversalTime());

        var persisted = await repo.GetByIdAsync(appointment.Id);
        persisted.Should().NotBeNull();
        persisted!.Reminder24hSent.Should().BeFalse(because: "Rescheduling must reset Reminder24hSent so 24h reminder can re-trigger");
        persisted.Reminder2hSent.Should().BeFalse(because: "Rescheduling must reset Reminder2hSent so 2h reminder can re-trigger");
        persisted.Reminder24hSentAt.Should().BeNull(because: "Rescheduling must clear Reminder24hSentAt timestamp");
        persisted.Reminder2hSentAt.Should().BeNull(because: "Rescheduling must clear Reminder2hSentAt timestamp");

        await dispatcher.Received(1).DispatchAlertAsync(
            Arg.Is<Appointment>(a => a.Id == appointment.Id && a.ScheduledAt == newDate.ToUniversalTime()),
            AppointmentAlertKinds.Rescheduled,
            Arg.Any<CancellationToken>());

        await dispatcher.Received(1).DispatchStaffNotificationAsync(
            Arg.Is<Appointment>(a => a.Id == appointment.Id && a.ScheduledAt == newDate.ToUniversalTime()),
            "rescheduled",
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Reschedule_SequentialReschedules_KeepReminderFlagsReset()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Emilio Aguinaldo",
            ScheduledAt = DateTime.UtcNow.AddDays(2),
            Status = AppointmentStatus.Confirmed,
            Reminder24hSent = false,
            Reminder2hSent = false
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new RescheduleAppointmentCommandHandler(repo, uow, dispatcher);

        // Act 1: Reschedule once
        var time1 = DateTime.UtcNow.AddDays(3);
        await handler.Handle(new RescheduleAppointmentCommand(appointment.Id, time1), CancellationToken.None);

        // Simulate background reminder sending 24h reminder
        var loaded = await repo.GetByIdAsync(appointment.Id);
        loaded!.Reminder24hSent = true;
        loaded.Reminder24hSentAt = DateTime.UtcNow;
        await uow.SaveChangesAsync();

        // Act 2: Reschedule second time
        var time2 = DateTime.UtcNow.AddDays(6);
        await handler.Handle(new RescheduleAppointmentCommand(appointment.Id, time2), CancellationToken.None);

        // Assert
        var reloaded = await repo.GetByIdAsync(appointment.Id);
        reloaded!.Reminder24hSent.Should().BeFalse(because: "Second reschedule must re-clear Reminder24hSent");
        reloaded.Reminder2hSent.Should().BeFalse();
        reloaded.Reminder24hSentAt.Should().BeNull();
        reloaded.Reminder2hSentAt.Should().BeNull();

        await dispatcher.Received(2).DispatchAlertAsync(Arg.Any<Appointment>(), AppointmentAlertKinds.Rescheduled, Arg.Any<CancellationToken>());
        await dispatcher.Received(2).DispatchStaffNotificationAsync(Arg.Any<Appointment>(), "rescheduled", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Reschedule_WithDoctorCollision_ThrowsConflictException_AndDoesNotDispatchOrMutate()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();

        var doctorId = Guid.NewGuid();
        var targetSlot = new DateTime(2026, 12, 1, 10, 0, 0, DateTimeKind.Utc);

        // Existing booking in slot
        var existingBooking = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Existing Patient",
            DoctorId = doctorId,
            ScheduledAt = targetSlot,
            DurationMinutes = 30,
            EndTimeUtc = targetSlot.AddMinutes(30),
            Status = AppointmentStatus.Confirmed
        };
        await repo.AddAsync(existingBooking);

        // Appointment to reschedule
        var originalSlot = new DateTime(2026, 11, 20, 14, 0, 0, DateTimeKind.Utc);
        var apptToReschedule = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Moving Patient",
            DoctorId = doctorId,
            ScheduledAt = originalSlot,
            DurationMinutes = 30,
            EndTimeUtc = originalSlot.AddMinutes(30),
            Status = AppointmentStatus.Confirmed,
            Reminder24hSent = true
        };
        await repo.AddAsync(apptToReschedule);
        await uow.SaveChangesAsync();

        var handler = new RescheduleAppointmentCommandHandler(repo, uow, dispatcher);

        // Act & Assert
        var act = () => handler.Handle(new RescheduleAppointmentCommand(apptToReschedule.Id, targetSlot), CancellationToken.None);
        await act.Should().ThrowAsync<ConflictException>();

        // Verify dispatcher was never called
        await dispatcher.DidNotReceiveWithAnyArgs().DispatchAlertAsync(default!, default!, default);
        await dispatcher.DidNotReceiveWithAnyArgs().DispatchStaffNotificationAsync(default!, default!, default);

        // Verify entity was NOT mutated
        var unchanged = await repo.GetByIdAsync(apptToReschedule.Id);
        unchanged!.ScheduledAt.Should().Be(originalSlot);
        unchanged.Reminder24hSent.Should().BeTrue();
    }

    [Fact]
    public async Task CreateAppointment_WithUnlinkedPatient_DispatchesDoctorNotification_AndSilentlySkipsOutbox()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffNotificationRepo = TestDbHelper.CreateRepository<StaffNotification>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var logger = NullLogger<AppointmentNotificationDispatcher>.Instance;

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            FirstName = "WalkIn",
            LastName = "Patient",
            PatientCode = "P-UNLINKED",
            DateOfBirth = new DateOnly(1990, 1, 1),
            ContactNumber = "0917-000-1111",
            CloudPatientId = null // Not linked to mobile app
        };
        await patientRepo.AddAsync(patient);

        var doctorId = Guid.NewGuid();
        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Community Clinic",
            EnableStaffAppointmentNotifications = true
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var realDispatcher = new AppointmentNotificationDispatcher(
            patientRepo, settingsRepo, staffNotificationRepo, publisher, logger);

        var handler = new CreateAppointmentCommandHandler(appointmentRepo, uow, _clinicContext, realDispatcher);

        var command = new CreateAppointmentCommand(
            patient.Id,
            "WalkIn Patient",
            doctorId,
            "Dr. Marcelo",
            DateTime.UtcNow.AddDays(2),
            30);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();

        // 1. Publisher MUST NOT receive any message because SyncPatientId is null
        publisher.DidNotReceiveWithAnyArgs().Enqueue(
            Arg.Any<string>(), Arg.Any<Party>(), Arg.Any<Party>(), Arg.Any<Guid>(), Arg.Any<PatientAppointmentAlertPayload>());

        // 2. Doctor MUST still receive staff notification
        var staffNotifs = await staffNotificationRepo.Query(n => n.RecipientStaffId == doctorId).ToListAsync();
        staffNotifs.Should().HaveCount(1);
        staffNotifs[0].Title.Should().Be("New Appointment: WalkIn Patient");
        staffNotifs[0].Category.Should().Be(StaffNotificationCategory.Appointment);
        staffNotifs[0].ActionRoute.Should().Be("Appointments");
    }

    [Fact]
    public async Task CreateAppointment_WithoutDoctor_DispatchesOutbox_AndSilentlySkipsDoctorNotification()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var appointmentRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffNotificationRepo = TestDbHelper.CreateRepository<StaffNotification>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var logger = NullLogger<AppointmentNotificationDispatcher>.Instance;

        var syncPatientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            FirstName = "Mobile",
            LastName = "User",
            PatientCode = "P-LINKED",
            DateOfBirth = new DateOnly(1995, 2, 2),
            ContactNumber = "0917-222-3333",
            CloudPatientId = syncPatientId
        };
        await patientRepo.AddAsync(patient);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Open Access Clinic",
            EnableStaffAppointmentNotifications = true
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var realDispatcher = new AppointmentNotificationDispatcher(
            patientRepo, settingsRepo, staffNotificationRepo, publisher, logger);

        var handler = new CreateAppointmentCommandHandler(appointmentRepo, uow, _clinicContext, realDispatcher);

        var command = new CreateAppointmentCommand(
            patient.Id,
            "Mobile User",
            null, // No assigned doctor
            null,
            DateTime.UtcNow.AddDays(2),
            30);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();

        // 1. Publisher MUST receive message for linked patient
        publisher.Received(1).Enqueue(
            InteropTypes.PatientAppointmentAlert,
            Arg.Any<Party>(),
            Arg.Is<Party>(p => p.PatientId == syncPatientId.ToString()),
            result.Id,
            Arg.Is<PatientAppointmentAlertPayload>(p => p.AlertKind == AppointmentAlertKinds.Booked));

        // 2. No staff notification should be created
        var staffNotifs = await staffNotificationRepo.Query().ToListAsync();
        staffNotifs.Should().BeEmpty();
    }

    [Fact]
    public async Task CancelAppointment_DispatchesAlertAndDoctorNotification()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();

        var doctorId = Guid.NewGuid();
        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Melchora Aquino",
            DoctorId = doctorId,
            DoctorName = "Dr. Del Pilar",
            ScheduledAt = DateTime.UtcNow.AddDays(3),
            Status = AppointmentStatus.Confirmed
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new CancelAppointmentCommandHandler(repo, uow, dispatcher);

        // Act
        var result = await handler.Handle(new CancelAppointmentCommand(appointment.Id, "Schedule conflict"), CancellationToken.None);

        // Assert
        result.Status.Should().Be(AppointmentStatus.Cancelled);

        await dispatcher.Received(1).DispatchAlertAsync(
            Arg.Is<Appointment>(a => a.Id == appointment.Id && a.Status == AppointmentStatus.Cancelled),
            AppointmentAlertKinds.Cancelled,
            Arg.Any<CancellationToken>());

        await dispatcher.Received(1).DispatchStaffNotificationAsync(
            Arg.Is<Appointment>(a => a.Id == appointment.Id && a.Status == AppointmentStatus.Cancelled),
            "cancelled",
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Dispatcher_WhenStaffNotificationsDisabledInSettings_DoesNotCreateStaffNotification()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var staffNotificationRepo = TestDbHelper.CreateRepository<StaffNotification>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var logger = NullLogger<AppointmentNotificationDispatcher>.Instance;

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Disabled Notifs Clinic",
            EnableStaffAppointmentNotifications = false // Disabled
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var dispatcher = new AppointmentNotificationDispatcher(
            patientRepo, settingsRepo, staffNotificationRepo, publisher, logger);

        var doctorId = Guid.NewGuid();
        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Antonio Luna",
            DoctorId = doctorId,
            ScheduledAt = DateTime.UtcNow.AddDays(1),
            Status = AppointmentStatus.Confirmed
        };

        // Act
        await dispatcher.DispatchStaffNotificationAsync(appointment, "booked", CancellationToken.None);
        await uow.SaveChangesAsync();

        // Assert
        var notifs = await staffNotificationRepo.Query().ToListAsync();
        notifs.Should().BeEmpty();
    }
}
