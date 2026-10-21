using System;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Features.Appointments;
using ClinicEz.Clinic.Application.Features.Appointments.Services;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Appointments;

public sealed class SendAppointmentReminderCommandStressTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-stress-remind";
    private readonly IClinicContext _clinicContext;

    public SendAppointmentReminderCommandStressTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffName.Returns("Nurse Teresa");
    }

    [Fact]
    public async Task Handle_PreservesExisting24hAnd2hReminderFlags_WhenManualReminderDispatched()
    {
        // Arrange: appointment has already had both 24h and 2h reminders sent in the past
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();

        var past24hSent = DateTime.UtcNow.AddHours(-23);
        var past2hSent = DateTime.UtcNow.AddHours(-1);

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Luna",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose Rizal",
            ScheduledAt = DateTime.UtcNow.AddHours(1),
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            ServiceType = "Follow-up",
            Reminder24hSent = true,
            Reminder24hSentAt = past24hSent,
            Reminder2hSent = true,
            Reminder2hSentAt = past2hSent,
            LastReminderSentAt = past2hSent,
            LastReminderType = "2h"
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new SendAppointmentReminderCommandHandler(repo, uow, _clinicContext, dispatcher);
        var command = new SendAppointmentReminderCommand(appointment.Id);

        // Act
        var beforeTime = DateTime.UtcNow.AddSeconds(-1);
        var result = await handler.Handle(command, CancellationToken.None);
        var afterTime = DateTime.UtcNow.AddSeconds(1);

        // Assert: DTO returns preserved 24h and 2h flags alongside updated manual reminder
        result.Should().NotBeNull();
        result.Id.Should().Be(appointment.Id);
        result.Reminder24hSent.Should().BeTrue("24h reminder flag must remain true");
        result.Reminder24hSentAt.Should().Be(past24hSent, "24h reminder timestamp must remain untouched");
        result.Reminder2hSent.Should().BeTrue("2h reminder flag must remain true");
        result.Reminder2hSentAt.Should().Be(past2hSent, "2h reminder timestamp must remain untouched");
        result.LastReminderType.Should().Be("manual");
        result.LastReminderSentAt.Should().NotBeNull();
        result.LastReminderSentAt!.Value.Should().BeOnOrAfter(beforeTime).And.BeOnOrBefore(afterTime);

        // Verify entity in DB reflects exact state
        var persisted = await context.Appointments.FindAsync(appointment.Id);
        persisted.Should().NotBeNull();
        persisted!.Reminder24hSent.Should().BeTrue();
        persisted.Reminder24hSentAt.Should().Be(past24hSent);
        persisted.Reminder2hSent.Should().BeTrue();
        persisted.Reminder2hSentAt.Should().Be(past2hSent);
        persisted.LastReminderType.Should().Be("manual");
        persisted.LastReminderSentAt.Should().NotBeNull();
        persisted.LastReminderSentAt!.Value.Should().BeOnOrAfter(beforeTime).And.BeOnOrBefore(afterTime);
        persisted.UpdatedBy.Should().Be("Nurse Teresa");

        // Verify dispatcher was invoked with ManualReminder
        await dispatcher.Received(1).DispatchAlertAsync(
            Arg.Is<Appointment>(a => a.Id == appointment.Id),
            AppointmentAlertKinds.ManualReminder,
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_PreservesFalseFlags_WhenManualReminderDispatched()
    {
        // Arrange: appointment has false for both 24h and 2h reminders
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Melchora Aquino",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Jose Rizal",
            ScheduledAt = DateTime.UtcNow.AddDays(5),
            DurationMinutes = 45,
            Status = AppointmentStatus.Confirmed,
            Reminder24hSent = false,
            Reminder24hSentAt = null,
            Reminder2hSent = false,
            Reminder2hSentAt = null,
            LastReminderSentAt = null,
            LastReminderType = null
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new SendAppointmentReminderCommandHandler(repo, uow, _clinicContext, dispatcher);
        var command = new SendAppointmentReminderCommand(appointment.Id);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Reminder24hSent.Should().BeFalse("24h reminder flag must remain false");
        result.Reminder24hSentAt.Should().BeNull();
        result.Reminder2hSent.Should().BeFalse("2h reminder flag must remain false");
        result.Reminder2hSentAt.Should().BeNull();
        result.LastReminderType.Should().Be("manual");
        result.LastReminderSentAt.Should().NotBeNull();

        var persisted = await context.Appointments.FindAsync(appointment.Id);
        persisted!.Reminder24hSent.Should().BeFalse();
        persisted.Reminder2hSent.Should().BeFalse();
        persisted.LastReminderType.Should().Be("manual");
    }

    [Fact]
    public async Task Handle_SupportsSequentialRepeatedManualReminders()
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
            PatientName = "Gabriela Silang",
            ScheduledAt = DateTime.UtcNow.AddDays(2),
            Status = AppointmentStatus.Confirmed
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new SendAppointmentReminderCommandHandler(repo, uow, _clinicContext, dispatcher);
        var command = new SendAppointmentReminderCommand(appointment.Id);

        // Act 1: First manual reminder
        var result1 = await handler.Handle(command, CancellationToken.None);
        var firstSentAt = result1.LastReminderSentAt;

        // Act 2: Second manual reminder
        var result2 = await handler.Handle(command, CancellationToken.None);
        var secondSentAt = result2.LastReminderSentAt;

        // Assert
        result2.LastReminderType.Should().Be("manual");
        secondSentAt.Should().NotBeNull();
        secondSentAt!.Value.Should().BeOnOrAfter(firstSentAt!.Value);

        await dispatcher.Received(2).DispatchAlertAsync(
            Arg.Is<Appointment>(a => a.Id == appointment.Id),
            AppointmentAlertKinds.ManualReminder,
            Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData(AppointmentStatus.Pending, true)]
    [InlineData(AppointmentStatus.Confirmed, true)]
    [InlineData(AppointmentStatus.CheckedIn, true)]
    [InlineData(AppointmentStatus.InConsultation, true)]
    [InlineData(AppointmentStatus.Completed, false)]
    [InlineData(AppointmentStatus.Cancelled, false)]
    public async Task Handle_StatusMatrix_BehavesAccordingToDomainInvariants(AppointmentStatus status, bool expectedSuccess)
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
            PatientName = "Diego Silang",
            ScheduledAt = DateTime.UtcNow.AddDays(1),
            Status = status
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new SendAppointmentReminderCommandHandler(repo, uow, _clinicContext, dispatcher);
        var command = new SendAppointmentReminderCommand(appointment.Id);

        // Act & Assert
        if (expectedSuccess)
        {
            var result = await handler.Handle(command, CancellationToken.None);
            result.Should().NotBeNull();
            result.LastReminderType.Should().Be("manual");
            result.LastReminderSentAt.Should().NotBeNull();
            await dispatcher.Received(1).DispatchAlertAsync(
                Arg.Is<Appointment>(a => a.Id == appointment.Id),
                AppointmentAlertKinds.ManualReminder,
                Arg.Any<CancellationToken>());
        }
        else
        {
            Func<Task> act = async () => await handler.Handle(command, CancellationToken.None);
            var exception = await act.Should().ThrowAsync<InvalidOperationException>();
            exception.WithMessage($"*{status}*");

            await dispatcher.DidNotReceive().DispatchAlertAsync(
                Arg.Any<Appointment>(), Arg.Any<string>(), Arg.Any<CancellationToken>());

            var persisted = await context.Appointments.FindAsync(appointment.Id);
            persisted!.LastReminderSentAt.Should().BeNull();
            persisted.LastReminderType.Should().BeNull();
        }
    }

    [Fact]
    public async Task Handle_CrossTenantIsolation_NeverDispatchesAndThrowsNotFound()
    {
        // Arrange: appointment belongs to Clinic B, but active context is Clinic A
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();

        var otherClinicId = Guid.NewGuid();
        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = otherClinicId,
            TenantId = "tenant-other",
            PatientId = Guid.NewGuid(),
            PatientName = "Antonio Luna",
            ScheduledAt = DateTime.UtcNow.AddDays(1),
            Status = AppointmentStatus.Confirmed
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new SendAppointmentReminderCommandHandler(repo, uow, _clinicContext, dispatcher);
        var command = new SendAppointmentReminderCommand(appointment.Id);

        // Act
        Func<Task> act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<NotFoundException>()
            .WithMessage($"*{appointment.Id}*");

        await dispatcher.DidNotReceive().DispatchAlertAsync(
            Arg.Any<Appointment>(), Arg.Any<string>(), Arg.Any<CancellationToken>());

        var persisted = await context.Appointments.FindAsync(appointment.Id);
        persisted!.LastReminderSentAt.Should().BeNull();
    }

    [Fact]
    public async Task Handle_NonExistentAndEmptyGuid_ThrowsNotFoundException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();
        var handler = new SendAppointmentReminderCommandHandler(repo, uow, _clinicContext, dispatcher);

        // Act & Assert for Empty Guid
        Func<Task> actEmpty = async () => await handler.Handle(new SendAppointmentReminderCommand(Guid.Empty), CancellationToken.None);
        await actEmpty.Should().ThrowAsync<NotFoundException>();

        // Act & Assert for Random Guid
        var randomId = Guid.NewGuid();
        Func<Task> actRandom = async () => await handler.Handle(new SendAppointmentReminderCommand(randomId), CancellationToken.None);
        await actRandom.Should().ThrowAsync<NotFoundException>()
            .WithMessage($"*{randomId}*");

        await dispatcher.DidNotReceive().DispatchAlertAsync(
            Arg.Any<Appointment>(), Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_EndToEndDispatcherIntegration_EnqueuesExactInteropPayload()
    {
        // Arrange: End-to-end integration between CommandHandler and real AppointmentNotificationDispatcher
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffNotificationRepo = TestDbHelper.CreateRepository<ClinicStaffNotification>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var syncPatientId = Guid.NewGuid();
        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            FirstName = "Graciano",
            LastName = "Lopez Jaena",
            PatientCode = "P-999",
            DateOfBirth = new DateOnly(1988, 12, 18),
            ContactNumber = "0917-000-1111",
            SyncPatientId = syncPatientId
        };
        await patientRepo.AddAsync(patient);

        var settings = new ClinicSettings
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            ClinicName = "Metro Health Clinic"
        };
        await settingsRepo.AddAsync(settings);

        var scheduledAt = new DateTime(2026, 11, 20, 10, 0, 0, DateTimeKind.Utc);
        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = patient.Id,
            PatientName = "Graciano Lopez Jaena",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Gregorio Del Pilar",
            ServiceType = "Cardiology",
            ScheduledAt = scheduledAt,
            DurationMinutes = 45,
            Status = AppointmentStatus.Confirmed
        };
        await apptRepo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var realDispatcher = new AppointmentNotificationDispatcher(
            patientRepo, settingsRepo, staffNotificationRepo, publisher, NullLogger<AppointmentNotificationDispatcher>.Instance);

        var handler = new SendAppointmentReminderCommandHandler(apptRepo, uow, _clinicContext, realDispatcher);
        var command = new SendAppointmentReminderCommand(appointment.Id);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.LastReminderType.Should().Be("manual");

        // Verify outbox message payload
        publisher.Received(1).Enqueue(
            InteropTypes.PatientAppointmentAlert,
            Arg.Is<Party>(p => p.Kind == PartyKind.Facility && p.FacilityId == _clinicId.ToString()),
            Arg.Is<Party>(p => p.Kind == PartyKind.Patient && p.PatientId == syncPatientId.ToString()),
            appointment.Id,
            Arg.Is<PatientAppointmentAlertPayload>(p =>
                p.AppointmentId == appointment.Id &&
                p.ClinicId == _clinicId &&
                p.ClinicName == "Metro Health Clinic" &&
                p.DoctorName == "Dr. Gregorio Del Pilar" &&
                p.ServiceType == "Cardiology" &&
                p.DurationMinutes == 45 &&
                p.AlertKind == AppointmentAlertKinds.ManualReminder &&
                p.Message.Contains("Metro Health Clinic") &&
                p.Message.Contains("Dr. Gregorio Del Pilar") &&
                p.Message.Contains("Cardiology")));
    }

    [Fact]
    public async Task Handle_EndToEndDispatcherIntegration_UnlinkedPatient_GracefullyProceeds()
    {
        // Arrange: Patient without linked mobile account (SyncPatientId == null)
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffNotificationRepo = TestDbHelper.CreateRepository<ClinicStaffNotification>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            FirstName = "Unlinked",
            LastName = "Patient",
            PatientCode = "P-998",
            DateOfBirth = new DateOnly(1990, 1, 1),
            ContactNumber = "0917-222-3333",
            SyncPatientId = null
        };
        await patientRepo.AddAsync(patient);

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = patient.Id,
            PatientName = "Unlinked Patient",
            ScheduledAt = DateTime.UtcNow.AddDays(2),
            Status = AppointmentStatus.Confirmed
        };
        await apptRepo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var realDispatcher = new AppointmentNotificationDispatcher(
            patientRepo, settingsRepo, staffNotificationRepo, publisher, NullLogger<AppointmentNotificationDispatcher>.Instance);

        var handler = new SendAppointmentReminderCommandHandler(apptRepo, uow, _clinicContext, realDispatcher);
        var command = new SendAppointmentReminderCommand(appointment.Id);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert: Outbox enqueue is skipped without error, and appointment state is still updated
        publisher.DidNotReceiveWithAnyArgs().Enqueue(
            Arg.Any<string>(), Arg.Any<Party>(), Arg.Any<Party>(), Arg.Any<Guid>(), Arg.Any<PatientAppointmentAlertPayload>());

        result.Should().NotBeNull();
        result.LastReminderType.Should().Be("manual");
        result.LastReminderSentAt.Should().NotBeNull();
    }

    [Fact]
    public async Task AppointmentsController_RemindEndpoint_ExecutesEndToEndWithPermissionsAndAttributes()
    {
        // 1. Verify class attributes
        var controllerType = typeof(AppointmentsController);
        var apiControllerAttr = controllerType.GetCustomAttribute<ApiControllerAttribute>();
        apiControllerAttr.Should().NotBeNull();

        var routeAttr = controllerType.GetCustomAttribute<RouteAttribute>();
        routeAttr.Should().NotBeNull();
        routeAttr!.Template.Should().Be("api/v1/appointments");

        // 2. Verify action method attributes
        var method = controllerType.GetMethod(
            nameof(AppointmentsController.SendAppointmentReminder),
            [typeof(Guid), typeof(CancellationToken)]);

        method.Should().NotBeNull();

        var httpPostAttr = method!.GetCustomAttribute<HttpPostAttribute>();
        httpPostAttr.Should().NotBeNull();
        httpPostAttr!.Template.Should().Be("{id:guid}/remind");

        var permissionAttr = method.GetCustomAttribute<HasPermissionAttribute>();
        permissionAttr.Should().NotBeNull();
        permissionAttr!.Permission.Should().Be(ClinicPermissions.AppointmentsManage);

        // 3. Verify execution behavior
        var sender = Substitute.For<ISender>();
        var controller = new AppointmentsController(sender);

        var appointmentId = Guid.NewGuid();
        var returnedDto = new AppointmentDto(
            Id: appointmentId,
            TenantId: _tenantId,
            ClinicId: _clinicId,
            DraftId: null,
            PatientId: Guid.NewGuid(),
            PatientName: "Test Patient",
            DoctorId: null,
            DoctorName: null,
            ScheduledAt: DateTime.UtcNow.AddDays(1),
            DurationMinutes: 30,
            Status: AppointmentStatus.Confirmed,
            ServiceType: null,
            Reason: null,
            Notes: null,
            CreatedAt: DateTime.UtcNow,
            AttachedFileIdsJson: "[]",
            ShareFieldsJson: "[]",
            SharedScopes: [],
            SharedItems: [],
            Reminder24hSent: true,
            Reminder2hSent: false,
            Reminder24hSentAt: DateTime.UtcNow.AddHours(-10),
            Reminder2hSentAt: null,
            LastReminderSentAt: DateTime.UtcNow,
            LastReminderType: "manual");

        sender.Send(Arg.Is<SendAppointmentReminderCommand>(c => c.AppointmentId == appointmentId), Arg.Any<CancellationToken>())
            .Returns(returnedDto);

        var actionResult = await controller.SendAppointmentReminder(appointmentId, CancellationToken.None);

        var okResult = actionResult.Result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeOfType<ApiResponse<AppointmentDto>>().Subject;

        response.Succeeded.Should().BeTrue();
        response.Message.Should().Be("Appointment reminder sent successfully.");
        response.Data.Should().BeEquivalentTo(returnedDto);
    }

    [Fact]
    public async Task Handle_WhenStaffNameIsNull_FallbacksToClinicStaff()
    {
        // Arrange: clinicContext has null StaffName
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);
        clinicContext.StaffName.Returns((string?)null);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Sumulong",
            ScheduledAt = DateTime.UtcNow.AddDays(1),
            Status = AppointmentStatus.Confirmed
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new SendAppointmentReminderCommandHandler(repo, uow, clinicContext, dispatcher);
        var command = new SendAppointmentReminderCommand(appointment.Id);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        var persisted = await context.Appointments.FindAsync(appointment.Id);
        persisted!.UpdatedBy.Should().Be("ClinicStaff");
    }
}

