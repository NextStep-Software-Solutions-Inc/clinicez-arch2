using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Appointments.Commands.PushClinicAppointments;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Features.Appointments.Commands;

public sealed class PushClinicAppointmentsCommandHandlerTests
{
    private readonly IAppointmentRepository _appointmentRepo = Substitute.For<IAppointmentRepository>();
    private readonly IUnitOfWork _uow = Substitute.For<IUnitOfWork>();

    private PushClinicAppointmentsCommandHandler CreateHandler() => new(_appointmentRepo, _uow);

    [Fact]
    public async Task Handle_NewWalkInAppointment_InsertsAppointmentAndSaves()
    {
        // Arrange
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();
        var providerId = Guid.NewGuid();

        _appointmentRepo.GetByPatientAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new List<Appointment>());
        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        var payload = new List<ClinicAppointmentDto>
        {
            new(
                appointmentId.ToString(),
                clinicId.ToString(),
                "City Health Clinic",
                new ClinicProviderSnapshot(providerId.ToString(), "Dr. Maria Cruz", "Family Medicine", null),
                "Consultation",
                DateTime.UtcNow.AddHours(2).ToString("O"),
                30,
                "Confirmed",
                "Walk-in patient",
                "Consultation",
                "General Checkup"
            )
        };

        // Act
        var result = await CreateHandler().Handle(
            new PushClinicAppointmentsCommand(patientId, clinicId, payload), CancellationToken.None);

        // Assert
        result.Should().BeTrue();

        await _appointmentRepo.Received(1).AddAsync(
            Arg.Is<Appointment>(a =>
                a.Id == appointmentId &&
                a.PatientId == patientId &&
                a.ClinicId == clinicId &&
                a.ProviderId == providerId &&
                a.Subject == "Dr. Maria Cruz" &&
                a.Status == AppointmentStatus.Confirmed &&
                a.Notes == "Walk-in patient"),
            Arg.Any<CancellationToken>());

        await _uow.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_ExistingAppointment_UpdatesAppointmentAndSaves()
    {
        // Arrange
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();
        var providerId = Guid.NewGuid();

        var existing = new Appointment
        {
            Id = appointmentId,
            PatientId = patientId,
            ClinicId = clinicId,
            Status = AppointmentStatus.Pending,
            Notes = "Initial booking"
        };

        _appointmentRepo.GetByPatientAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new List<Appointment> { existing });
        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        var payload = new List<ClinicAppointmentDto>
        {
            new(
                appointmentId.ToString(),
                clinicId.ToString(),
                "City Health Clinic",
                new ClinicProviderSnapshot(providerId.ToString(), "Dr. Maria Cruz", "Family Medicine", null),
                "Consultation",
                DateTime.UtcNow.AddHours(1).ToString("O"),
                45,
                "Confirmed",
                "Confirmed by front desk",
                "Consultation",
                "Follow up"
            )
        };

        // Act
        var result = await CreateHandler().Handle(
            new PushClinicAppointmentsCommand(patientId, clinicId, payload), CancellationToken.None);

        // Assert
        result.Should().BeTrue();
        existing.Status.Should().Be(AppointmentStatus.Confirmed);
        existing.Notes.Should().Be("Confirmed by front desk");
        existing.DurationMinutes.Should().Be(45);

        _appointmentRepo.Received(1).Update(existing);
        await _uow.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_CompletedAppointmentWithClinicalRelease_PreservesClinicalReleaseInRawJson()
    {
        // Arrange
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var appointmentId = Guid.NewGuid();
        var providerId = Guid.NewGuid();

        _appointmentRepo.GetByPatientAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new List<Appointment>());
        _uow.SaveChangesAsync(Arg.Any<CancellationToken>()).Returns(1);

        var payload = new List<ClinicAppointmentDto>
        {
            new(
                appointmentId.ToString(),
                clinicId.ToString(),
                "City Health Clinic",
                new ClinicProviderSnapshot(providerId.ToString(), "Dr. Maria Cruz", "Family Medicine", null),
                "Consultation",
                DateTime.UtcNow.ToString("O"),
                30,
                "Completed",
                "Consultation completed and signed by Dr. Maria Cruz",
                "Dr. Maria Cruz",
                "Acute Bronchitis",
                ClinicalAssessment: "Acute Bronchitis (J20.9)",
                DoctorPlan: "Rest, oral hydration, warm saline gargle.",
                PrescriptionsSummary: "Amoxicillin 500mg Capsule (1 cap TID) - Qty: 21",
                PrescriptionPublicVerificationUrl: "/api/v1/public/rx-verify/tok123"
            )
        };

        // Act
        var result = await CreateHandler().Handle(
            new PushClinicAppointmentsCommand(patientId, clinicId, payload), CancellationToken.None);

        // Assert
        result.Should().BeTrue();
        await _appointmentRepo.Received(1).AddAsync(
            Arg.Is<Appointment>(a =>
                a.Id == appointmentId &&
                a.Status == AppointmentStatus.Completed &&
                a.RawJson.Contains("Acute Bronchitis") &&
                a.RawJson.Contains("Amoxicillin") &&
                a.RawJson.Contains("tok123")),
            Arg.Any<CancellationToken>());
    }
}
