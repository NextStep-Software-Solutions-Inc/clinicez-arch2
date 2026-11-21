using System;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Queue.DTOs;
using ClinicEz.Clinic.Application.Features.Triage.Commands;
using ClinicEz.Clinic.Application.Features.Triage.DTOs;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests;

public class Challenger1BackendEmpiricalStressTests
{
    private (Guid clinicId, string tenantId, Guid queueItemId, Guid patientId, IClinicContext clinicContext) CreateTestIds()
    {
        var clinicId = Guid.NewGuid();
        var tenantId = "tenant_challenger_test";
        var queueItemId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(clinicId);
        clinicContext.TenantId.Returns(tenantId);
        clinicContext.StaffId.Returns(Guid.NewGuid());

        return (clinicId, tenantId, queueItemId, patientId, clinicContext);
    }

    [Fact]
    public async Task Adversarial_SequentialMutations_RetainSingleRecord_AndAccumulateState()
    {
        // Stress test sequential updates on the exact same queue item.
        // In-place mutation must strictly preserve PatientVitals.Id, keep row count at exactly 1,
        // and accumulate / overwrite fields as specified per call without data corruption.
        var (clinicId, tenantId, queueItemId, patientId, clinicContext) = CreateTestIds();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var originalVitalsId = Guid.NewGuid();
        var originalVitals = new PatientVitals
        {
            Id = originalVitalsId,
            TenantId = tenantId,
            ClinicId = clinicId,
            QueueItemId = queueItemId,
            PatientId = patientId,
            SystolicBp = 110,
            DiastolicBp = 70,
            HeartRateBpm = 65,
            TemperatureCelsius = 36.4m,
            HeightCm = 175m,
            WeightKg = 70m,
            Bmi = 22.86m,
            PainScore = 3,
            Notes = "First entry"
        };

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Simoun",
            QueueNumber = "Q-CHALLENGER-01",
            Status = QueueStatus.Triaged,
            Priority = QueuePriority.Routine,
            PatientVitals = originalVitals
        };

        await context.QueueItems.AddAsync(queueItem);
        await context.PatientVitals.AddAsync(originalVitals);
        await context.SaveChangesAsync();

        var handler = new UpdateTriageVitalsCommandHandler(queueRepo, vitalsRepo, patientRepo, uow, clinicContext);

        // 1st mutation: Update BP only
        await handler.Handle(new UpdateTriageVitalsCommand(
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
        ), CancellationToken.None);

        // 2nd mutation: Update HeartRate & SpO2 only
        await handler.Handle(new UpdateTriageVitalsCommand(
            QueueItemId: queueItemId,
            NurseId: null,
            RecordedByNurseName: null,
            SystolicBp: null,
            DiastolicBp: null,
            HeartRateBpm: 78,
            TemperatureCelsius: null,
            RespiratoryRateBreathsPerMin: null,
            OxygenSaturationPercent: 99m,
            HeightCm: null,
            WeightKg: null,
            PainScore: null,
            Notes: null
        ), CancellationToken.None);

        // 3rd mutation: Update PainScore to 0
        await handler.Handle(new UpdateTriageVitalsCommand(
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
        ), CancellationToken.None);

        // 4th mutation: Clear notes by submitting ""
        await handler.Handle(new UpdateTriageVitalsCommand(
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
            Notes: ""
        ), CancellationToken.None);

        // 5th mutation: Update Priority to Urgent
        var finalResult = await handler.Handle(new UpdateTriageVitalsCommand(
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
        ), CancellationToken.None);

        // Assertions
        var totalVitalsRows = await context.PatientVitals.CountAsync(v => v.QueueItemId == queueItemId);
        totalVitalsRows.Should().Be(1, "Database row count must strictly remain 1 after 5 sequential in-place updates");

        var dbVitals = await context.PatientVitals.FirstAsync(v => v.QueueItemId == queueItemId);
        dbVitals.Id.Should().Be(originalVitalsId, "Primary Key ID must never be mutated or regenerated");
        dbVitals.SystolicBp.Should().Be(125);
        dbVitals.DiastolicBp.Should().Be(82);
        dbVitals.HeartRateBpm.Should().Be(78);
        dbVitals.OxygenSaturationPercent.Should().Be(99m);
        dbVitals.PainScore.Should().Be(0);
        dbVitals.Notes.Should().BeNull();
        dbVitals.HeightCm.Should().Be(175m);
        dbVitals.WeightKg.Should().Be(70m);
        dbVitals.Bmi.Should().Be(22.86m);

