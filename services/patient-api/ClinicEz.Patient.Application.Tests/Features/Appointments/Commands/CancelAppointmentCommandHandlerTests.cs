using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Features.Appointments.Commands.CancelAppointment;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Features.Appointments.Commands;

public sealed class CancelAppointmentCommandHandlerTests
{
    private readonly IAppointmentRepository _appointmentRepo = Substitute.For<IAppointmentRepository>();
    private readonly IBookingDraftRepository _draftRepo = Substitute.For<IBookingDraftRepository>();
    private readonly IClinicRepository _clinicRepo = Substitute.For<IClinicRepository>();
    private readonly IPatientRepository _patientRepo = Substitute.For<IPatientRepository>();
    private readonly IUnitOfWork _uow = Substitute.For<IUnitOfWork>();

    private readonly Guid _patientId = Guid.NewGuid();
    private readonly Guid _appointmentId = Guid.NewGuid();
    private readonly Guid _clinicId = Guid.NewGuid();

    public CancelAppointmentCommandHandlerTests()
    {
        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);
    }

    [Fact]
    public async Task Handle_WhenPatientNotFound_ThrowsNotFoundException()
    {
        _patientRepo.GetByIdAsync(_patientId, Arg.Any<CancellationToken>()).Returns((Domain.Entities.Patient?)null);
        var handler = new CancelAppointmentCommandHandler(_appointmentRepo, _draftRepo, _clinicRepo, _patientRepo, _uow);
        var cmd = new CancelAppointmentCommand(_patientId, _appointmentId, "Change of plans");

        Func<Task> act = () => handler.Handle(cmd, CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>()
            .WithMessage($"*{_patientId}*");
    }

    [Fact]
    public async Task Handle_WhenAppointmentBelongsToDifferentPatient_ThrowsForbiddenException()
    {
        _patientRepo.GetByIdAsync(_patientId, Arg.Any<CancellationToken>())
            .Returns(new Domain.Entities.Patient { Id = _patientId, FirstName = "Sarah", LastName = "Jenkins" });

        var otherPatientAppt = new Appointment
        {
            Id = _appointmentId,
            PatientId = Guid.NewGuid(),
            ClinicId = _clinicId,
            Status = AppointmentStatus.Confirmed
        };
        _appointmentRepo.GetByIdAsync(_appointmentId, Arg.Any<CancellationToken>()).Returns(otherPatientAppt);

        var handler = new CancelAppointmentCommandHandler(_appointmentRepo, _draftRepo, _clinicRepo, _patientRepo, _uow);
        var cmd = new CancelAppointmentCommand(_patientId, _appointmentId, "Change of plans");

        Func<Task> act = () => handler.Handle(cmd, CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task Handle_WhenAppointmentFound_SetsStatusToCancelled()
    {
        _patientRepo.GetByIdAsync(_patientId, Arg.Any<CancellationToken>())
            .Returns(new Domain.Entities.Patient { Id = _patientId, FirstName = "Sarah", LastName = "Jenkins" });

        var appt = new Appointment
        {
            Id = _appointmentId,
            PatientId = _patientId,
            ClinicId = _clinicId,
            Status = AppointmentStatus.Confirmed,
            ScheduledAt = DateTime.UtcNow.AddDays(1),
            DurationMinutes = 45,
            ServiceType = "Cardiology Follow-up"
        };
        _appointmentRepo.GetByIdAsync(_appointmentId, Arg.Any<CancellationToken>()).Returns(appt);
        _clinicRepo.GetByIdAsync(_clinicId, Arg.Any<CancellationToken>())
            .Returns(new Clinic { Id = _clinicId, Name = "Metro Cardiology Clinic" });

        var handler = new CancelAppointmentCommandHandler(_appointmentRepo, _draftRepo, _clinicRepo, _patientRepo, _uow);
        var cmd = new CancelAppointmentCommand(_patientId, _appointmentId, "Personal emergency");

        var result = await handler.Handle(cmd, CancellationToken.None);

        result.Status.Should().Be("Cancelled");
        result.Notes.Should().Contain("Personal emergency");
        appt.Status.Should().Be(AppointmentStatus.Cancelled);
        _appointmentRepo.Received(1).Update(appt);
        await _uow.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenAppointmentNotInApptRepo_ChecksDraftRepoAndDeletesDraft()
    {
        _patientRepo.GetByIdAsync(_patientId, Arg.Any<CancellationToken>())
            .Returns(new Domain.Entities.Patient { Id = _patientId, FirstName = "Sarah", LastName = "Jenkins" });

        _appointmentRepo.GetByIdAsync(_appointmentId, Arg.Any<CancellationToken>()).Returns((Appointment?)null);

        var draft = new BookingDraft
        {
            Id = _appointmentId,
            PatientId = _patientId,
            ClinicId = _clinicId,
            PreferredDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(2)),
            PreferredTime = "14:00",
            Reason = "General Consultation"
        };
        _draftRepo.GetByIdAsync(_appointmentId, Arg.Any<CancellationToken>()).Returns(draft);
        _clinicRepo.GetByIdAsync(_clinicId, Arg.Any<CancellationToken>())
            .Returns(new Clinic { Id = _clinicId, Name = "Summit Health" });

        var handler = new CancelAppointmentCommandHandler(_appointmentRepo, _draftRepo, _clinicRepo, _patientRepo, _uow);
        var cmd = new CancelAppointmentCommand(_patientId, _appointmentId, "No longer needed");

        var result = await handler.Handle(cmd, CancellationToken.None);

        result.Status.Should().Be("Cancelled");
        _draftRepo.Received(1).Delete(draft);
        await _uow.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }
}
