using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Triage.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class RecordTriageVitalsCommandHandlerTests
{
    [Fact]
    public async Task Handle_ValidVitals_CalculatesBmi_AndSetsQueueStatusToTriaged()
    {
        // Arrange
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var queueItemId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);

        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Pedro Penduko",
            QueueNumber = "Q-001",
            Status = QueueStatus.Waiting
        };
        await context.QueueItems.AddAsync(queueItem);
        await context.SaveChangesAsync();

        var handler = new RecordTriageVitalsCommandHandler(queueRepo, vitalsRepo, patientRepo, uow, clinicContext);

        // Height 170 cm, Weight 68 kg => BMI = 68 / (1.70 * 1.70) = 23.53
        var command = new RecordTriageVitalsCommand(
            queueItemId,
            Guid.NewGuid(),
            "Nurse Joy",
            120,
            80,
            72,
            36.6m,
            16,
            98.5m,
            170m,
            68m,
            0,
            "Patient vital signs stable"
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.SystolicBp.Should().Be(120);
        result.DiastolicBp.Should().Be(80);
        result.HeartRateBpm.Should().Be(72);
        result.TemperatureCelsius.Should().Be(36.6m);
        result.OxygenSaturationPercent.Should().Be(98.5m);
        result.Bmi.Should().Be(23.53m);

        var updatedQueue = await context.QueueItems.FirstAsync(q => q.Id == queueItemId);
        updatedQueue.Status.Should().Be(QueueStatus.Triaged);

        var savedVitals = await context.TriageVitals.FirstOrDefaultAsync(v => v.QueueItemId == queueItemId);
        savedVitals.Should().NotBeNull();
        savedVitals!.Bmi.Should().Be(23.53m);
    }
}