        var dbQueueItem = await context.QueueItems.FirstAsync(q => q.Id == queueItemId);
        dbQueueItem.Priority.Should().Be(QueuePriority.Urgent);
    }

    [Fact]
    public async Task Adversarial_CrossTenantGuard_ThrowsNotFoundException()
    {
        // Multi-tenant security guard: Attempting to update vitals of a ticket belonging to another clinic
        // must throw NotFoundException and NOT leak or modify the other tenant's data.
        var (clinicId, tenantId, queueItemId, patientId, clinicContext) = CreateTestIds();
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var vitalsRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var foreignClinicId = Guid.NewGuid();
        var foreignVitals = new PatientVitals
        {
            Id = Guid.NewGuid(),
            TenantId = "foreign_tenant",
            ClinicId = foreignClinicId,
            QueueItemId = queueItemId,
            PatientId = patientId,
            SystolicBp = 120,
            DiastolicBp = 80
        };

        var foreignQueueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = "foreign_tenant",
            ClinicId = foreignClinicId, // Different Clinic
            PatientId = patientId,
            PatientName = "Foreign Patient",
            QueueNumber = "Q-FOREIGN-01",
            Status = QueueStatus.Triaged,
            PatientVitals = foreignVitals
        };

        await context.QueueItems.AddAsync(foreignQueueItem);
        await context.PatientVitals.AddAsync(foreignVitals);
        await context.SaveChangesAsync();

        var handler = new UpdateTriageVitalsCommandHandler(queueRepo, vitalsRepo, patientRepo, uow, clinicContext);

        var command = new UpdateTriageVitalsCommand(
            QueueItemId: queueItemId,
            NurseId: null,
            RecordedByNurseName: null,
            SystolicBp: 150,
            DiastolicBp: 95,
            HeartRateBpm: null,
            TemperatureCelsius: null,
            RespiratoryRateBreathsPerMin: null,
            OxygenSaturationPercent: null,
            HeightCm: null,
            WeightKg: null,
            PainScore: null,
            Notes: null
        );

        var act = async () => await handler.Handle(command, CancellationToken.None);
        await act.Should().ThrowAsync<NotFoundException>()
            .WithMessage($"Queue ticket '{queueItemId}' not found in this clinic.");

        // Verify foreign vitals were untouched (using IgnoreQueryFilters since context has tenant filter)
        var unchangedForeignVitals = await context.PatientVitals.IgnoreQueryFilters().FirstAsync(v => v.QueueItemId == queueItemId);
        unchangedForeignVitals.SystolicBp.Should().Be(120);
    }

    [Fact]
    public async Task Adversarial_PainScoreZero_PreservedAcrossMultipleNullCalls()
    {
        // Clinical integrity: PainScore = 0 must never be coerced to null by falsy checks,
        // and submitting null in subsequent partial updates must keep PainScore = 0.
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
            PainScore = 8
        };

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Pedro Penduko",
            QueueNumber = "Q-CHALLENGER-02",
            Status = QueueStatus.Triaged,
            PatientVitals = existingVitals
        };

        await context.QueueItems.AddAsync(queueItem);
        await context.PatientVitals.AddAsync(existingVitals);
        await context.SaveChangesAsync();

        var handler = new UpdateTriageVitalsCommandHandler(queueRepo, vitalsRepo, patientRepo, uow, clinicContext);

        // Step 1: Set pain score to 0
        var res1 = await handler.Handle(new UpdateTriageVitalsCommand(
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
        ), CancellationToken.None);

        res1.PainScore.Should().Be(0);

        // Step 2: Next partial update submits PainScore: null (meaning don't modify pain score)
        var res2 = await handler.Handle(new UpdateTriageVitalsCommand(
            QueueItemId: queueItemId,
            NurseId: null,
            RecordedByNurseName: null,
            SystolicBp: 120,
            DiastolicBp: 80,
            HeartRateBpm: null,
            TemperatureCelsius: null,
            RespiratoryRateBreathsPerMin: null,
            OxygenSaturationPercent: null,
            HeightCm: null,
            WeightKg: null,
            PainScore: null,
            Notes: null
        ), CancellationToken.None);

        res2.PainScore.Should().Be(0, "Subsequent update with null pain score must preserve 0");

        var db = await context.PatientVitals.FirstAsync(v => v.QueueItemId == queueItemId);
        db.PainScore.Should().Be(0);
    }

    [Fact]
    public async Task Adversarial_AllTextFields_ClearingAndTrimmingMatrix()
    {
        // Verify all 6 optional text fields:
        // Notes, VisualAcuityLeft, VisualAcuityRight, PreAssessmentNotes, PreAssessmentRemarks, TriageAcuityReason
        // 1. Whitespace or empty string -> null
        // 2. Untouched null -> preserves
        // 3. String with leading/trailing spaces -> trimmed
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
            Notes = "Keep these notes",
            VisualAcuityLeft = "20/20",
            VisualAcuityRight = "20/30",
            PreAssessmentNotes = "Initial pre-notes",
            PreAssessmentRemarks = "Initial pre-remarks",
            TriageAcuityReason = "Initial reason"
        };

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Jovita",
            QueueNumber = "Q-CHALLENGER-03",
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
            Notes: null, // Keep
            VisualAcuityLeft: "", // Clear
            VisualAcuityRight: "   \t\r\n   ", // Clear
            PreAssessmentNotes: "   Padded notes   ", // Trim
            PreAssessmentRemarks: "   Padded remarks   ", // Trim
            TriageAcuityReason: "" // Clear
        );

        var result = await handler.Handle(command, CancellationToken.None);

        result.Notes.Should().Be("Keep these notes");
        result.VisualAcuityLeft.Should().BeNull();
        result.VisualAcuityRight.Should().BeNull();
        result.PreAssessmentNotes.Should().Be("Padded notes");
        result.PreAssessmentRemarks.Should().Be("Padded remarks");
        result.TriageAcuityReason.Should().BeNull();
    }

    [Fact]
    public async Task Adversarial_AnthropometricsClearing_WhenNegativeOrZero()
    {
        // When HeadCircumferenceCm, MidUpperArmCircumferenceCm, WaistCircumferenceCm, etc. are <= 0,
        // they must be cleared to null, whereas null values must preserve existing data.
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
            HeadCircumferenceCm = 45m,
            MidUpperArmCircumferenceCm = 15m,
            WaistCircumferenceCm = 70m,
            HipCircumferenceCm = 90m,
            BodyLengthCm = 60m,
            SkinfoldThicknessMm = 10m,
            LimbsCircumferenceCm = 20m,
            IsMeasuredRecumbent = true
        };

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Baby Juan",
            QueueNumber = "Q-CHALLENGER-04",
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
            HeadCircumferenceCm: 0m, // <= 0 -> clears to null
            MidUpperArmCircumferenceCm: -5m, // <= 0 -> clears to null
            WaistCircumferenceCm: null, // null -> preserves 70m
            HipCircumferenceCm: null, // null -> preserves 90m
            BodyLengthCm: 0m, // <= 0 -> clears to null
            SkinfoldThicknessMm: -1m, // <= 0 -> clears to null
            LimbsCircumferenceCm: null, // null -> preserves 20m
            IsMeasuredRecumbent: false // Updates to false
        );

        var result = await handler.Handle(command, CancellationToken.None);

        result.HeadCircumferenceCm.Should().BeNull();
        result.MidUpperArmCircumferenceCm.Should().BeNull();
        result.WaistCircumferenceCm.Should().Be(70m);
        result.HipCircumferenceCm.Should().Be(90m);
        result.BodyLengthCm.Should().BeNull();
        result.SkinfoldThicknessMm.Should().BeNull();
        result.LimbsCircumferenceCm.Should().Be(20m);
        result.IsMeasuredRecumbent.Should().BeFalse();
    }

    [Fact]
    public async Task Adversarial_HeightModifiedAlone_RecalculatesBmiUsingExistingWeight()
    {
        // Partial modification: If HeightCm is changed to 180cm, but WeightKg is omitted (null),
        // BMI must be recalculated using the existing WeightKg (72kg) -> 72 / (1.8^2) = 22.22.
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
            HeightCm = 160m,
            WeightKg = 72m,
            Bmi = 28.13m
        };

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Andres",
            QueueNumber = "Q-CHALLENGER-05",
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
            HeightCm: 180m, // modified
            WeightKg: null, // untouched
            PainScore: null,
            Notes: null
        );

        var result = await handler.Handle(command, CancellationToken.None);

        result.HeightCm.Should().Be(180m);
        result.WeightKg.Should().Be(72m);
        result.Bmi.Should().Be(22.22m, "BMI should be recalculated from existing weight and updated height");
    }

    [Fact]
    public async Task Adversarial_WeightModifiedAlone_RecalculatesBmiUsingExistingHeight()
    {
        // Partial modification: If WeightKg is changed to 90kg, but HeightCm is omitted (null),
        // BMI must be recalculated using the existing HeightCm (180cm) -> 90 / (1.8^2) = 27.78.
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
            HeightCm = 180m,
            WeightKg = 72m,
            Bmi = 22.22m
        };

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Emilio",
            QueueNumber = "Q-CHALLENGER-06",
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
            HeightCm: null, // untouched
            WeightKg: 90m, // modified
            PainScore: null,
            Notes: null
        );

        var result = await handler.Handle(command, CancellationToken.None);

        result.HeightCm.Should().Be(180m);
        result.WeightKg.Should().Be(90m);
        result.Bmi.Should().Be(27.78m, "BMI should be recalculated from existing height and updated weight");
    }

    [Fact]
    public async Task Adversarial_WeightClearedViaZeroOrNegative_ClearsBmiAndZScores()
    {
        // Submitting WeightKg = 0 or WeightKg = -5 must act as a clear signal,
        // clearing WeightKg, Bmi, and all WHO Z-scores to null.
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
            HeightCm = 170m,
            WeightKg = 70m,
            Bmi = 24.22m,
            ZScoreWeightForAge = 0.5m,
            GrowthZScoreCategory = "Normal"
        };

        var queueItem = new QueueItem
        {
            Id = queueItemId,
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientId = patientId,
            PatientName = "Apolinario",
            QueueNumber = "Q-CHALLENGER-07",
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
            WeightKg: 0m, // <= 0 -> clears weight
            PainScore: null,
            Notes: null
        );

        var result = await handler.Handle(command, CancellationToken.None);

        result.WeightKg.Should().BeNull();
        result.HeightCm.Should().Be(170m);
        result.Bmi.Should().BeNull("BMI must be cleared when weight is cleared");
        result.ZScoreWeightForAge.Should().BeNull("Z-scores must be cleared when weight is cleared");
        result.GrowthZScoreCategory.Should().BeNull();
    }

    [Theory]
    [InlineData(49, false)]
    [InlineData(50, true)]
    [InlineData(300, true)]
    [InlineData(301, false)]
    public void Validator_SystolicBp_BoundaryLimits(int systolic, bool expectedValid)
    {
        var validator = new UpdateTriageVitalsCommandValidator();
        var command = new UpdateTriageVitalsCommand(
            QueueItemId: Guid.NewGuid(),
            NurseId: null,
            RecordedByNurseName: null,
            SystolicBp: systolic,
            DiastolicBp: null,
            HeartRateBpm: null,
            TemperatureCelsius: null,
            RespiratoryRateBreathsPerMin: null,
            OxygenSaturationPercent: null,
            HeightCm: null,
            WeightKg: null,
            PainScore: null,
            Notes: null
        );

        var res = validator.Validate(command);
        res.IsValid.Should().Be(expectedValid);
        if (!expectedValid)
        {
            res.Errors.Should().Contain(e => e.PropertyName == "SystolicBp");
        }
    }

    [Theory]
    [InlineData(29, false)]
    [InlineData(30, true)]
    [InlineData(200, true)]
    [InlineData(201, false)]
    public void Validator_DiastolicBp_BoundaryLimits(int diastolic, bool expectedValid)
    {
        var validator = new UpdateTriageVitalsCommandValidator();
        var command = new UpdateTriageVitalsCommand(
            QueueItemId: Guid.NewGuid(),
            NurseId: null,
            RecordedByNurseName: null,
            SystolicBp: null,
            DiastolicBp: diastolic,
            HeartRateBpm: null,
            TemperatureCelsius: null,
            RespiratoryRateBreathsPerMin: null,
            OxygenSaturationPercent: null,
            HeightCm: null,
            WeightKg: null,
            PainScore: null,
            Notes: null
        );

        var res = validator.Validate(command);
        res.IsValid.Should().Be(expectedValid);
        if (!expectedValid)
        {
            res.Errors.Should().Contain(e => e.PropertyName == "DiastolicBp");
        }
    }

    [Theory]
    [InlineData(29, false)]
    [InlineData(30, true)]
    [InlineData(250, true)]
    [InlineData(251, false)]
    public void Validator_HeartRateBpm_BoundaryLimits(int hr, bool expectedValid)
    {
        var validator = new UpdateTriageVitalsCommandValidator();
        var command = new UpdateTriageVitalsCommand(
            QueueItemId: Guid.NewGuid(),
            NurseId: null,
            RecordedByNurseName: null,
            SystolicBp: null,
            DiastolicBp: null,
            HeartRateBpm: hr,
            TemperatureCelsius: null,
            RespiratoryRateBreathsPerMin: null,
            OxygenSaturationPercent: null,
            HeightCm: null,
            WeightKg: null,
            PainScore: null,
            Notes: null
        );

        var res = validator.Validate(command);
        res.IsValid.Should().Be(expectedValid);
        if (!expectedValid)
        {
            res.Errors.Should().Contain(e => e.PropertyName == "HeartRateBpm");
        }
    }

    [Theory]
    [InlineData(29.9, false)]
    [InlineData(30.0, true)]
    [InlineData(45.0, true)]
    [InlineData(45.1, false)]
    public void Validator_TemperatureCelsius_BoundaryLimits(decimal temp, bool expectedValid)
    {
        var validator = new UpdateTriageVitalsCommandValidator();
        var command = new UpdateTriageVitalsCommand(
            QueueItemId: Guid.NewGuid(),
            NurseId: null,
            RecordedByNurseName: null,
            SystolicBp: null,
            DiastolicBp: null,
            HeartRateBpm: null,
            TemperatureCelsius: temp,
            RespiratoryRateBreathsPerMin: null,
            OxygenSaturationPercent: null,
            HeightCm: null,
            WeightKg: null,
            PainScore: null,
            Notes: null
        );

        var res = validator.Validate(command);
        res.IsValid.Should().Be(expectedValid);
        if (!expectedValid)
        {
            res.Errors.Should().Contain(e => e.PropertyName == "TemperatureCelsius");
        }
    }

    [Theory]
    [InlineData(49.9, false)]
    [InlineData(50.0, true)]
    [InlineData(100.0, true)]
    [InlineData(100.1, false)]
    public void Validator_OxygenSaturationPercent_BoundaryLimits(decimal spo2, bool expectedValid)
    {
        var validator = new UpdateTriageVitalsCommandValidator();
        var command = new UpdateTriageVitalsCommand(
            QueueItemId: Guid.NewGuid(),
            NurseId: null,
            RecordedByNurseName: null,
            SystolicBp: null,
            DiastolicBp: null,
            HeartRateBpm: null,
            TemperatureCelsius: null,
            RespiratoryRateBreathsPerMin: null,
            OxygenSaturationPercent: spo2,
            HeightCm: null,
            WeightKg: null,
            PainScore: null,
            Notes: null
        );

        var res = validator.Validate(command);
        res.IsValid.Should().Be(expectedValid);
        if (!expectedValid)
        {
            res.Errors.Should().Contain(e => e.PropertyName == "OxygenSaturationPercent");
        }
    }

    [Theory]
    [InlineData(-1, false)]
    [InlineData(0, true)]
    [InlineData(10, true)]
    [InlineData(11, false)]
    public void Validator_PainScore_BoundaryLimits(int pain, bool expectedValid)
    {
        var validator = new UpdateTriageVitalsCommandValidator();
        var command = new UpdateTriageVitalsCommand(
            QueueItemId: Guid.NewGuid(),
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
            PainScore: pain,
            Notes: null
        );

        var res = validator.Validate(command);
        res.IsValid.Should().Be(expectedValid);
        if (!expectedValid)
        {
            res.Errors.Should().Contain(e => e.PropertyName == "PainScore");
        }
    }

    [Fact]
    public void Adversarial_FormatVitalsSummary_NeverOutputsMalformedStrings()
    {
        // 1. Only Diastolic BP provided (Systolic is null) -> BP must not output malformed "BP /80"
        var diastolicOnly = new PatientVitals
        {
            TenantId = "t",
            SystolicBp = null,
            DiastolicBp = 80,
            HeartRateBpm = 75
        };
        var s1 = QueueItemMappingExtensions.FormatVitalsSummary(diastolicOnly);
        s1.Should().Be("HR 75");
        s1.Should().NotContain("BP");
        s1.Should().NotContain("/");

        // 2. Systolic only -> "BP 120"
        var systolicOnly = new PatientVitals
        {
            TenantId = "t",
            SystolicBp = 120,
            DiastolicBp = null,
            HeartRateBpm = 75
        };
        var s2 = QueueItemMappingExtensions.FormatVitalsSummary(systolicOnly);
        s2.Should().Be("BP 120 • HR 75");

        // 3. SpO2 and Temp only
        var tempSpo2Only = new PatientVitals
        {
            TenantId = "t",
            TemperatureCelsius = 37.0m,
            OxygenSaturationPercent = 98m
        };
        var s3 = QueueItemMappingExtensions.FormatVitalsSummary(tempSpo2Only);
        s3.Should().Be("Temp 37.0°C • SpO2 98%");

        // 4. PhilHealthZScoreCategory fallback when GrowthZScoreCategory is null
        var zFallback = new PatientVitals
        {
            TenantId = "t",
            SystolicBp = 110,
            DiastolicBp = 70,
            GrowthZScoreCategory = "Underweight"
        };
        var s4 = QueueItemMappingExtensions.FormatVitalsSummary(zFallback);
        s4.Should().Be("BP 110/70 • Z: Underweight");
    }
}
