using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Features.Patients.Commands.LogMedicationAdherence;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Features.Patients;

using Patient = ClinicEz.Patient.Domain.Entities.Patient;

public sealed class LogMedicationAdherenceCommandHandlerTests
{
    private readonly IPatientRepository _repo = Substitute.For<IPatientRepository>();
    private readonly IUnitOfWork _uow = Substitute.For<IUnitOfWork>();

    [Fact]
    public async Task Handle_WhenPatientNotFound_ThrowsNotFoundException()
    {
        var patientId = Guid.NewGuid();
        var medicationId = Guid.NewGuid();

        _repo.GetByIdAsync(patientId, Arg.Any<CancellationToken>()).Returns((Patient?)null);

        var handler = new LogMedicationAdherenceCommandHandler(_repo, _uow);

        var act = () => handler.Handle(new LogMedicationAdherenceCommand(patientId, medicationId), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task Handle_WhenMedicationNotFound_ThrowsNotFoundException()
    {
        var patientId = Guid.NewGuid();
        var medicationId = Guid.NewGuid();

        _repo.GetByIdAsync(patientId, Arg.Any<CancellationToken>()).Returns(new Patient { Id = patientId });
        _repo.GetMedicationByIdAsync(patientId, medicationId, Arg.Any<CancellationToken>()).Returns((PatientMedication?)null);

        var handler = new LogMedicationAdherenceCommandHandler(_repo, _uow);

        var act = () => handler.Handle(new LogMedicationAdherenceCommand(patientId, medicationId), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task Handle_WhenNoPriorAdherence_CreatesNewAdherenceAndSaves()
    {
        var patientId = Guid.NewGuid();
        var medicationId = Guid.NewGuid();
        var takenAt = DateTime.UtcNow;

        _repo.GetByIdAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new Patient { Id = patientId });
        _repo.GetMedicationByIdAsync(patientId, medicationId, Arg.Any<CancellationToken>())
            .Returns(new PatientMedication { Id = medicationId, PatientId = patientId });

        _repo.GetMedicationAdherenceForDateAsync(patientId, DateOnly.FromDateTime(takenAt), Arg.Any<CancellationToken>())
            .Returns(new List<PatientMedicationAdherence>());

        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        var handler = new LogMedicationAdherenceCommandHandler(_repo, _uow);

        var result = await handler.Handle(
            new LogMedicationAdherenceCommand(patientId, medicationId, takenAt, "Taken with juice"),
            CancellationToken.None);

        result.Should().BeTrue();
        await _repo.Received(1).AddMedicationAdherenceAsync(
            Arg.Is<PatientMedicationAdherence>(a =>
                a.PatientId == patientId &&
                a.PatientMedicationId == medicationId &&
                a.TakenAt == takenAt &&
                a.IsTaken == true &&
                a.Notes == "Taken with juice"),
            Arg.Any<CancellationToken>());
        await _uow.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_WhenPriorAdherenceExists_UpdatesExistingAndSaves()
    {
        var patientId = Guid.NewGuid();
        var medicationId = Guid.NewGuid();
        var takenAt = DateTime.UtcNow;

        _repo.GetByIdAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new Patient { Id = patientId });
        _repo.GetMedicationByIdAsync(patientId, medicationId, Arg.Any<CancellationToken>())
            .Returns(new PatientMedication { Id = medicationId, PatientId = patientId });

        var existing = new PatientMedicationAdherence
        {
            Id = Guid.NewGuid(),
            PatientId = patientId,
            PatientMedicationId = medicationId,
            TakenAt = takenAt.AddMinutes(-30),
            IsTaken = false
        };

        _repo.GetMedicationAdherenceForDateAsync(patientId, DateOnly.FromDateTime(takenAt), Arg.Any<CancellationToken>())
            .Returns(new List<PatientMedicationAdherence> { existing });

        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        var handler = new LogMedicationAdherenceCommandHandler(_repo, _uow);

        var result = await handler.Handle(
            new LogMedicationAdherenceCommand(patientId, medicationId, takenAt, "Updated note"),
            CancellationToken.None);

        result.Should().BeTrue();
        existing.IsTaken.Should().BeTrue();
        existing.TakenAt.Should().Be(takenAt);
        existing.Notes.Should().Be("Updated note");
        await _repo.DidNotReceive().AddMedicationAdherenceAsync(Arg.Any<PatientMedicationAdherence>(), Arg.Any<CancellationToken>());
        await _uow.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }
}
