using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Consultations.DTOs;
using ClinicEz.Clinic.Application.Features.Dental.Commands;
using ClinicEz.Clinic.Application.Features.Dental.DTOs;
using ClinicEz.Clinic.Application.Features.Dental.Queries;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Adversarial Stress Test Suite for Milestone 1:
/// Multi-Condition Dental Records, Soft-Deletion, DMFT / Distinct Tooth Metrics, and Patient Chart Synchronization.
/// </summary>
public class ChallengerM1MultiConditionStressTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private const string _tenantId = "tenant-challenger-m1-stress";

    public ChallengerM1MultiConditionStressTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffName.Returns("Dr. Challenger Stress Tester");
    }

    // =========================================================================
    // 1. MULTI-CONDITION COEXISTENCE ON TOOTH 16
    // =========================================================================

    [Fact]
    public async Task MultiConditionCoexistence_Tooth16_RetainsDistinctIdsSurfacesNotesAndCreatedAt()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-MULTI-16",
            FirstName = "Maria",
            LastName = "Clara",
            ContactNumber = "09170001616"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var upsertHandler = new UpsertDentalToothRecordCommandHandler(toothRepo, patientRepo, uow, _clinicContext);
        var chartQueryHandler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContext);

        var consult1Id = Guid.NewGuid();
        var consult2Id = Guid.NewGuid();

        // Step 1: Save Filled on O
        var filledResult = await upsertHandler.Handle(new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 16,
            Status: ToothStatus.Filled,
            Surface: "O",
            Notes: "Existing composite on occlusal",
            ConsultationId: consult1Id
        ), CancellationToken.None);

        await Task.Delay(20);

        // Step 2: Save Decay on MD
        var decayResult = await upsertHandler.Handle(new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 16,
            Status: ToothStatus.Decayed,
            Surface: "MD",
            Notes: "Recurrent mesio-distal caries",
            ConsultationId: consult2Id
        ), CancellationToken.None);

        await Task.Delay(20);

        // Step 3: Save Crown on B
        var crownResult = await upsertHandler.Handle(new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 16,
            Status: ToothStatus.Crowned,
            Surface: "B",
            Notes: "Buccal porcelain veneer/crown",
            ConsultationId: consult2Id
        ), CancellationToken.None);

        // Assert Step A: 3 distinct results returned by commands
        filledResult.Id.Should().NotBe(decayResult.Id);
        filledResult.Id.Should().NotBe(crownResult.Id);
        decayResult.Id.Should().NotBe(crownResult.Id);

        // Assert Step B: Database contains 3 distinct active rows for tooth 16
        var dbRecords = await toothRepo.Query(t => t.PatientId == patientId && t.ToothNumber == 16 && !t.IsDeleted)
            .OrderBy(t => t.CreatedAt)
            .ToListAsync();

        dbRecords.Should().HaveCount(3);

        var dbFilled = dbRecords.First(r => r.Status == ToothStatus.Filled);
        dbFilled.Surface.Should().Be("O");
        dbFilled.Notes.Should().Be("Existing composite on occlusal");
        dbFilled.ConsultationId.Should().Be(consult1Id);

        var dbDecay = dbRecords.First(r => r.Status == ToothStatus.Decayed);
        dbDecay.Surface.Should().Be("MD");
        dbDecay.Notes.Should().Be("Recurrent mesio-distal caries");
        dbDecay.ConsultationId.Should().Be(consult2Id);

        var dbCrown = dbRecords.First(r => r.Status == ToothStatus.Crowned);
        dbCrown.Surface.Should().Be("B");
        dbCrown.Notes.Should().Be("Buccal porcelain veneer/crown");
        dbCrown.ConsultationId.Should().Be(consult2Id);

        // Assert Step C: CreatedAt timestamps are preserved and strictly chronological
        dbFilled.CreatedAt.Should().BeBefore(dbDecay.CreatedAt);
        dbDecay.CreatedAt.Should().BeBefore(dbCrown.CreatedAt);

        // Step 4: Now update the 'Filled' condition surface from "O" to "OL" within the same consultation
        var originalFilledCreatedAt = dbFilled.CreatedAt;
        var originalFilledId = dbFilled.Id;

        await Task.Delay(20);

        var updateFilledResult = await upsertHandler.Handle(new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 16,
            Status: ToothStatus.Filled,
            Surface: "OL",
            Notes: "Extended composite to OL",
            ConsultationId: consult1Id
        ), CancellationToken.None);

        // Assert Step D: Filled condition updated in place without duplicate record or touching Decay(MD)/Crown(B)
        updateFilledResult.Id.Should().Be(originalFilledId);
        updateFilledResult.Surface.Should().Be("OL");
        updateFilledResult.ActiveSurface.Should().Be("OL");
        updateFilledResult.Notes.Should().Be("Extended composite to OL");

        var dbRecordsAfterUpdate = await toothRepo.Query(t => t.PatientId == patientId && t.ToothNumber == 16 && !t.IsDeleted).ToListAsync();
        dbRecordsAfterUpdate.Should().HaveCount(3);

        var updatedDbFilled = dbRecordsAfterUpdate.First(r => r.Status == ToothStatus.Filled);
        updatedDbFilled.Id.Should().Be(originalFilledId);
        updatedDbFilled.CreatedAt.Should().Be(originalFilledCreatedAt); // Original timestamp retained!
        updatedDbFilled.UpdatedAt.Should().NotBeNull();
        updatedDbFilled.Surface.Should().Be("OL");
        updatedDbFilled.ActiveSurface.Should().Be("OL");

        // Assert Step E: Dental Chart query reflects all 3 conditions on tooth 16
        var chart = await chartQueryHandler.Handle(new GetPatientDentalChartQuery(patientId), CancellationToken.None);
        chart.Teeth.Should().HaveCount(3);
        chart.Summary.Should().NotBeNull();
        chart.Summary!.TotalTeethRecorded.Should().Be(1); // Only 1 tooth recorded!
        chart.Summary.FilledCount.Should().Be(1);
        chart.Summary.DecayCount.Should().Be(1);
        chart.Summary.CrownCount.Should().Be(1);
        chart.Summary.DmftIndex.Should().Be(1); // Tooth 16 has D and F -> counted once
    }

    [Fact]
    public async Task BatchSave_MultiConditionCoexistence_RetainsAllDistinctConditions()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-BATCH-MULTI",
            FirstName = "Batch",
            LastName = "Patient",
            ContactNumber = "09170002222"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var chartQueryHandler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContext);
        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetPatientDentalChartQuery>(q => q.PatientId == patientId), Arg.Any<CancellationToken>())
            .Returns(ci => chartQueryHandler.Handle(ci.Arg<GetPatientDentalChartQuery>(), ci.Arg<CancellationToken>()));

        var batchHandler = new BatchSaveDentalChartCommandHandler(toothRepo, patientRepo, uow, _clinicContext, sender);

        var command = new BatchSaveDentalChartCommand(
            PatientId: patientId,
            ConsultationId: null,
            Teeth: new List<ToothRecordInput>
            {
                new(ToothNumber: 16, Status: ToothStatus.Filled, Surface: "O", Notes: "Initial filling"),
                new(ToothNumber: 16, Status: ToothStatus.Decayed, Surface: "MD", Notes: "Caries on edges"),
                new(ToothNumber: 16, Status: ToothStatus.Crowned, Surface: "B", Notes: "Veneer on buccal")
            }
        );

        // Act
        var result = await batchHandler.Handle(command, CancellationToken.None);

        // Assert
        result.Teeth.Should().HaveCount(3);
        result.Teeth.Should().Contain(t => t.ToothNumber == 16 && t.Status == ToothStatus.Filled && t.Surface == "O");
        result.Teeth.Should().Contain(t => t.ToothNumber == 16 && t.Status == ToothStatus.Decayed && t.Surface == "MD");
        result.Teeth.Should().Contain(t => t.ToothNumber == 16 && t.Status == ToothStatus.Crowned && t.Surface == "B");

        var dbRecords = await toothRepo.Query(t => t.PatientId == patientId && t.ToothNumber == 16 && !t.IsDeleted).ToListAsync();
        dbRecords.Should().HaveCount(3);
    }

    // =========================================================================
    // 2. STATUS == HEALTHY OR REMOVECONDITION == TRUE SOFT DELETION
    // =========================================================================

    [Fact]
    public async Task RemoveCondition_SoftDeletesTargetedCondition_ExcludesFromFutureQueries()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-SOFT-DEL",
            FirstName = "Emilio",
            LastName = "Aguinaldo",
            ContactNumber = "09170003333"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var upsertHandler = new UpsertDentalToothRecordCommandHandler(toothRepo, patientRepo, uow, _clinicContext);
        var chartQueryHandler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContext);

        // Setup tooth 16 with Filled(O), Decay(MD), Crown(B)
        await upsertHandler.Handle(new UpsertDentalToothRecordCommand(patientId, 16, ToothStatus.Filled, "O", "Filling"), CancellationToken.None);
        await upsertHandler.Handle(new UpsertDentalToothRecordCommand(patientId, 16, ToothStatus.Decayed, "MD", "Caries"), CancellationToken.None);
        await upsertHandler.Handle(new UpsertDentalToothRecordCommand(patientId, 16, ToothStatus.Crowned, "B", "Crown"), CancellationToken.None);

        // Act: Remove Decay condition via RemoveCondition = true
        var removeResult = await upsertHandler.Handle(new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 16,
            Status: ToothStatus.Decayed,
            RemoveCondition: true
        ), CancellationToken.None);

        // Assert Step A: RemoveResult reflects the removed condition
        removeResult.Should().NotBeNull();
        removeResult.ToothNumber.Should().Be(16);
        removeResult.Status.Should().Be(ToothStatus.Decayed);

        // Assert Step B: In DB, the Decay record is marked IsDeleted = true, with DeletedAt and DeletedBy populated
        var allDbRecords = await toothRepo.Query(t => t.PatientId == patientId && t.ToothNumber == 16, ignoreQueryFilters: true).ToListAsync();
        allDbRecords.Should().HaveCount(3);

        var deletedDecay = allDbRecords.First(r => r.Status == ToothStatus.Decayed);
        deletedDecay.IsDeleted.Should().BeTrue();
        deletedDecay.DeletedAt.Should().NotBeNull();
        deletedDecay.DeletedBy.Should().Be("Dr. Challenger Stress Tester");

        var activeFilled = allDbRecords.First(r => r.Status == ToothStatus.Filled);
        activeFilled.IsDeleted.Should().BeFalse();

        var activeCrown = allDbRecords.First(r => r.Status == ToothStatus.Crowned);
        activeCrown.IsDeleted.Should().BeFalse();

        // Assert Step C: Future queries completely exclude the soft-deleted Decay condition
        var chart = await chartQueryHandler.Handle(new GetPatientDentalChartQuery(patientId), CancellationToken.None);
        chart.Teeth.Should().HaveCount(2);
        chart.Teeth.Should().NotContain(t => t.Status == ToothStatus.Decayed);
        chart.Teeth.Should().Contain(t => t.Status == ToothStatus.Filled);
        chart.Teeth.Should().Contain(t => t.Status == ToothStatus.Crowned);

        chart.Summary.Should().NotBeNull();
        chart.Summary!.DecayCount.Should().Be(0);
        chart.Summary.FilledCount.Should().Be(1);
        chart.Summary.CrownCount.Should().Be(1);
        chart.Summary.DmftIndex.Should().Be(1); // Only Filled remains

        // Assert Step D: Calling RemoveCondition on an already removed condition is idempotent and safe
        var idempotentAct = async () => await upsertHandler.Handle(new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 16,
            Status: ToothStatus.Decayed,
            RemoveCondition: true
        ), CancellationToken.None);

        await idempotentAct.Should().NotThrowAsync();
    }

    [Fact]
    public async Task StatusHealthy_SoftDeletesAllActiveNonHealthyConditions_AndIsReplacedWhenNewConditionAdded()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-HLTH-TRANS",
            FirstName = "Apolinario",
            LastName = "Mabini",
            ContactNumber = "09170004444"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var upsertHandler = new UpsertDentalToothRecordCommandHandler(toothRepo, patientRepo, uow, _clinicContext);
        var chartQueryHandler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContext);

        // Setup tooth 16 with Filled and Decay
        await upsertHandler.Handle(new UpsertDentalToothRecordCommand(patientId, 16, ToothStatus.Filled, "O", "Old filling"), CancellationToken.None);
        await upsertHandler.Handle(new UpsertDentalToothRecordCommand(patientId, 16, ToothStatus.Decayed, "MD", "Caries"), CancellationToken.None);

        // Act 1: Mark tooth 16 as Healthy
        var healthyResult = await upsertHandler.Handle(new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 16,
            Status: ToothStatus.Healthy,
            Notes: "Tooth examined and sound"
        ), CancellationToken.None);

        // Assert 1: Filled and Decay are soft-deleted; Healthy record is active
        healthyResult.Status.Should().Be(ToothStatus.Healthy);

        var allRecordsAfterHealthy = await toothRepo.Query(t => t.PatientId == patientId && t.ToothNumber == 16, ignoreQueryFilters: true).ToListAsync();
        allRecordsAfterHealthy.Should().HaveCount(3);
        allRecordsAfterHealthy.Count(r => r.IsDeleted).Should().Be(2);

        var activeHealthy = allRecordsAfterHealthy.First(r => !r.IsDeleted);
        activeHealthy.Status.Should().Be(ToothStatus.Healthy);
        activeHealthy.Notes.Should().Be("Tooth examined and sound");

        var chartAfterHealthy = await chartQueryHandler.Handle(new GetPatientDentalChartQuery(patientId), CancellationToken.None);
        chartAfterHealthy.Teeth.Should().HaveCount(1);
        chartAfterHealthy.Teeth[0].Status.Should().Be(ToothStatus.Healthy);
        chartAfterHealthy.Summary!.HealthyCount.Should().Be(1);
        chartAfterHealthy.Summary.FilledCount.Should().Be(0);
        chartAfterHealthy.Summary.DecayCount.Should().Be(0);
        chartAfterHealthy.Summary.DmftIndex.Should().Be(0);

        // Act 2: Later, doctor diagnoses Decay on occlusal surface of tooth 16
        var newDecayResult = await upsertHandler.Handle(new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 16,
            Status: ToothStatus.Decayed,
            Surface: "O",
            Notes: "New occlusal pit decay"
        ), CancellationToken.None);

        // Assert 2: The Healthy placeholder is now soft-deleted, and only the Decay record is active
        newDecayResult.Status.Should().Be(ToothStatus.Decayed);

        var allRecordsAfterNewDecay = await toothRepo.Query(t => t.PatientId == patientId && t.ToothNumber == 16, ignoreQueryFilters: true).ToListAsync();
        allRecordsAfterNewDecay.Should().HaveCount(4);
        allRecordsAfterNewDecay.Count(r => r.IsDeleted).Should().Be(3); // Filled, Decay1, and Healthy are all deleted!

        var currentActive = allRecordsAfterNewDecay.Where(r => !r.IsDeleted).ToList();
        currentActive.Should().HaveCount(1);
        currentActive[0].Status.Should().Be(ToothStatus.Decayed);
        currentActive[0].Surface.Should().Be("O");
        currentActive[0].Notes.Should().Be("New occlusal pit decay");

        var chartAfterNewDecay = await chartQueryHandler.Handle(new GetPatientDentalChartQuery(patientId), CancellationToken.None);
        chartAfterNewDecay.Teeth.Should().HaveCount(1);
        chartAfterNewDecay.Teeth[0].Status.Should().Be(ToothStatus.Decayed);
        chartAfterNewDecay.Summary!.HealthyCount.Should().Be(0);
        chartAfterNewDecay.Summary.DecayCount.Should().Be(1);
        chartAfterNewDecay.Summary.DmftIndex.Should().Be(1);
    }

    // =========================================================================
    // 3. TOTALTEETHRECORDED & DMFTINDEX IN GETPATIENTDENTALCHARTQUERY
    // =========================================================================

    [Fact]
    public async Task MetricsCalculation_TotalTeethRecordedAndDmftIndex_CountsDistinctTeethNotRows()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var patientId = Guid.NewGuid();

        // Tooth 16: Multi-condition (Filled on O + Decay on MD) -> 2 rows
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId, ClinicId = _clinicId, PatientId = patientId,
            ToothNumber = 16, Status = ToothStatus.Filled, Surface = "O"
        }, CancellationToken.None);
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId, ClinicId = _clinicId, PatientId = patientId,
            ToothNumber = 16, Status = ToothStatus.Decayed, Surface = "MD"
        }, CancellationToken.None);

        // Tooth 26: Multi-condition (Decay on MOD + Filled on B + Missing) -> 3 rows
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId, ClinicId = _clinicId, PatientId = patientId,
            ToothNumber = 26, Status = ToothStatus.Decayed, Surface = "MOD"
        }, CancellationToken.None);
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId, ClinicId = _clinicId, PatientId = patientId,
            ToothNumber = 26, Status = ToothStatus.Filled, Surface = "B"
        }, CancellationToken.None);
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId, ClinicId = _clinicId, PatientId = patientId,
            ToothNumber = 26, Status = ToothStatus.Missing
        }, CancellationToken.None);

        // Tooth 36: Single condition (Crown on B) -> 1 row
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId, ClinicId = _clinicId, PatientId = patientId,
            ToothNumber = 36, Status = ToothStatus.Crowned, Surface = "B"
        }, CancellationToken.None);

        // Tooth 46: Single condition (Healthy) -> 1 row
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId, ClinicId = _clinicId, PatientId = patientId,
            ToothNumber = 46, Status = ToothStatus.Healthy
        }, CancellationToken.None);

        // Soft-deleted record on Tooth 11 (Must be excluded)
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId, ClinicId = _clinicId, PatientId = patientId,
            ToothNumber = 11, Status = ToothStatus.Decayed, IsDeleted = true
        }, CancellationToken.None);

        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContext);

        // Act
        var chart = await handler.Handle(new GetPatientDentalChartQuery(patientId), CancellationToken.None);

        // Assert
        chart.Should().NotBeNull();
        chart.Teeth.Should().HaveCount(7); // 7 active condition rows across 4 teeth

        var summary = chart.Summary;
        summary.Should().NotBeNull();

        // 1. TotalTeethRecorded MUST be 4 (teeth 16, 26, 36, 46) and NOT 7!
        summary!.TotalTeethRecorded.Should().Be(4);

        // 2. Individual condition distinct tooth counts:
        summary.HealthyCount.Should().Be(1); // Tooth 46
        summary.DecayCount.Should().Be(2);   // Tooth 16 and Tooth 26
        summary.FilledCount.Should().Be(2);  // Tooth 16 and Tooth 26
        summary.MissingCount.Should().Be(1); // Tooth 26
        summary.CrownCount.Should().Be(1);   // Tooth 36
        summary.ExtractionCount.Should().Be(0);

        // 3. DmftIndex:
        // Teeth with (Decay || Missing || Filled):
        // - Tooth 16 (Decay + Filled) -> counts as 1 distinct tooth
        // - Tooth 26 (Decay + Filled + Missing) -> counts as 1 distinct tooth
        // - Tooth 36 (Crown) -> 0
        // - Tooth 46 (Healthy) -> 0
        // TOTAL distinct DMFT teeth = 2!
        summary.DmftIndex.Should().Be(2);
    }

    // =========================================================================
    // 4. PATIENTCHARTDTO.DENTALTEETH & CONSULTATIONENCOUNTERDTO.DENTALFINDINGS
    // =========================================================================

    [Fact]
    public async Task PatientChartQuery_DentalTeethAndConsultationEncounterDentalFindings_Integration()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var triageRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);

        var patientId = Guid.NewGuid();
        var patient = new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-LONGITUDINAL",
            FirstName = "Gabriela",
            LastName = "Silang",
            ContactNumber = "09170005555"
        };
        await patientRepo.AddAsync(patient, CancellationToken.None);

        var consult1Id = Guid.NewGuid();
        var consult1Date = new DateTime(2026, 10, 10, 9, 30, 0, DateTimeKind.Utc);
        var consult1 = new ConsultationEncounter
        {
            Id = consult1Id,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Gabriela Silang",
            DoctorName = "Dr. Jose Rizal",
            EncounterDate = consult1Date,
            IsSigned = true
        };
        await consultRepo.AddAsync(consult1, CancellationToken.None);

        var consult2Id = Guid.NewGuid();
        var consult2Date = new DateTime(2026, 10, 18, 14, 0, 0, DateTimeKind.Utc);
        var consult2 = new ConsultationEncounter
        {
            Id = consult2Id,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Gabriela Silang",
            DoctorName = "Dr. Antonio Luna",
            EncounterDate = consult2Date,
            IsSigned = true
        };
        await consultRepo.AddAsync(consult2, CancellationToken.None);

        var consult3Id = Guid.NewGuid();
        var consult3Date = new DateTime(2026, 10, 20, 11, 0, 0, DateTimeKind.Utc);
        var consult3 = new ConsultationEncounter
        {
            Id = consult3Id,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Gabriela Silang",
            DoctorName = "Dr. Antonio Luna",
            EncounterDate = consult3Date,
            IsSigned = false
        };
        await consultRepo.AddAsync(consult3, CancellationToken.None);

        // Dental Tooth Records:
        // 1. Tooth 16 Filled: linked to consult1Id, CreatedBy Dr. Alpha, UpdatedBy Dr. Beta
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ConsultationId = consult1Id,
            ToothNumber = 16,
            Status = ToothStatus.Filled,
            Surface = "O",
            Notes = "Composite filling",
            CreatedAt = consult1Date,
            CreatedBy = "Dr. Alpha",
            UpdatedBy = "Dr. Beta"
        }, CancellationToken.None);

        // 2. Tooth 16 Decay: linked to consult1Id, CreatedBy Dr. Alpha, UpdatedBy null
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ConsultationId = consult1Id,
            ToothNumber = 16,
            Status = ToothStatus.Decayed,
            Surface = "MD",
            Notes = "Recurrent caries",
            CreatedAt = consult1Date,
            CreatedBy = "Dr. Alpha",
            UpdatedBy = null
        }, CancellationToken.None);

        // 3. Tooth 21 Healthy: linked to consult2Id
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ConsultationId = consult2Id,
            ToothNumber = 21,
            Status = ToothStatus.Healthy,
            CreatedAt = consult2Date,
            CreatedBy = "Dr. Antonio Luna"
        }, CancellationToken.None);

        // 4. Tooth 36 Missing: consultationId is NULL, but CreatedAt matches consult2Date (date fallback)
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ConsultationId = null,
            ToothNumber = 36,
            Status = ToothStatus.Missing,
            CreatedAt = consult2Date,
            CreatedBy = "Dr. Antonio Luna"
        }, CancellationToken.None);

        // 5. Tooth 46 Decay: linked to consult1Id, but IsDeleted = true (MUST BE EXCLUDED)
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ConsultationId = consult1Id,
            ToothNumber = 46,
            Status = ToothStatus.Decayed,
            IsDeleted = true,
            CreatedAt = consult1Date
        }, CancellationToken.None);

        // Clinical Procedures:
        // Proc 1: Category == "Dental" with tooth 16
        await procRepo.AddAsync(new ClinicalProcedure
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Gabriela Silang",
            ProcedureCode = "DENT-001",
            ProcedureName = "Composite Restoration",
            Category = "Dental",
            ToothNumber = 16,
            ToothSurface = "O",
            ScheduledAt = consult1Date
        }, CancellationToken.None);

        // Proc 2: Category == "General" with tooth 21
        await procRepo.AddAsync(new ClinicalProcedure
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Gabriela Silang",
            ProcedureCode = "GEN-002",
            ProcedureName = "Tooth Splinting",
            Category = "General",
            ToothNumber = 21,
            ToothSurface = null,
            ScheduledAt = consult2Date
        }, CancellationToken.None);

        // Proc 3: Category == "General" without tooth number
        await procRepo.AddAsync(new ClinicalProcedure
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Gabriela Silang",
            ProcedureCode = "MED-003",
            ProcedureName = "Vaccination",
            Category = "Immunization",
            ToothNumber = null,
            ScheduledAt = consult3Date
        }, CancellationToken.None);

        await uow.SaveChangesAsync(CancellationToken.None);

        var chartHandler = new GetPatientChartQueryHandler(
            consultRepo, triageRepo, procRepo, labRepo, invoiceRepo, _clinicContext,
            patientRepo: patientRepo,
            dentalToothRepo: toothRepo);

        // Act
        var patientChart = await chartHandler.Handle(new GetPatientChartQuery(patientId), CancellationToken.None);

        // Assert Part 1: PatientChartDto.DentalTeeth
        patientChart.DentalTeeth.Should().NotBeNull();
        patientChart.DentalTeeth!.Should().HaveCount(4); // Excludes soft-deleted tooth 46

        var tooth16Filled = patientChart.DentalTeeth.First(t => t.ToothNumber == 16 && t.Status == ToothStatus.Filled);
        tooth16Filled.Surface.Should().Be("O");
        tooth16Filled.RecordedBy.Should().Be("Dr. Beta"); // UpdatedBy ?? CreatedBy

        var tooth16Decay = patientChart.DentalTeeth.First(t => t.ToothNumber == 16 && t.Status == ToothStatus.Decayed);
        tooth16Decay.Surface.Should().Be("MD");
        tooth16Decay.RecordedBy.Should().Be("Dr. Alpha"); // CreatedBy fallback

        // Assert Part 2: DentalProcedures & ProceduresHistory
        patientChart.DentalProcedures.Should().NotBeNull();
        patientChart.DentalProcedures!.Should().HaveCount(2); // DENT-001 and GEN-002
        patientChart.DentalProcedures.Should().Contain(p => p.ProcedureCode == "DENT-001" && p.ToothNumber == 16 && p.ToothSurface == "O");
        patientChart.DentalProcedures.Should().Contain(p => p.ProcedureCode == "GEN-002" && p.ToothNumber == 21);
        patientChart.DentalProcedures.Should().NotContain(p => p.ProcedureCode == "MED-003");

        // Assert Part 3: ConsultationEncounterDto.DentalFindings
        var encounters = patientChart.Consultations;
        encounters.Should().HaveCount(3);

        // Encounter 1 (linked via ConsultationId)
        var enc1 = encounters.First(c => c.Id == consult1Id);
        enc1.DentalFindings.Should().NotBeNull();
        enc1.DentalFindings!.Should().HaveCount(2);
        enc1.DentalFindings.Should().Contain(d => d.ToothNumber == 16 && d.Status == ToothStatus.Filled);
        enc1.DentalFindings.Should().Contain(d => d.ToothNumber == 16 && d.Status == ToothStatus.Decayed);
        enc1.DentalFindings.Should().NotContain(d => d.ToothNumber == 46); // Deleted record excluded

        // Encounter 2 (1 linked via ConsultationId, 1 linked via EncounterDate fallback)
        var enc2 = encounters.First(c => c.Id == consult2Id);
        enc2.DentalFindings.Should().NotBeNull();
        enc2.DentalFindings!.Should().HaveCount(2);
        enc2.DentalFindings.Should().Contain(d => d.ToothNumber == 21 && d.Status == ToothStatus.Healthy);
        enc2.DentalFindings.Should().Contain(d => d.ToothNumber == 36 && d.Status == ToothStatus.Missing);

        // Encounter 3 (no findings on this encounter date and no linked ConsultationId)
        var enc3 = encounters.First(c => c.Id == consult3Id);
        enc3.DentalFindings.Should().BeNull();
    }

    [Fact]
    public async Task BatchSave_WithRemoveConditionTrue_SoftDeletesConditionAccurately()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-BATCH-REM",
            FirstName = "Batch",
            LastName = "Remover",
            ContactNumber = "09170006666"
        }, CancellationToken.None);

        // Pre-existing conditions on tooth 16: Filled and Decay
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId, ClinicId = _clinicId, PatientId = patientId,
            ToothNumber = 16, Status = ToothStatus.Filled, Surface = "O"
        }, CancellationToken.None);
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId, ClinicId = _clinicId, PatientId = patientId,
            ToothNumber = 16, Status = ToothStatus.Decayed, Surface = "MD"
        }, CancellationToken.None);

        await uow.SaveChangesAsync(CancellationToken.None);

        var chartQueryHandler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContext);
        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetPatientDentalChartQuery>(q => q.PatientId == patientId), Arg.Any<CancellationToken>())
            .Returns(ci => chartQueryHandler.Handle(ci.Arg<GetPatientDentalChartQuery>(), ci.Arg<CancellationToken>()));

        var batchHandler = new BatchSaveDentalChartCommandHandler(toothRepo, patientRepo, uow, _clinicContext, sender);

        // Act: Batch remove Decay
        var command = new BatchSaveDentalChartCommand(
            PatientId: patientId,
            ConsultationId: null,
            Teeth: new List<ToothRecordInput>
            {
                new(ToothNumber: 16, Status: ToothStatus.Decayed, RemoveCondition: true)
            }
        );

        var result = await batchHandler.Handle(command, CancellationToken.None);

        // Assert: Decay is soft-deleted, Filled remains active
        result.Teeth.Should().HaveCount(1);
        result.Teeth[0].Status.Should().Be(ToothStatus.Filled);

        var allDb = await toothRepo.Query(t => t.PatientId == patientId && t.ToothNumber == 16, ignoreQueryFilters: true).ToListAsync();
        allDb.Should().HaveCount(2);
        allDb.First(t => t.Status == ToothStatus.Decayed).IsDeleted.Should().BeTrue();
        allDb.First(t => t.Status == ToothStatus.Filled).IsDeleted.Should().BeFalse();
    }

    [Fact]
    public async Task GetPatientChartQuery_WhenDentalRepoOmitted_HandlesGracefullyWithoutThrowing()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var consultRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var triageRepo = TestDbHelper.CreateRepository<TriageVitals>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-NO-DENTAL-REPO",
            FirstName = "Graceful",
            LastName = "Test",
            ContactNumber = "09170007777"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        // DentalToothRepo is null (omitted)
        var handler = new GetPatientChartQueryHandler(
            consultRepo, triageRepo, procRepo, labRepo, invoiceRepo, _clinicContext,
            patientRepo: patientRepo,
            dentalToothRepo: null);

        // Act
        var chart = await handler.Handle(new GetPatientChartQuery(patientId), CancellationToken.None);

        // Assert: Works gracefully without NullReferenceException
        chart.Should().NotBeNull();
        chart.DentalTeeth.Should().NotBeNull();
        chart.DentalTeeth.Should().BeEmpty();
    }
}

