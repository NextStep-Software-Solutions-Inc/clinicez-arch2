using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Features.Patients.Queries.GetLatestVitals;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Features.Patients;

using Patient = ClinicEz.Patient.Domain.Entities.Patient;

public sealed class GetLatestVitalsQueryHandlerTests
{
    private readonly IPatientRepository _repo = Substitute.For<IPatientRepository>();

    [Fact]
    public async Task Handle_WhenPatientNotFound_ThrowsNotFoundException()
    {
        var patientId = Guid.NewGuid();
        _repo.GetByIdAsync(patientId, Arg.Any<CancellationToken>()).Returns((Patient?)null);

        var handler = new GetLatestVitalsQueryHandler(_repo);

        var act = () => handler.Handle(new GetLatestVitalsQuery(patientId), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task Handle_WhenNoVitalsExist_ReturnsNull()
    {
        var patientId = Guid.NewGuid();
        _repo.GetByIdAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new Patient { Id = patientId });
        _repo.GetRecentVitalsAsync(patientId, 2, Arg.Any<CancellationToken>())
            .Returns(new List<VitalSigns>());

        var handler = new GetLatestVitalsQueryHandler(_repo);

        var result = await handler.Handle(new GetLatestVitalsQuery(patientId), CancellationToken.None);

        result.Should().BeNull();
    }

    [Fact]
    public async Task Handle_WithFullVitalsTelemetry_CalculatesTrendAndCategoriesAccurately()
    {
        var patientId = Guid.NewGuid();
        _repo.GetByIdAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new Patient { Id = patientId });

        var recordedAt = DateTime.UtcNow;
        var vitals = new List<VitalSigns>
        {
            new()
            {
                Id = Guid.NewGuid(),
                PatientId = patientId,
                HeartRateBpm = 72,
                SystolicBp = 118,
                DiastolicBp = 76,
                BloodGlucoseMgDl = 94m,
                SleepHours = 7.75m,
                RecordedAt = recordedAt
            },
            new()
            {
                Id = Guid.NewGuid(),
                PatientId = patientId,
                HeartRateBpm = 70,
                SystolicBp = 122,
                DiastolicBp = 80,
                RecordedAt = recordedAt.AddDays(-1)
            }
        };

        _repo.GetRecentVitalsAsync(patientId, 2, Arg.Any<CancellationToken>())
            .Returns(vitals);

        var handler = new GetLatestVitalsQueryHandler(_repo);

        var result = await handler.Handle(new GetLatestVitalsQuery(patientId), CancellationToken.None);

        result.Should().NotBeNull();
        result!.HeartRateBpm.Should().Be(72);
        result.HeartRateTrend.Should().Be("+2 bpm");
        result.SystolicBp.Should().Be(118);
        result.DiastolicBp.Should().Be(76);
        result.BpCategory.Should().Be("Optimal");
        result.BloodGlucoseMgDl.Should().Be(94m);
        result.GlucoseCategory.Should().Be("Fasting");
        result.SleepHours.Should().Be(7.75m);
        result.SleepFormatted.Should().Be("7h 45m");
        result.SleepDeepFormatted.Should().Be("2h 10m");
        result.RecordedAt.Should().Be(recordedAt);
    }

    [Theory]
    [InlineData(115, 75, "Optimal")]
    [InlineData(125, 82, "Normal")]
    [InlineData(135, 88, "Normal High")]
    [InlineData(145, 95, "Elevated")]
    public async Task Handle_BpCategories_AreEvaluatedCorrectly(int sys, int dia, string expectedCategory)
    {
        var patientId = Guid.NewGuid();
        _repo.GetByIdAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new Patient { Id = patientId });

        var vitals = new List<VitalSigns>
        {
            new()
            {
                Id = Guid.NewGuid(),
                PatientId = patientId,
                SystolicBp = sys,
                DiastolicBp = dia,
                RecordedAt = DateTime.UtcNow
            }
        };

        _repo.GetRecentVitalsAsync(patientId, 2, Arg.Any<CancellationToken>())
            .Returns(vitals);

        var handler = new GetLatestVitalsQueryHandler(_repo);

        var result = await handler.Handle(new GetLatestVitalsQuery(patientId), CancellationToken.None);

        result.Should().NotBeNull();
        result!.BpCategory.Should().Be(expectedCategory);
    }
}
