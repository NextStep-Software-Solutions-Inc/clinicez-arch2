using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Appointments;
using ClinicEz.Clinic.Application.Features.Appointments.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Appointments;

public sealed class AppointmentCommandHandlerNotificationTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "test-tenant-456";
    private readonly IClinicContext _clinicContext;

    public AppointmentCommandHandlerNotificationTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
    }

    [Fact]
    public async Task CreateAppointmentCommandHandler_DispatchesBookedAlertAndStaffNotificationBeforeSave()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();

        var doctorId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var handler = new CreateAppointmentCommandHandler(repo, uow, _clinicContext, dispatcher);

        var command = new CreateAppointmentCommand(
            PatientId: patientId,
            PatientName: "Benigno Aquino",
            DoctorId: doctorId,
            DoctorName: "Dr. Santos",
            ScheduledAt: new DateTime(2026, 11, 20, 9, 0, 0, DateTimeKind.Utc),
            DurationMinutes: 30,
            ServiceType: "Dental Extraction",
            Reason: "Toothache",
            Notes: "Upper right molar");

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.PatientName.Should().Be("Benigno Aquino");

        // Verify dispatcher was invoked with Booked alert kind and booked staff notification
        await dispatcher.Received(1).DispatchAlertAsync(
            Arg.Is<Appointment>(a => a.PatientName == "Benigno Aquino" && a.DoctorId == doctorId),
            AppointmentAlertKinds.Booked,
            Arg.Any<CancellationToken>());

        await dispatcher.Received(1).DispatchStaffNotificationAsync(
            Arg.Is<Appointment>(a => a.PatientName == "Benigno Aquino" && a.DoctorId == doctorId),
            "booked",
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task RescheduleAppointmentCommandHandler_ResetsReminderFlagsAndDispatchesRescheduledNotifications()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();

        var doctorId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        // Seed an existing appointment that already had advance reminders sent
        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = patientId,
            PatientName = "Gabriela Silang",
            DoctorId = doctorId,
            DoctorName = "Dr. Santos",
            ScheduledAt = new DateTime(2026, 11, 10, 10, 0, 0, DateTimeKind.Utc),
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            Reminder24hSent = true,
            Reminder2hSent = true,
            Reminder24hSentAt = DateTime.UtcNow.AddDays(-1),
            Reminder2hSentAt = DateTime.UtcNow.AddHours(-2),
            LastReminderSentAt = DateTime.UtcNow.AddHours(-2),
            LastReminderType = "2h"
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new RescheduleAppointmentCommandHandler(repo, uow, dispatcher);

        var newTime = new DateTime(2026, 11, 12, 14, 0, 0, DateTimeKind.Utc);
        var command = new RescheduleAppointmentCommand(
            Id: appointment.Id,
            NewScheduledAt: newTime,
            DurationMinutes: 45,
            Reason: "Patient request");

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.ScheduledAt.Should().Be(newTime);
        result.DurationMinutes.Should().Be(45);

        // Verify entity in db has reminder flags reset so it receives reminders for the new time window
        var updated = await repo.GetByIdAsync(appointment.Id);
        updated.Should().NotBeNull();
        updated!.Reminder24hSent.Should().BeFalse();
        updated.Reminder2hSent.Should().BeFalse();
        updated.Reminder24hSentAt.Should().BeNull();
        updated.Reminder2hSentAt.Should().BeNull();

        // Verify dispatcher was called
        await dispatcher.Received(1).DispatchAlertAsync(
            Arg.Is<Appointment>(a => a.Id == appointment.Id && a.ScheduledAt == newTime),
            AppointmentAlertKinds.Rescheduled,
            Arg.Any<CancellationToken>());

        await dispatcher.Received(1).DispatchStaffNotificationAsync(
            Arg.Is<Appointment>(a => a.Id == appointment.Id && a.ScheduledAt == newTime),
            "rescheduled",
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CancelAppointmentCommandHandler_DispatchesCancelledNotifications()
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
            PatientName = "Diego Silang",
            DoctorId = doctorId,
            ScheduledAt = DateTime.UtcNow.AddDays(3),
            Status = AppointmentStatus.Confirmed
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new CancelAppointmentCommandHandler(repo, uow, dispatcher);

        var command = new CancelAppointmentCommand(
            Id: appointment.Id,
            CancellationReason: "Patient feeling better");

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Status.Should().Be(AppointmentStatus.Cancelled);

        var updated = await repo.GetByIdAsync(appointment.Id);
        updated.Should().NotBeNull();
        updated!.Status.Should().Be(AppointmentStatus.Cancelled);
        updated.Notes.Should().Contain("Cancelled: Patient feeling better");

        // Verify dispatcher was called
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
    public async Task EndToEnd_CreateAppointment_WithRealDispatcher_EnqueuesOutboxAndCreatesStaffNotification()
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
            FirstName = "Apolinario",
            LastName = "Mabini",
            PatientCode = "P-999",
            DateOfBirth = new DateOnly(1864, 7, 23),
            ContactNumber = "0917-000-0001",
            CloudPatientId = syncPatientId
        };
        await patientRepo.AddAsync(patient);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Mabini Clinic",
            EnableStaffAppointmentNotifications = true
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var realDispatcher = new AppointmentNotificationDispatcher(
            patientRepo, settingsRepo, staffNotificationRepo, publisher, logger);

        var doctorId = Guid.NewGuid();
        var createHandler = new CreateAppointmentCommandHandler(appointmentRepo, uow, _clinicContext, realDispatcher);

        var command = new CreateAppointmentCommand(
            PatientId: patient.Id,
            PatientName: "Apolinario Mabini",
            DoctorId: doctorId,
            DoctorName: "Dr. Jose",
            ScheduledAt: new DateTime(2026, 12, 10, 8, 30, 0, DateTimeKind.Utc),
            DurationMinutes: 30,
            ServiceType: "Checkup");

        // Act
        var result = await createHandler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();

        // 1. Outbox message was enqueued to publisher
        publisher.Received(1).Enqueue(
            InteropTypes.PatientAppointmentAlert,
            Arg.Is<Party>(p => p.Kind == PartyKind.Facility && p.FacilityId == _clinicId.ToString()),
            Arg.Is<Party>(p => p.Kind == PartyKind.Patient && p.PatientId == syncPatientId.ToString()),
            result.Id,
            Arg.Is<PatientAppointmentAlertPayload>(p =>
                p.AppointmentId == result.Id &&
                p.ClinicName == "Mabini Clinic" &&
                p.AlertKind == AppointmentAlertKinds.Booked));

        // 2. Staff notification was created in database
        var staffNotifications = await staffNotificationRepo.Query(n => n.RecipientStaffId == doctorId).ToListAsync();
        staffNotifications.Should().HaveCount(1);
        var notif = staffNotifications[0];
        notif.Category.Should().Be(StaffNotificationCategory.Appointment);
        notif.ActionRoute.Should().Be("Appointments");
        notif.ActionParamsJson.Should().Be($"{{\"appointmentId\":\"{result.Id}\",\"date\":\"2026-12-10\"}}");
        notif.Title.Should().Be("New Appointment: Apolinario Mabini");
    }
}
