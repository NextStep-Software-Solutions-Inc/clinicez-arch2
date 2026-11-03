using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Patients.Commands.LogPatientMedication;
using ClinicEz.Patient.Application.Features.Patients.Commands.RecordPatientVitals;
using ClinicEz.Patient.Application.Features.Patients.Queries.GetPatientMedications;
using ClinicEz.Patient.Application.Features.Patients.Queries.GetPatientVitals;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Features.Patients;

using Patient = ClinicEz.Patient.Domain.Entities.Patient;

public sealed class VitalsAndMedicationTests
{
    private readonly IPatientRepository _repo = Substitute.For<IPatientRepository>();
    private readonly IUnitOfWork _uow = Substitute.For<IUnitOfWork>();

    [Fact]
    public async Task GetPatientVitals_ReturnsDtosFromRepository()
    {
        // Arrange
        var patientId = Guid.NewGuid();
        var sampleVitals = new List<VitalSigns>
        {
            new()
            {
                Id = Guid.NewGuid(),
                PatientId = patientId,
                HeartRateBpm = 72,
                SystolicBp = 120,
                DiastolicBp = 80,
                OxygenSaturationPercent = 98.5m,
                TemperatureCelsius = 36.8m,
                WeightKg = 70.0m,
                HeightCm = 175.0m,
                Bmi = 22.86m,
                RecordedAt = DateTime.UtcNow
            }
        };

        _repo.GetRecentVitalsAsync(patientId, 10, Arg.Any<CancellationToken>())
            .Returns(sampleVitals);

        var handler = new GetPatientVitalsQueryHandler(_repo);

        // Act
        var result = await handler.Handle(new GetPatientVitalsQuery(patientId, 10), CancellationToken.None);

        // Assert
        result.Should().HaveCount(1);
        result[0].HeartRateBpm.Should().Be(72);
        result[0].SystolicBp.Should().Be(120);
        result[0].DiastolicBp.Should().Be(80);
    }

    [Fact]
    public async Task RecordPatientVitals_WhenPatientExists_AddsAndSaves()
    {
        // Arrange
        var patientId = Guid.NewGuid();
        _repo.GetByIdAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new Patient { Id = patientId, FirstName = "Sarah", LastName = "Jenkins" });
        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        var handler = new RecordPatientVitalsCommandHandler(_repo, _uow);
        var request = new RecordPatientVitalsRequest(
            null, null, DateTime.UtcNow, 65.5m, 168.0m, 23.2m, 118, 76, 68, 36.5m, 99.0m, 16, 92.0m, "Nurse Joy", "Metro Health"
        );

        // Act
        var result = await handler.Handle(new RecordPatientVitalsCommand(patientId, request), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.PatientId.Should().Be(patientId);
        result.HeartRateBpm.Should().Be(68);
        result.SystolicBp.Should().Be(118);
        result.DiastolicBp.Should().Be(76);

        await _repo.Received(1).AddVitalSignsAsync(Arg.Any<VitalSigns>(), Arg.Any<CancellationToken>());
        await _uow.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task GetPatientMedications_ReturnsDtos()
    {
        // Arrange
        var patientId = Guid.NewGuid();
        var sampleMeds = new List<PatientMedication>
        {
            new()
            {
                Id = Guid.NewGuid(),
                PatientId = patientId,
                MedicationName = "Lisinopril",
                GenericName = "Lisinopril",
                Dosage = "10mg",
                Frequency = "Once Daily",
                IsCurrentlyTaking = true
            }
        };

        _repo.GetMedicationsAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(sampleMeds);

        var handler = new GetPatientMedicationsQueryHandler(_repo);

        // Act
        var result = await handler.Handle(new GetPatientMedicationsQuery(patientId), CancellationToken.None);

        // Assert
        result.Should().HaveCount(1);
        result[0].MedicationName.Should().Be("Lisinopril");
        result[0].IsCurrentlyTaking.Should().BeTrue();
    }

    [Fact]
    public async Task LogPatientMedication_WhenFound_UpdatesAndSaves()
    {
        // Arrange
        var patientId = Guid.NewGuid();
        var medicationId = Guid.NewGuid();
        var med = new PatientMedication
        {
            Id = medicationId,
            PatientId = patientId,
            MedicationName = "Omega-3",
            IsCurrentlyTaking = true
        };

        _repo.GetMedicationByIdAsync(patientId, medicationId, Arg.Any<CancellationToken>())
            .Returns(med);
        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        var handler = new LogPatientMedicationCommandHandler(_repo, _uow);

        // Act
        var result = await handler.Handle(
            new LogPatientMedicationCommand(patientId, medicationId, DateTime.UtcNow, "Taken after meal"),
            CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Id.Should().Be(medicationId);
        med.Notes.Should().Contain("Taken after meal");
        await _uow.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }
}
