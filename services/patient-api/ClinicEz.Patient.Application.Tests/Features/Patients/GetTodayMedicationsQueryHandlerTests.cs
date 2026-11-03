using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Features.Patients.Queries.GetTodayMedications;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Features.Patients;

using Patient = ClinicEz.Patient.Domain.Entities.Patient;

public sealed class GetTodayMedicationsQueryHandlerTests
{
    private readonly IPatientRepository _repo = Substitute.For<IPatientRepository>();

    [Fact]
    public async Task Handle_WhenPatientNotFound_ThrowsNotFoundException()
    {
        var patientId = Guid.NewGuid();
        _repo.GetByIdAsync(patientId, Arg.Any<CancellationToken>()).Returns((Patient?)null);

        var handler = new GetTodayMedicationsQueryHandler(_repo);

        var act = () => handler.Handle(new GetTodayMedicationsQuery(patientId), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task Handle_ReturnsActiveMedicationsWithTodayAdherence()
    {
        var patientId = Guid.NewGuid();
        _repo.GetByIdAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new Patient { Id = patientId });

        var med1Id = Guid.NewGuid();
        var med2Id = Guid.NewGuid();
        var medInactiveId = Guid.NewGuid();

        var medications = new List<PatientMedication>
        {
            new()
            {
                Id = med1Id,
                PatientId = patientId,
                MedicationName = "Lisinopril",
                Dosage = "10mg",
                Frequency = "1 tablet with breakfast",
                IsCurrentlyTaking = true
            },
            new()
            {
                Id = med2Id,
                PatientId = patientId,
                MedicationName = "Omega-3 DHA",
                Dosage = "1000mg",
                Notes = "1 softgel after dinner",
                IsCurrentlyTaking = true
            },
            new()
            {
                Id = medInactiveId,
                PatientId = patientId,
                MedicationName = "Amoxicillin",
                IsCurrentlyTaking = false
            }
        };

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var takenAt = DateTime.UtcNow.Date.AddHours(8).AddMinutes(15);
        var adherences = new List<PatientMedicationAdherence>
        {
            new()
            {
                Id = Guid.NewGuid(),
                PatientId = patientId,
                PatientMedicationId = med1Id,
                TakenAt = takenAt,
                IsTaken = true
            }
        };

        _repo.GetMedicationsAsync(patientId, Arg.Any<CancellationToken>()).Returns(medications);
        _repo.GetMedicationAdherenceForDateAsync(patientId, today, Arg.Any<CancellationToken>()).Returns(adherences);

        var handler = new GetTodayMedicationsQueryHandler(_repo);

        var result = await handler.Handle(new GetTodayMedicationsQuery(patientId, today), CancellationToken.None);

        result.Should().HaveCount(2);

        var item1 = result.FirstOrDefault(m => m.Id == med1Id);
        item1.Should().NotBeNull();
        item1!.MedicationName.Should().Be("Lisinopril");
        item1.Dosage.Should().Be("10mg");
        item1.ScheduledTime.Should().Be("8:00 AM");
        item1.IsTaken.Should().BeTrue();
        item1.TakenAt.Should().Be(takenAt);

        var item2 = result.FirstOrDefault(m => m.Id == med2Id);
        item2.Should().NotBeNull();
        item2!.MedicationName.Should().Be("Omega-3 DHA");
        item2.Dosage.Should().Be("1000mg");
        item2.ScheduledTime.Should().Be("7:00 PM");
        item2.IsTaken.Should().BeFalse();
        item2.TakenAt.Should().BeNull();
    }
}
