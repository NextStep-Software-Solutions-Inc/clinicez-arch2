using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Appointments;
using ClinicEz.Clinic.Application.Features.Appointments.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Appointments;

public sealed class SendAppointmentReminderCommandTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "test-tenant-remind";
    private readonly IClinicContext _clinicContext;

    public SendAppointmentReminderCommandTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffName.Returns("Nurse Joy");
    }

    [Fact]
    public async Task Handle_WhenAppointmentValid_DispatchesAlertUpdatesTimestampsAndReturnsDto()
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
            PatientName = "Jose Rizal",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Blumentritt",
            ScheduledAt = DateTime.UtcNow.AddDays(2),
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed,
            ServiceType = "General Consultation"
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new SendAppointmentReminderCommandHandler(repo, uow, _clinicContext, dispatcher);
        var command = new SendAppointmentReminderCommand(appointment.Id);

        // Act
        var beforeTime = DateTime.UtcNow.AddSeconds(-1);
        var result = await handler.Handle(command, CancellationToken.None);
        var afterTime = DateTime.UtcNow.AddSeconds(1);

        // Assert
        result.Should().NotBeNull();
        result.Id.Should().Be(appointment.Id);
        result.LastReminderType.Should().Be("manual");
        result.LastReminderSentAt.Should().NotBeNull();
        result.LastReminderSentAt.Value.Should().BeOnOrAfter(beforeTime).And.BeOnOrBefore(afterTime);

        // Verify dispatcher was invoked
        await dispatcher.Received(1).DispatchAlertAsync(
            Arg.Is<Appointment>(a => a.Id == appointment.Id),
            AppointmentAlertKinds.ManualReminder,
            Arg.Any<CancellationToken>());

        // Verify entity persistence in DB
        var reloaded = await context.Appointments.FindAsync(appointment.Id);
        reloaded.Should().NotBeNull();
        reloaded!.LastReminderType.Should().Be("manual");
        reloaded.LastReminderSentAt.Should().NotBeNull();
        reloaded.UpdatedBy.Should().Be("Nurse Joy");
    }

    [Fact]
    public async Task Handle_WhenAppointmentNotFound_ThrowsNotFoundException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();

        var handler = new SendAppointmentReminderCommandHandler(repo, uow, _clinicContext, dispatcher);
        var nonExistentId = Guid.NewGuid();
        var command = new SendAppointmentReminderCommand(nonExistentId);

        // Act
        Func<Task> act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<NotFoundException>()
            .WithMessage($"*{nonExistentId}*");
        await dispatcher.DidNotReceive().DispatchAlertAsync(
            Arg.Any<Appointment>(), Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenBelongsToDifferentClinic_ThrowsNotFoundException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var dispatcher = Substitute.For<IAppointmentNotificationDispatcher>();

        var otherClinicId = Guid.NewGuid();
        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = otherClinicId,
            TenantId = "different-tenant",
            PatientId = Guid.NewGuid(),
            PatientName = "Andres Bonifacio",
            ScheduledAt = DateTime.UtcNow.AddDays(1),
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new SendAppointmentReminderCommandHandler(repo, uow, _clinicContext, dispatcher);
        var command = new SendAppointmentReminderCommand(appointment.Id);

        // Act
        Func<Task> act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<NotFoundException>();
        await dispatcher.DidNotReceive().DispatchAlertAsync(
            Arg.Any<Appointment>(), Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenAppointmentCancelled_ThrowsInvalidOperationException()
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
            PatientName = "Apolinario Mabini",
            ScheduledAt = DateTime.UtcNow.AddDays(1),
            DurationMinutes = 30,
            Status = AppointmentStatus.Cancelled
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new SendAppointmentReminderCommandHandler(repo, uow, _clinicContext, dispatcher);
        var command = new SendAppointmentReminderCommand(appointment.Id);

        // Act
        Func<Task> act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*Cancelled*");
        await dispatcher.DidNotReceive().DispatchAlertAsync(
            Arg.Any<Appointment>(), Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenAppointmentCompleted_ThrowsInvalidOperationException()
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
            PatientName = "Marcelo Del Pilar",
            ScheduledAt = DateTime.UtcNow.AddDays(-1),
            DurationMinutes = 30,
            Status = AppointmentStatus.Completed
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new SendAppointmentReminderCommandHandler(repo, uow, _clinicContext, dispatcher);
        var command = new SendAppointmentReminderCommand(appointment.Id);

        // Act
        Func<Task> act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*Completed*");
        await dispatcher.DidNotReceive().DispatchAlertAsync(
            Arg.Any<Appointment>(), Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenDispatcherIsNull_StillUpdatesTimestampsAndReturnsDto()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<Appointment>(context, sieve);

        var appointment = new Appointment
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Emilio Aguinaldo",
            ScheduledAt = DateTime.UtcNow.AddDays(3),
            DurationMinutes = 30,
            Status = AppointmentStatus.Confirmed
        };
        await repo.AddAsync(appointment);
        await uow.SaveChangesAsync();

        var handler = new SendAppointmentReminderCommandHandler(repo, uow, _clinicContext, dispatcher: null);
        var command = new SendAppointmentReminderCommand(appointment.Id);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.LastReminderType.Should().Be("manual");
        result.LastReminderSentAt.Should().NotBeNull();
    }
}
