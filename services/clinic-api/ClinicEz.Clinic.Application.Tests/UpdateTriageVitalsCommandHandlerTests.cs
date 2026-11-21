using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Queue.DTOs;
using ClinicEz.Clinic.Application.Features.Triage.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class UpdateTriageVitalsCommandHandlerTests
{
    private (Guid clinicId, string tenantId, Guid queueItemId, Guid patientId, IClinicContext clinicContext) CreateTestIds()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_test";
        var queueItemId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        clinicContext.StaffId.Returns(Guid.NewGuid());

        return (clinicId, tenantId, queueItemId, patientId, clinicContext);
    }

    [Fact]
    public async Task Handle_UpdatesExistingVitalsInPlace_LeavesCountAtOne()
    {
        // Arrange
        var (clinicId, tenantId, queueItemId, patientId, clinicContext) = CreateTestIds();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var existingVitalsId = Guid.NewGuid();
        var existingVitals = new PatientVitals
        {
            Id = existingVitalsId,
            TenantId = tenantId,
            ClinicId = clinicId,
            QueueItemId = queueItemId,
            PatientId = patientId,
            SystolicBp = 120,
            DiastolicBp = 80,
            HeartRateBpm = 72,
            TemperatureCelsius = 36.5m,
            HeightCm = 170m,
            WeightKg = 70m,
            Bmi = 24.22m,
            PainScore = 2,
            Notes = "Initial triage notes"
        };

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Maria Clara",
            QueueNumber = "Q-001",
            Status = QueueStatus.Triaged,
            Priority = QueuePriority.Routine,
            PatientVitals = existingVitals
        };

        await context.QueueItems.AddAsync(queueItem);
        await context.PatientVitals.AddAsync(existingVitals);
        await context.SaveChangesAsync();

        var handler = new UpdateTriageVitalsCommandHandler(queueRepo, vitalsRepo, patientRepo, uow, clinicContext);

        var command = new UpdateTriageVitalsCommand(
            QueueItemId: queueItemId,
            NurseId: Guid.NewGuid(),
            RecordedByNurseName: "Nurse Maria",
            SystolicBp: 130,
            DiastolicBp: 85,
            HeartRateBpm: 80,
            TemperatureCelsius: 36.8m,
            RespiratoryRateBreathsPerMin: 18,
            OxygenSaturationPercent: 99m,
            HeightCm: 170m,
            WeightKg: 70m,
            PainScore: 1,
            Notes: "Updated triage notes after rest"
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Id.Should().Be(existingVitalsId, "In-place update must preserve existing PatientVitals.Id");
        result.SystolicBp.Should().Be(130);
        result.DiastolicBp.Should().Be(85);
        result.HeartRateBpm.Should().Be(80);
        result.Notes.Should().Be("Updated triage notes after rest");

        // Database row count for this queue item must remain exactly 1 (zero duplicate rows)
        var vitalsCount = await context.PatientVitals.CountAsync(v => v.QueueItemId == queueItemId);
        vitalsCount.Should().Be(1, "Zero duplicate rows should be created on update");

        var updatedEntity = await context.PatientVitals.FirstAsync(v => v.QueueItemId == queueItemId);
        updatedEntity.Id.Should().Be(existingVitalsId);
        updatedEntity.SystolicBp.Should().Be(130);
        updatedEntity.UpdatedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task Handle_WhenQueueTicketNotFound_ThrowsNotFoundException()
    {
        // Arrange
        var (clinicId, tenantId, queueItemId, patientId, clinicContext) = CreateTestIds();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var handler = new UpdateTriageVitalsCommandHandler(queueRepo, vitalsRepo, patientRepo, uow, clinicContext);
        var command = new UpdateTriageVitalsCommand(
            QueueItemId: Guid.NewGuid(), // Non-existent ID
            NurseId: null,
            RecordedByNurseName: null,
            SystolicBp: 120,
            DiastolicBp: 80,
            HeartRateBpm: 70,
            TemperatureCelsius: 36.5m,
            RespiratoryRateBreathsPerMin: null,
            OxygenSaturationPercent: null,
            HeightCm: null,
            WeightKg: null,
            PainScore: null,
            Notes: null
        );

        // Act & Assert
        var act = async () => await handler.Handle(command, CancellationToken.None);
        var ex = await act.Should().ThrowAsync<NotFoundException>();
        ex.Which.Message.Should().Contain("not found in this clinic");
    }

    [Fact]
    public async Task Handle_WhenNoVitalsExistForTicket_ThrowsNotFoundException()
    {
        // Arrange
        var (clinicId, tenantId, queueItemId, patientId, clinicContext) = CreateTestIds();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Crisostomo Ibarra",
            QueueNumber = "Q-002",
            Status = QueueStatus.Waiting,
            PatientVitals = null // No vitals recorded yet
        };
        await context.QueueItems.AddAsync(queueItem);
        await context.SaveChangesAsync();

        var handler = new UpdateTriageVitalsCommandHandler(queueRepo, vitalsRepo, patientRepo, uow, clinicContext);
        var command = new UpdateTriageVitalsCommand(
            QueueItemId: queueItemId,
            NurseId: null,
            RecordedByNurseName: null,
            SystolicBp: 120,
            DiastolicBp: 80,
            HeartRateBpm: 70,
            TemperatureCelsius: 36.5m,
            RespiratoryRateBreathsPerMin: null,
            OxygenSaturationPercent: null,
            HeightCm: null,
            WeightKg: null,
            PainScore: null,
            Notes: null
        );

        // Act & Assert
        var act = async () => await handler.Handle(command, CancellationToken.None);
        var ex = await act.Should().ThrowAsync<NotFoundException>();
        ex.Which.Message.Should().Contain("No triage vitals found to update");
    }

    [Fact]
    public async Task Handle_PartialUpdate_PreservesUntouchedFields()
    {
        // Arrange
        var (clinicId, tenantId, queueItemId, patientId, clinicContext) = CreateTestIds();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var existingVitals = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            QueueItemId = queueItemId,
            PatientId = patientId,
            SystolicBp = 120,
            DiastolicBp = 80,
            HeartRateBpm = 70,
            TemperatureCelsius = 36.5m,
            RespiratoryRateBreathsPerMin = 16,
            OxygenSaturationPercent = 98m,
            HeightCm = 165m,
            WeightKg = 60m,
            Bmi = 22.04m,
            PainScore = 4,
            Notes = "Original untouched notes",
            VisualAcuityLeft = "20/20",
            VisualAcuityRight = "20/25",
            PreAssessmentNotes = "Untouched pre-assessment notes"
        };

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Elias",
            QueueNumber = "Q-003",
            Status = QueueStatus.Triaged,
            PatientVitals = existingVitals
        };

        await context.QueueItems.AddAsync(queueItem);
        await context.PatientVitals.AddAsync(existingVitals);
        await context.SaveChangesAsync();

        var handler = new UpdateTriageVitalsCommandHandler(queueRepo, vitalsRepo, patientRepo, uow, clinicContext);

        // Staff updates ONLY HeartRateBpm; all other fields omitted / null
        var command = new UpdateTriageVitalsCommand(
            QueueItemId: queueItemId,
            NurseId: null,
            RecordedByNurseName: null,
            SystolicBp: null,
            DiastolicBp: null,
            HeartRateBpm: 85,
            TemperatureCelsius: null,
            RespiratoryRateBreathsPerMin: null,
            OxygenSaturationPercent: null,
            HeightCm: null,
            WeightKg: null,
            PainScore: null,
            Notes: null,
            VisualAcuityLeft: null,
            VisualAcuityRight: null,
            PreAssessmentNotes: null
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert: Heart rate updated, all other fields preserved
        result.HeartRateBpm.Should().Be(85);
        result.SystolicBp.Should().Be(120);
        result.DiastolicBp.Should().Be(80);
        result.TemperatureCelsius.Should().Be(36.5m);
        result.RespiratoryRateBreathsPerMin.Should().Be(16);
        result.OxygenSaturationPercent.Should().Be(98m);
        result.HeightCm.Should().Be(165m);
        result.WeightKg.Should().Be(60m);
        result.Bmi.Should().Be(22.04m);
        result.PainScore.Should().Be(4);
        result.Notes.Should().Be("Original untouched notes");
        result.VisualAcuityLeft.Should().Be("20/20");
        result.VisualAcuityRight.Should().Be("20/25");
        result.PreAssessmentNotes.Should().Be("Untouched pre-assessment notes");
    }

    [Fact]
    public async Task Handle_EmptyStringClearsOptionalTextFields_WhileNullPreserves()
    {
        // Arrange
        var (clinicId, tenantId, queueItemId, patientId, clinicContext) = CreateTestIds();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var existingVitals = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            QueueItemId = queueItemId,
            PatientId = patientId,
            Notes = "Existing notes to clear",
            VisualAcuityLeft = "20/40",
            VisualAcuityRight = "20/50",
            PreAssessmentNotes = "Existing pre-assessment to keep"
        };

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Sisa",
            QueueNumber = "Q-004",
            Status = QueueStatus.Triaged,
            PatientVitals = existingVitals
        };

        await context.QueueItems.AddAsync(queueItem);
        await context.PatientVitals.AddAsync(existingVitals);
        await context.SaveChangesAsync();

        var handler = new UpdateTriageVitalsCommandHandler(queueRepo, vitalsRepo, patientRepo, uow, clinicContext);

        // Command submits empty string for Notes and whitespace for VisualAcuityLeft (should clear to null)
        // Command submits null for PreAssessmentNotes (should preserve)
        var command = new UpdateTriageVitalsCommand(
            QueueItemId: queueItemId,
            NurseId: null,
            RecordedByNurseName: null,
            SystolicBp: null,
            DiastolicBp: null,
            HeartRateBpm: null,
            TemperatureCelsius: null,
            RespiratoryRateBreathsPerMin: null,
            OxygenSaturationPercent: null,
            HeightCm: null,
            WeightKg: null,
            PainScore: null,
            Notes: "",
            VisualAcuityLeft: "   ",
            VisualAcuityRight: null,
            PreAssessmentNotes: null
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Notes.Should().BeNull("Empty string must clear optional text to null");
        result.VisualAcuityLeft.Should().BeNull("Whitespace-only string must clear to null");
        result.VisualAcuityRight.Should().Be("20/50", "Null should preserve existing value");
        result.PreAssessmentNotes.Should().Be("Existing pre-assessment to keep", "Null must preserve existing text");
    }

    [Fact]
    public async Task Handle_ZeroPainScore_PreservedCorrectly()
    {
        // Arrange
        var (clinicId, tenantId, queueItemId, patientId, clinicContext) = CreateTestIds();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var existingVitals = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            QueueItemId = queueItemId,
            PatientId = patientId,
            PainScore = 7
        };

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Basilio",
            QueueNumber = "Q-005",
            Status = QueueStatus.Triaged,
            PatientVitals = existingVitals
        };

        await context.QueueItems.AddAsync(queueItem);
        await context.PatientVitals.AddAsync(existingVitals);
        await context.SaveChangesAsync();

        var handler = new UpdateTriageVitalsCommandHandler(queueRepo, vitalsRepo, patientRepo, uow, clinicContext);

        // Update pain score to 0
        var command = new UpdateTriageVitalsCommand(
            QueueItemId: queueItemId,
            NurseId: null,
            RecordedByNurseName: null,
            SystolicBp: null,
            DiastolicBp: null,
            HeartRateBpm: null,
            TemperatureCelsius: null,
            RespiratoryRateBreathsPerMin: null,
            OxygenSaturationPercent: null,
            HeightCm: null,
            WeightKg: null,
            PainScore: 0,
            Notes: null
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.PainScore.Should().Be(0, "Pain score of 0 is a valid clinical metric and must be preserved");

        var dbVitals = await context.PatientVitals.FirstAsync(v => v.QueueItemId == queueItemId);
        dbVitals.PainScore.Should().Be(0);
    }

    [Fact]
    public async Task Handle_RecalculatesBmiAndZScores_OnHeightWeightChange()
    {
        // Arrange
        var (clinicId, tenantId, queueItemId, patientId, clinicContext) = CreateTestIds();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var patient = new Patient
        {
            Id = patientId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = "PAT-2026-00001",
            FirstName = "Totoy",
            LastName = "Bibo",
            DateOfBirth = DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(-24)),
            Sex = BiologicalSex.Male,
            ContactNumber = "09171234567"
        };
        await context.Patients.AddAsync(patient);

        var existingVitals = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            QueueItemId = queueItemId,
            PatientId = patientId,
            HeightCm = 160m,
            WeightKg = 64m,
            Bmi = 25.00m,
            ZScoreWeightForAge = 0.5m
        };

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Totoy Bibo",
            QueueNumber = "Q-006",
            Status = QueueStatus.Triaged,
            PatientVitals = existingVitals
        };

        await context.QueueItems.AddAsync(queueItem);
        await context.PatientVitals.AddAsync(existingVitals);
        await context.SaveChangesAsync();

        var zScoreCalc = Substitute.For<IWhoZScoreCalculator>();
        zScoreCalc.Calculate(Arg.Any<DateOnly>(), Arg.Any<string>(), 160m, 80m, Arg.Any<bool>(), Arg.Any<DateOnly?>())
            .Returns(new WhoZScoreEvaluation(24, 160m, 2.1m, 1.5m, 1.8m, "Overweight", "OVERWEIGHT", "Above normal range"));

        var handler = new UpdateTriageVitalsCommandHandler(queueRepo, vitalsRepo, patientRepo, uow, clinicContext, zScoreCalc);

        // Update WeightKg to 80 kg with unchanged HeightCm 160 cm -> BMI = 80 / (1.6 * 1.6) = 31.25
        var command = new UpdateTriageVitalsCommand(
            QueueItemId: queueItemId,
            NurseId: null,
            RecordedByNurseName: null,
            SystolicBp: null,
            DiastolicBp: null,
            HeartRateBpm: null,
            TemperatureCelsius: null,
            RespiratoryRateBreathsPerMin: null,
            OxygenSaturationPercent: null,
            HeightCm: null,
            WeightKg: 80m,
            PainScore: null,
            Notes: null
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Bmi.Should().Be(31.25m, "BMI must be recalculated when weight changes");
        result.ZScoreWeightForAge.Should().Be(2.1m);
        result.GrowthZScoreCategory.Should().Be("Overweight");
    }

    [Fact]
    public async Task Handle_ClearsStaleZScoresAndBmi_WhenHeightOrWeightCleared()
    {
        // Arrange
        var (clinicId, tenantId, queueItemId, patientId, clinicContext) = CreateTestIds();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var existingVitals = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            QueueItemId = queueItemId,
            PatientId = patientId,
            HeightCm = 100m,
            WeightKg = 15m,
            Bmi = 15.00m,
            ZScoreWeightForAge = 0.5m,
            ZScoreLengthForAge = 0.2m,
            ZScoreWeightForLength = 0.3m,
            GrowthZScoreCategory = "Normal",
            GrowthZScoreCode = "NORMAL"
        };

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Nene",
            QueueNumber = "Q-007",
            Status = QueueStatus.Triaged,
            PatientVitals = existingVitals
        };

        await context.QueueItems.AddAsync(queueItem);
        await context.PatientVitals.AddAsync(existingVitals);
        await context.SaveChangesAsync();

        var handler = new UpdateTriageVitalsCommandHandler(queueRepo, vitalsRepo, patientRepo, uow, clinicContext);

        // Clear height via ClearHeight = true
        var command = new UpdateTriageVitalsCommand(
            QueueItemId: queueItemId,
            NurseId: null,
            RecordedByNurseName: null,
            SystolicBp: null,
            DiastolicBp: null,
            HeartRateBpm: null,
            TemperatureCelsius: null,
            RespiratoryRateBreathsPerMin: null,
            OxygenSaturationPercent: null,
            HeightCm: null,
            WeightKg: null,
            PainScore: null,
            Notes: null,
            ClearHeight: true
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert: Stale Z-scores and BMI cleared
        result.HeightCm.Should().BeNull();
        result.Bmi.Should().BeNull("BMI must be cleared when height is cleared");
        result.ZScoreWeightForAge.Should().BeNull("Z-scores must be cleared when height is cleared");
        result.ZScoreLengthForAge.Should().BeNull();
        result.ZScoreWeightForLength.Should().BeNull();
        result.GrowthZScoreCategory.Should().BeNull();
        result.GrowthZScoreCode.Should().BeNull();
    }

    [Theory]
    [InlineData(QueueStatus.InConsultation)]
    [InlineData(QueueStatus.OnHold)]
    [InlineData(QueueStatus.ReEvaluation)]
    [InlineData(QueueStatus.PendingProcedure)]
    [InlineData(QueueStatus.Completed)]
    [InlineData(QueueStatus.Cancelled)]
    [InlineData(QueueStatus.NoShow)]
    public async Task Handle_PreservesNonWaitingQueueStatus(QueueStatus currentStatus)
    {
        // Arrange
        var (clinicId, tenantId, queueItemId, patientId, clinicContext) = CreateTestIds();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var existingVitals = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            QueueItemId = queueItemId,
            PatientId = patientId,
            SystolicBp = 120,
            DiastolicBp = 80
        };

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Kapitan Tiago",
            QueueNumber = "Q-008",
            Status = currentStatus,
            PatientVitals = existingVitals
        };

        await context.QueueItems.AddAsync(queueItem);
        await context.PatientVitals.AddAsync(existingVitals);
        await context.SaveChangesAsync();

        var handler = new UpdateTriageVitalsCommandHandler(queueRepo, vitalsRepo, patientRepo, uow, clinicContext);

        var command = new UpdateTriageVitalsCommand(
            QueueItemId: queueItemId,
            NurseId: null,
            RecordedByNurseName: null,
            SystolicBp: 125,
            DiastolicBp: 82,
            HeartRateBpm: null,
            TemperatureCelsius: null,
            RespiratoryRateBreathsPerMin: null,
            OxygenSaturationPercent: null,
            HeightCm: null,
            WeightKg: null,
            PainScore: null,
            Notes: null
        );

        // Act
        await handler.Handle(command, CancellationToken.None);

        // Assert: QueueItem status must remain unchanged!
        var dbQueueItem = await context.QueueItems.FirstAsync(q => q.Id == queueItemId);
        dbQueueItem.Status.Should().Be(currentStatus, $"Status {currentStatus} must be preserved and not regressed to Triaged");
    }

    [Fact]
    public async Task Handle_TransitionsWaitingToTriaged()
    {
        // Arrange
        var (clinicId, tenantId, queueItemId, patientId, clinicContext) = CreateTestIds();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var existingVitals = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            QueueItemId = queueItemId,
            PatientId = patientId,
            SystolicBp = 120,
            DiastolicBp = 80
        };

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Don Custodio",
            QueueNumber = "Q-009",
            Status = QueueStatus.Waiting, // Waiting
            PatientVitals = existingVitals
        };

        await context.QueueItems.AddAsync(queueItem);
        await context.PatientVitals.AddAsync(existingVitals);
        await context.SaveChangesAsync();

        var handler = new UpdateTriageVitalsCommandHandler(queueRepo, vitalsRepo, patientRepo, uow, clinicContext);

        var command = new UpdateTriageVitalsCommand(
            QueueItemId: queueItemId,
            NurseId: null,
            RecordedByNurseName: null,
            SystolicBp: 120,
            DiastolicBp: 80,
            HeartRateBpm: 75,
            TemperatureCelsius: null,
            RespiratoryRateBreathsPerMin: null,
            OxygenSaturationPercent: null,
            HeightCm: null,
            WeightKg: null,
            PainScore: null,
            Notes: null
        );

        // Act
        await handler.Handle(command, CancellationToken.None);

        // Assert: Waiting transitioned to Triaged
        var dbQueueItem = await context.QueueItems.FirstAsync(q => q.Id == queueItemId);
        dbQueueItem.Status.Should().Be(QueueStatus.Triaged);
    }

    [Fact]
    public async Task Handle_UpdatesQueuePriorityWhenProvided()
    {
        // Arrange
        var (clinicId, tenantId, queueItemId, patientId, clinicContext) = CreateTestIds();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var existingVitals = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            QueueItemId = queueItemId,
            PatientId = patientId,
            SystolicBp = 120,
            DiastolicBp = 80
        };

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Isagani",
            QueueNumber = "Q-010",
            Priority = QueuePriority.Routine,
            Status = QueueStatus.Triaged,
            PatientVitals = existingVitals
        };

        await context.QueueItems.AddAsync(queueItem);
        await context.PatientVitals.AddAsync(existingVitals);
        await context.SaveChangesAsync();

        var handler = new UpdateTriageVitalsCommandHandler(queueRepo, vitalsRepo, patientRepo, uow, clinicContext);

        var command = new UpdateTriageVitalsCommand(
            QueueItemId: queueItemId,
            NurseId: null,
            RecordedByNurseName: null,
            SystolicBp: null,
            DiastolicBp: null,
            HeartRateBpm: null,
            TemperatureCelsius: null,
            RespiratoryRateBreathsPerMin: null,
            OxygenSaturationPercent: null,
            HeightCm: null,
            WeightKg: null,
            PainScore: null,
            Notes: null,
            Priority: QueuePriority.Urgent
        );

        // Act
        await handler.Handle(command, CancellationToken.None);

        // Assert
        var dbQueueItem = await context.QueueItems.FirstAsync(q => q.Id == queueItemId);
        dbQueueItem.Priority.Should().Be(QueuePriority.Urgent);
    }

    [Fact]
    public void FormatVitalsSummary_HarmonizedFormatting_AcrossNullAndFullFields()
    {
        // 1. Full vitals with all fields
        var fullVitals = new PatientVitals
        {
            TenantId = "tenant_test",
            SystolicBp = 120,
            DiastolicBp = 80,
            HeartRateBpm = 72,
            RespiratoryRateBreathsPerMin = 16,
            TemperatureCelsius = 36.6m,
            OxygenSaturationPercent = 98m,
            Bmi = 22.5m,
            GrowthZScoreCategory = "Normal"
        };

        var fullSummary = QueueItemMappingExtensions.FormatVitalsSummary(fullVitals);
        fullSummary.Should().Be("BP 120/80 • HR 72 • RR 16/min • Temp 36.6°C • SpO2 98% • BMI 22.5 • Z: Normal");

        // 2. Only Temperature and HR (BP is null) -> must never render "BP: /"
        var partialVitals = new PatientVitals
        {
            TenantId = "tenant_test",
            SystolicBp = null,
            DiastolicBp = null,
            HeartRateBpm = 80,
            TemperatureCelsius = 37.2m
        };

        var partialSummary = QueueItemMappingExtensions.FormatVitalsSummary(partialVitals);
        partialSummary.Should().Be("HR 80 • Temp 37.2°C");
        partialSummary.Should().NotContain("BP");
        partialSummary.Should().NotContain("/");

        // 3. Null vitals returns null
        QueueItemMappingExtensions.FormatVitalsSummary(null).Should().BeNull();

        // 4. Vitals object with all properties null returns null
        var emptyVitals = new PatientVitals { TenantId = "tenant_test" };
        QueueItemMappingExtensions.FormatVitalsSummary(emptyVitals).Should().BeNull();
    }

    [Fact]
    public void UpdateTriageVitalsCommandValidator_ValidatesFieldRanges()
    {
        var validator = new UpdateTriageVitalsCommandValidator();

        // Valid command
        var validCommand = new UpdateTriageVitalsCommand(
            QueueItemId: Guid.NewGuid(),
            NurseId: null,
            RecordedByNurseName: null,
            SystolicBp: 120,
            DiastolicBp: 80,
            HeartRateBpm: 70,
            TemperatureCelsius: 36.5m,
            RespiratoryRateBreathsPerMin: 16,
            OxygenSaturationPercent: 98m,
            HeightCm: null,
            WeightKg: null,
            PainScore: 5,
            Notes: null,
            Priority: QueuePriority.Routine
        );
        validator.Validate(validCommand).IsValid.Should().BeTrue();

        // Invalid BP out of range (Systolic < 50, Diastolic > 200)
        var invalidBp = validCommand with { SystolicBp = 40, DiastolicBp = 250 };
        var bpResult = validator.Validate(invalidBp);
        bpResult.IsValid.Should().BeFalse();
        bpResult.Errors.Should().Contain(e => e.PropertyName == "SystolicBp");
        bpResult.Errors.Should().Contain(e => e.PropertyName == "DiastolicBp");

        // Invalid PainScore (> 10)
        var invalidPain = validCommand with { PainScore = 15 };
        var painResult = validator.Validate(invalidPain);
        painResult.IsValid.Should().BeFalse();
        painResult.Errors.Should().Contain(e => e.PropertyName == "PainScore");

        // Empty QueueItemId
        var invalidId = validCommand with { QueueItemId = Guid.Empty };
        var idResult = validator.Validate(invalidId);
        idResult.IsValid.Should().BeFalse();
        idResult.Errors.Should().Contain(e => e.PropertyName == "QueueItemId");
    }
}
