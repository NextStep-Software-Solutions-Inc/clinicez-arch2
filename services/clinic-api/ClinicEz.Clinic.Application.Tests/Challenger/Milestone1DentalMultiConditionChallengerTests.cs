using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Consultations.DTOs;
using ClinicEz.Clinic.Application.Features.Dental.Commands;
using ClinicEz.Clinic.Application.Features.Dental.DTOs;
using ClinicEz.Clinic.Application.Features.Dental.Queries;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Challenger;

/// <summary>
/// Empirical Adversarial Verification Suite for Milestone 1:
/// Backend Multi-Condition Dental Records & Chart Sync.
/// 
/// Core Challenge Vectors:
/// 1. BatchSaveDentalChartCommand with mixed operations: simultaneous creation of multi-condition teeth
///    across adult (11-48) and child (51-85) numbering, superseding duplicate inputs, and clearing via Healthy.
/// 2. RecordedBy mapping: verify UpdatedBy ?? CreatedBy correctly flows into DentalToothRecordDto.RecordedBy
///    across GetPatientDentalChartQuery, GetPatientChartQuery, and UpsertDentalToothRecordCommand.
/// 3. Consultation timeline grouping: verify DentalFindings are grouped by ConsultationId and date matching,
///    and null when no findings exist.
/// 4. Boundary and stress conditions: multi-condition DMFT index, condition removal via RemoveCondition flag,
///    and atomic rollback under validation errors.
/// </summary>
public class Milestone1DentalMultiConditionChallengerTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private const string _tenantId = "tenant-challenger-m1";

    public Milestone1DentalMultiConditionChallengerTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffName.Returns("Dr. Challenger M1");
    }

    #region Challenge 1: BatchSave Mixed Operations Across Adult and Child Dentition

    [Fact]
    public async Task Challenge1_BatchSave_SimultaneousMultiConditionTeeth_AcrossAdultAndChild_PersistsAccurately()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-ADULT-CHILD-01",
            FirstName = "Empirical",
            LastName = "Challenger",
            ContactNumber = "09170001111"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var chartQueryHandler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContext);
        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetPatientDentalChartQuery>(q => q.PatientId == patientId), Arg.Any<CancellationToken>())
            .Returns(ci => chartQueryHandler.Handle(ci.Arg<GetPatientDentalChartQuery>(), ci.Arg<CancellationToken>()));

        var handler = new BatchSaveDentalChartCommandHandler(toothRepo, patientRepo, uow, _clinicContext, sender);

        // Mixed operation:
        // Adult teeth (11-48):
        // - Tooth 16: Multi-condition simultaneous creation: Filled on "O" and Decay on "MD"
        // - Tooth 21: Healthy
        // - Tooth 36: Missing
        // - Tooth 47: Crown
        // Child teeth (51-85):
        // - Tooth 55: Multi-condition simultaneous creation: Filled on "O" and Decay on "B"
        // - Tooth 61: Healthy
        // - Tooth 75: Extraction
        // - Tooth 84: Decay on "MOD"
        var command = new BatchSaveDentalChartCommand(
            PatientId: patientId,
            ConsultationId: null,
            Teeth: new List<ToothRecordInput>
            {
                new(ToothNumber: 16, Status: ToothStatus.Filled, Surface: "O", Notes: "Adult occlusal composite"),
                new(ToothNumber: 16, Status: ToothStatus.Decayed, Surface: "MD", Notes: "Adult recurrent caries"),
                new(ToothNumber: 21, Status: ToothStatus.Healthy, Surface: null, Notes: "Adult central incisor normal"),
                new(ToothNumber: 36, Status: ToothStatus.Missing, Surface: null, Notes: "Adult first molar missing"),
                new(ToothNumber: 47, Status: ToothStatus.Crowned, Surface: null, Notes: "Adult gold crown"),
                new(ToothNumber: 55, Status: ToothStatus.Filled, Surface: "O", Notes: "Child molar filled"),
                new(ToothNumber: 55, Status: ToothStatus.Decayed, Surface: "B", Notes: "Child buccal decay"),
                new(ToothNumber: 61, Status: ToothStatus.Healthy, Surface: null, Notes: "Child incisor healthy"),
                new(ToothNumber: 75, Status: ToothStatus.ForExtraction, Surface: null, Notes: "Child molar indicated for extraction"),
                new(ToothNumber: 84, Status: ToothStatus.Decayed, Surface: "MOD", Notes: "Child molar extensive caries")
            }
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.PatientId.Should().Be(patientId);

        // 8 distinct teeth recorded: 16, 21, 36, 47, 55, 61, 75, 84
        // With 10 condition rows (16 has 2, 55 has 2, other 6 have 1 each)
        result.Teeth.Should().HaveCount(10);

        // Verify Adult Tooth 16 has 2 distinct conditions
        var tooth16Records = result.Teeth.Where(t => t.ToothNumber == 16).ToList();
        tooth16Records.Should().HaveCount(2);
        tooth16Records.Should().ContainSingle(t => t.Status == ToothStatus.Filled && t.Surface == "O");
        tooth16Records.Should().ContainSingle(t => t.Status == ToothStatus.Decayed && t.Surface == "MD");

        // Verify Child Tooth 55 has 2 distinct conditions
        var tooth55Records = result.Teeth.Where(t => t.ToothNumber == 55).ToList();
        tooth55Records.Should().HaveCount(2);
        tooth55Records.Should().ContainSingle(t => t.Status == ToothStatus.Filled && t.Surface == "O");
        tooth55Records.Should().ContainSingle(t => t.Status == ToothStatus.Decayed && t.Surface == "B");

        // Verify child teeth 61, 75, 84 and adult teeth 21, 36, 47 are present
        result.Teeth.Should().ContainSingle(t => t.ToothNumber == 21 && t.Status == ToothStatus.Healthy);
        result.Teeth.Should().ContainSingle(t => t.ToothNumber == 36 && t.Status == ToothStatus.Missing);
        result.Teeth.Should().ContainSingle(t => t.ToothNumber == 47 && t.Status == ToothStatus.Crowned);
        result.Teeth.Should().ContainSingle(t => t.ToothNumber == 61 && t.Status == ToothStatus.Healthy);
        result.Teeth.Should().ContainSingle(t => t.ToothNumber == 75 && t.Status == ToothStatus.ForExtraction);
        result.Teeth.Should().ContainSingle(t => t.ToothNumber == 84 && t.Status == ToothStatus.Decayed && t.Surface == "MOD");

        // Verify Summary metrics
        result.Summary.Should().NotBeNull();
        result.Summary!.TotalTeethRecorded.Should().Be(8, "8 distinct teeth are recorded");
        result.Summary.HealthyCount.Should().Be(2, "Teeth 21 and 61 are healthy");
        result.Summary.DecayCount.Should().Be(3, "Teeth 16, 55, 84 have decay");
        result.Summary.FilledCount.Should().Be(2, "Teeth 16 and 55 have fillings");
        result.Summary.MissingCount.Should().Be(1, "Tooth 36 is missing");
        result.Summary.CrownCount.Should().Be(1, "Tooth 47 has crown");
        result.Summary.ExtractionCount.Should().Be(1, "Tooth 75 has extraction");

        // DMFT Index: distinct teeth that are Decayed (16, 55, 84), Missing (36), or Filled (16, 55)
        // Distinct set: {16, 36, 55, 84} = 4 distinct teeth!
        result.Summary.DmftIndex.Should().Be(4, "Distinct teeth with Decay, Missing, or Filled must equal 4 without double-counting tooth 16 or 55");
    }

    [Fact]
    public async Task Challenge1_BatchSave_SupersedingDuplicateInputs_KeepsLatestInputForSameStatus()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-SUPERSEDE-01",
            FirstName = "Supersede",
            LastName = "Test",
            ContactNumber = "09170002222"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var chartQueryHandler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContext);
        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetPatientDentalChartQuery>(q => q.PatientId == patientId), Arg.Any<CancellationToken>())
            .Returns(ci => chartQueryHandler.Handle(ci.Arg<GetPatientDentalChartQuery>(), ci.Arg<CancellationToken>()));

        var handler = new BatchSaveDentalChartCommandHandler(toothRepo, patientRepo, uow, _clinicContext, sender);

        // Batch contains:
        // Tooth 26: 2 inputs with SAME status (Decay), earlier has "O", later has "MOD"
        // Tooth 35: 2 inputs with SAME status (Filled) and SAME surface ("O"), later has updated notes
        var command = new BatchSaveDentalChartCommand(
            PatientId: patientId,
            ConsultationId: null,
            Teeth: new List<ToothRecordInput>
            {
                new(ToothNumber: 26, Status: ToothStatus.Decayed, Surface: "O", Notes: "Initial caries on O"),
                new(ToothNumber: 26, Status: ToothStatus.Decayed, Surface: "MOD", Notes: "Expanded caries finding to MOD"),
                new(ToothNumber: 35, Status: ToothStatus.Filled, Surface: "O", Notes: "Amalgam filling"),
                new(ToothNumber: 35, Status: ToothStatus.Filled, Surface: "O", Notes: "Composite filling revision")
            }
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert: Exactly 2 teeth saved (tooth 26 and tooth 35), 1 record each
        result.Teeth.Should().HaveCount(2);

        var tooth26 = result.Teeth.First(t => t.ToothNumber == 26);
        tooth26.Status.Should().Be(ToothStatus.Decayed);
        tooth26.Surface.Should().Be("MOD", "Later surface MOD supersedes earlier O");
        tooth26.Notes.Should().Be("Expanded caries finding to MOD");

        var tooth35 = result.Teeth.First(t => t.ToothNumber == 35);
        tooth35.Status.Should().Be(ToothStatus.Filled);
        tooth35.Surface.Should().Be("O");
        tooth35.Notes.Should().Be("Composite filling revision", "Later notes supersede earlier notes");
    }

    [Fact]
    public async Task Challenge1_BatchSave_ClearingViaHealthy_SoftDeletesAllExistingNonHealthyConditions()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-CLEAR-HEALTHY",
            FirstName = "Healthy",
            LastName = "Patient",
            ContactNumber = "09170003333"
        }, CancellationToken.None);

        // Pre-seed tooth 16 with 2 non-healthy conditions: Filled and Decay
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ToothNumber = 16,
            Status = ToothStatus.Filled,
            Surface = "O",
            Notes = "Existing filling"
        }, CancellationToken.None);

        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ToothNumber = 16,
            Status = ToothStatus.Decayed,
            Surface = "MD",
            Notes = "Existing decay"
        }, CancellationToken.None);

        // Pre-seed tooth 26 with Decay
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ToothNumber = 26,
            Status = ToothStatus.Decayed,
            Surface = "O",
            Notes = "Tooth 26 caries"
        }, CancellationToken.None);

        await uow.SaveChangesAsync(CancellationToken.None);

        var chartQueryHandler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContext);
        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetPatientDentalChartQuery>(q => q.PatientId == patientId), Arg.Any<CancellationToken>())
            .Returns(ci => chartQueryHandler.Handle(ci.Arg<GetPatientDentalChartQuery>(), ci.Arg<CancellationToken>()));

        var handler = new BatchSaveDentalChartCommandHandler(toothRepo, patientRepo, uow, _clinicContext, sender);

        // Batch save: Mark tooth 16 as Healthy with note "Successfully treated and restored to sound"
        var command = new BatchSaveDentalChartCommand(
            PatientId: patientId,
            ConsultationId: null,
            Teeth: new List<ToothRecordInput>
            {
                new(ToothNumber: 16, Status: ToothStatus.Healthy, Surface: null, Notes: "Successfully treated and restored to sound")
            }
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert:
        // Tooth 16 should now only have 1 active record: Healthy
        // Tooth 26 should remain untouched as Decay
        result.Teeth.Should().HaveCount(2);

        var tooth16Active = result.Teeth.Where(t => t.ToothNumber == 16).ToList();
        tooth16Active.Should().HaveCount(1);
        tooth16Active[0].Status.Should().Be(ToothStatus.Healthy);
        tooth16Active[0].Notes.Should().Be("Successfully treated and restored to sound");

        // Inspect database directly: verify pre-existing Filled and Decay on tooth 16 are soft-deleted
        var dbTooth16Deleted = await toothRepo.Query(t => t.PatientId == patientId && t.ToothNumber == 16 && t.IsDeleted, ignoreQueryFilters: true).ToListAsync();
        dbTooth16Deleted.Should().HaveCount(2, "Both Filled and Decay records must be marked IsDeleted = true");
        dbTooth16Deleted.Should().Contain(t => t.Status == ToothStatus.Filled && t.IsDeleted);
        dbTooth16Deleted.Should().Contain(t => t.Status == ToothStatus.Decayed && t.IsDeleted);

        // Tooth 26 remains intact
        var tooth26 = result.Teeth.First(t => t.ToothNumber == 26);
        tooth26.Status.Should().Be(ToothStatus.Decayed);
    }

    [Fact]
    public async Task Challenge1_BatchSave_SelectiveRemovalViaRemoveConditionFlag_RemovesOnlyTargetCondition()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-SELECTIVE-REMOVE",
            FirstName = "Selective",
            LastName = "Remove",
            ContactNumber = "09170004444"
        }, CancellationToken.None);

        // Tooth 16 has Filled on O, and Decay on MD
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ToothNumber = 16,
            Status = ToothStatus.Filled,
            Surface = "O",
            Notes = "Existing filling on O"
        }, CancellationToken.None);

        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ToothNumber = 16,
            Status = ToothStatus.Decayed,
            Surface = "MD",
            Notes = "Caries on MD"
        }, CancellationToken.None);

        await uow.SaveChangesAsync(CancellationToken.None);

        var chartQueryHandler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContext);
        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetPatientDentalChartQuery>(q => q.PatientId == patientId), Arg.Any<CancellationToken>())
            .Returns(ci => chartQueryHandler.Handle(ci.Arg<GetPatientDentalChartQuery>(), ci.Arg<CancellationToken>()));

        var handler = new BatchSaveDentalChartCommandHandler(toothRepo, patientRepo, uow, _clinicContext, sender);

        // Submit RemoveCondition = true specifically for Decay
        var command = new BatchSaveDentalChartCommand(
            PatientId: patientId,
            ConsultationId: null,
            Teeth: new List<ToothRecordInput>
            {
                new(ToothNumber: 16, Status: ToothStatus.Decayed, Surface: "MD", Notes: null, RemoveCondition: true)
            }
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert: Tooth 16 still has Filled active; Decay is removed
        result.Teeth.Should().HaveCount(1);
        result.Teeth[0].ToothNumber.Should().Be(16);
        result.Teeth[0].Status.Should().Be(ToothStatus.Filled);
        result.Teeth[0].Surface.Should().Be("O");

        // Verify in DB that Decay is soft-deleted and Filled is not deleted
        var dbRecords = await toothRepo.Query(t => t.PatientId == patientId && t.ToothNumber == 16, ignoreQueryFilters: true).ToListAsync();
        var filledDb = dbRecords.First(t => t.Status == ToothStatus.Filled);
        filledDb.IsDeleted.Should().BeFalse();

        var decayDb = dbRecords.First(t => t.Status == ToothStatus.Decayed);
        decayDb.IsDeleted.Should().BeTrue();
    }

    #endregion

    #region Challenge 2: RecordedBy Mapping (UpdatedBy ?? CreatedBy)

    [Fact]
    public async Task Challenge2_RecordedByMapping_FlowsUpdatedByOrCreatedBy_AcrossAllQueriesAndCommands()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var consultationRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var triageRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<LabOrder>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-RECORDEDBY-01",
            FirstName = "Juan",
            LastName = "RecordedBy",
            ContactNumber = "09170005555"
        }, CancellationToken.None);

        // Record A: Created by "Dr. First Creator", never updated (UpdatedBy is null)
        var recordA = new DentalToothRecord
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ToothNumber = 11,
            Status = ToothStatus.Healthy,
            CreatedBy = "Dr. First Creator",
            UpdatedBy = null,
            CreatedAt = DateTime.UtcNow.AddDays(-2)
        };
        await toothRepo.AddAsync(recordA, CancellationToken.None);

        // Record B: Created by "Dr. Original Dentist", subsequently updated by "Dr. Followup Specialist"
        var recordB = new DentalToothRecord
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ToothNumber = 16,
            Status = ToothStatus.Filled,
            Surface = "MOD",
            CreatedBy = "Dr. Original Dentist",
            UpdatedBy = "Dr. Followup Specialist",
            CreatedAt = DateTime.UtcNow.AddDays(-5),
            UpdatedAt = DateTime.UtcNow.AddDays(-1)
        };
        await toothRepo.AddAsync(recordB, CancellationToken.None);

        await uow.SaveChangesAsync(CancellationToken.None);

        // 1. Verify GetPatientDentalChartQuery mapping
        var dentalChartQueryHandler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContext);
        var dentalChart = await dentalChartQueryHandler.Handle(new GetPatientDentalChartQuery(patientId), CancellationToken.None);

        var tooth11Dto = dentalChart.Teeth.First(t => t.ToothNumber == 11);
        tooth11Dto.RecordedBy.Should().Be("Dr. First Creator", "When UpdatedBy is null, CreatedBy must be returned as RecordedBy");

        var tooth16Dto = dentalChart.Teeth.First(t => t.ToothNumber == 16);
        tooth16Dto.RecordedBy.Should().Be("Dr. Followup Specialist", "When UpdatedBy is present, UpdatedBy takes precedence over CreatedBy as RecordedBy");

        // 2. Verify GetPatientChartQuery mapping (in PatientChartDto.DentalTeeth)
        var patientChartQueryHandler = new GetPatientChartQueryHandler(
            consultationRepo,
            triageRepo,
            procRepo,
            labRepo,
            invoiceRepo,
            _clinicContext,
            patientRepo: patientRepo,
            dentalToothRepo: toothRepo);

        var patientChart = await patientChartQueryHandler.Handle(new GetPatientChartQuery(patientId), CancellationToken.None);

        patientChart.DentalTeeth.Should().NotBeNull();
        patientChart.DentalTeeth.Should().HaveCount(2);

        var chartTooth11 = patientChart.DentalTeeth!.First(t => t.ToothNumber == 11);
        chartTooth11.RecordedBy.Should().Be("Dr. First Creator");

        var chartTooth16 = patientChart.DentalTeeth!.First(t => t.ToothNumber == 16);
        chartTooth16.RecordedBy.Should().Be("Dr. Followup Specialist");

        // 3. Verify UpsertDentalToothRecordCommand returns correct RecordedBy
        var upsertHandler = new UpsertDentalToothRecordCommandHandler(toothRepo, patientRepo, uow, _clinicContext);
        
        // Update Tooth 11 from Healthy to Decay using staff context "Dr. Challenger M1"
        var upsertResult = await upsertHandler.Handle(new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 11,
            Status: ToothStatus.Decayed,
            Surface: "M",
            Notes: "New decay noted"
        ), CancellationToken.None);

        upsertResult.RecordedBy.Should().Be("Dr. Challenger M1", "Upsert result must return the active staff name as RecordedBy");
    }

    #endregion

    #region Challenge 3: Consultation Timeline Grouping (DentalFindings by ConsultationId & Date)

    [Fact]
    public async Task Challenge3_ConsultationTimelineGrouping_GroupsByConsultationIdAndDateMatching_Accurately()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var consultationRepo = TestDbHelper.CreateRepository<ConsultationEncounter>(context, sieve);
        var triageRepo = TestDbHelper.CreateRepository<PatientVitals>(context, sieve);
        var labRepo = TestDbHelper.CreateRepository<LabOrder>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new Patient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-TIMELINE-01",
            FirstName = "Maria",
            LastName = "Timeline",
            ContactNumber = "09170006666"
        }, CancellationToken.None);

        // Encounter 1: October 10, 2026 (Has ConsultationId A)
        var consultationIdA = Guid.NewGuid();
        var dateA = new DateTime(2026, 10, 10, 9, 30, 0, DateTimeKind.Utc);
        await consultationRepo.AddAsync(new ConsultationEncounter
        {
            Id = consultationIdA,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Maria Timeline",
            EncounterDate = dateA,
            DoctorName = "Dr. Santos",
            Assessment = "Dental checkup visit 1",
            IsSigned = true
        }, CancellationToken.None);

        // Encounter 2: October 15, 2026 (Has ConsultationId B)
        var consultationIdB = Guid.NewGuid();
        var dateB = new DateTime(2026, 10, 15, 14, 0, 0, DateTimeKind.Utc);
        await consultationRepo.AddAsync(new ConsultationEncounter
        {
            Id = consultationIdB,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Maria Timeline",
            EncounterDate = dateB,
            DoctorName = "Dr. Reyes",
            Assessment = "Dental restoration visit 2",
            IsSigned = true
        }, CancellationToken.None);

        // Encounter 3: October 20, 2026 (Medical consultation with ZERO dental findings)
        var consultationIdC = Guid.NewGuid();
        var dateC = new DateTime(2026, 10, 20, 11, 0, 0, DateTimeKind.Utc);
        await consultationRepo.AddAsync(new ConsultationEncounter
        {
            Id = consultationIdC,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Maria Timeline",
            EncounterDate = dateC,
            DoctorName = "Dr. Cruz",
            Assessment = "Hypertension routine follow-up",
            IsSigned = true
        }, CancellationToken.None);

        // Finding 1: Explicitly linked to Consultation A via ConsultationId
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ConsultationId = consultationIdA,
            ToothNumber = 16,
            Status = ToothStatus.Decayed,
            Surface = "MOD",
            CreatedAt = dateA.AddMinutes(15),
            CreatedBy = "Dr. Santos"
        }, CancellationToken.None);

        // Finding 2: Unlinked (ConsultationId = null), but created on the exact date of Consultation A (October 10, 2026)
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ConsultationId = null,
            ToothNumber = 21,
            Status = ToothStatus.Healthy,
            CreatedAt = new DateTime(2026, 10, 10, 16, 45, 0, DateTimeKind.Utc), // Same calendar day as Consultation A
            CreatedBy = "Dr. Santos"
        }, CancellationToken.None);

        // Finding 3: Explicitly linked to Consultation B via ConsultationId
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ConsultationId = consultationIdB,
            ToothNumber = 16,
            Status = ToothStatus.Filled,
            Surface = "MOD",
            CreatedAt = dateB.AddMinutes(30),
            CreatedBy = "Dr. Reyes"
        }, CancellationToken.None);

        // Finding 4: Unlinked (ConsultationId = null) and created on an unrelated date (September 1, 2026)
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ConsultationId = null,
            ToothNumber = 38,
            Status = ToothStatus.Missing,
            CreatedAt = new DateTime(2026, 9, 1, 10, 0, 0, DateTimeKind.Utc),
            CreatedBy = "Dr. Past"
        }, CancellationToken.None);

        await uow.SaveChangesAsync(CancellationToken.None);

        var patientChartQueryHandler = new GetPatientChartQueryHandler(
            consultationRepo,
            triageRepo,
            procRepo,
            labRepo,
            invoiceRepo,
            _clinicContext,
            patientRepo: patientRepo,
            dentalToothRepo: toothRepo);

        // Act
        var chart = await patientChartQueryHandler.Handle(new GetPatientChartQuery(patientId), CancellationToken.None);

        // Assert
        chart.Consultations.Should().HaveCount(3);

        // Order is descending by EncounterDate: Encounter 3 (Oct 20), Encounter 2 (Oct 15), Encounter 1 (Oct 10)
        var enc3 = chart.Consultations.First(c => c.Id == consultationIdC);
        var enc2 = chart.Consultations.First(c => c.Id == consultationIdB);
        var enc1 = chart.Consultations.First(c => c.Id == consultationIdA);

        // Encounter 1 (Oct 10): Should carry Finding 1 (Tooth 16 Decay via ConsultationId) AND Finding 2 (Tooth 21 Healthy via Date matching)
        enc1.DentalFindings.Should().NotBeNull();
        enc1.DentalFindings!.Should().HaveCount(2);
        enc1.DentalFindings.Should().ContainSingle(f => f.ToothNumber == 16 && f.Status == ToothStatus.Decayed);
        enc1.DentalFindings.Should().ContainSingle(f => f.ToothNumber == 21 && f.Status == ToothStatus.Healthy);

        // Encounter 2 (Oct 15): Should carry Finding 3 (Tooth 16 Filled via ConsultationId)
        enc2.DentalFindings.Should().NotBeNull();
        enc2.DentalFindings!.Should().HaveCount(1);
        enc2.DentalFindings.Should().ContainSingle(f => f.ToothNumber == 16 && f.Status == ToothStatus.Filled);

        // Encounter 3 (Oct 20): Zero dental findings -> DentalFindings must be NULL (not empty list)
        enc3.DentalFindings.Should().BeNull("Consultations without dental findings must have DentalFindings = null");

        // The patient-level DentalTeeth collection contains all 4 records (including unlinked tooth 38)
        chart.DentalTeeth.Should().NotBeNull();
        chart.DentalTeeth!.Should().HaveCount(4);
        chart.DentalTeeth.Should().ContainSingle(t => t.ToothNumber == 38 && t.Status == ToothStatus.Missing);
    }

    #endregion
}
