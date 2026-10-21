using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Dental.Commands;
using ClinicEz.Clinic.Application.Features.Dental.DTOs;
using ClinicEz.Clinic.Application.Features.Dental.Queries;
using ClinicEz.Clinic.Application.Features.Procedures.Commands;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Adversarial Stress Test Suite for Milestone MA (Backend Core)
/// Executed by Challenger 2 (teamwork_preview_challenger_ma_2).
///
/// Target Areas:
/// 1. BatchSaveDentalChartCommand:
///    - Atomic pre-validation rollback (if tooth #4 in a batch of 10 is invalid, zero teeth saved).
///    - Deduplication of duplicate tooth updates in the same batch (latest state preserved).
/// 2. ClinicalProcedure Tooth Tagging & Surface Normalization:
///    - Order procedure with and without tooth number.
///    - Uppercase surface normalization (e.g. "mod" -> "MOD", "  bL  " -> "BL", whitespace -> null).
/// 3. PublishClinicToDirectoryCommand:
///    - Case-insensitivity ("dental", "DENTAL", "Dental", "multispecialty", "Multi-Specialty", "medical", null, empty).
///    - Pre-flight readiness check enforcement (hours, licensed doctors, active services).
/// </summary>
public class ChallengerMaEmpiricalTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private const string _tenantId = "tenant-challenger-ma-2";

    public ChallengerMaEmpiricalTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffName.Returns("Dr. Challenger Tester");
    }

    #region 1. BatchSaveDentalChartCommand Stress Tests

    [Fact]
    public async Task BatchSave_AtomicRollback_WhenTooth4Of10HasInvalidToothNumber_RejectsBatchWithZeroTeethPersisted()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var sender = Substitute.For<ISender>();

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-STRESS-01",
            FirstName = "Andres",
            LastName = "Bonifacio",
            ContactNumber = "09181234567"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new BatchSaveDentalChartCommandHandler(toothRepo, patientRepo, uow, _clinicContext, sender);

        // Batch of 10 teeth, with tooth #4 being invalid: 99
        var teethInput = new List<ToothRecordInput>
        {
            new(ToothNumber: 11, Status: ToothStatus.Healthy, Surface: null, Notes: "Tooth 1"),
            new(ToothNumber: 12, Status: ToothStatus.Healthy, Surface: null, Notes: "Tooth 2"),
            new(ToothNumber: 13, Status: ToothStatus.Healthy, Surface: null, Notes: "Tooth 3"),
            new(ToothNumber: 99, Status: ToothStatus.Decayed, Surface: "O", Notes: "Tooth 4 - INVALID TOOTH NUMBER"),
            new(ToothNumber: 14, Status: ToothStatus.Healthy, Surface: null, Notes: "Tooth 5"),
            new(ToothNumber: 15, Status: ToothStatus.Healthy, Surface: null, Notes: "Tooth 6"),
            new(ToothNumber: 16, Status: ToothStatus.Decayed, Surface: "MOD", Notes: "Tooth 7"),
            new(ToothNumber: 17, Status: ToothStatus.Healthy, Surface: null, Notes: "Tooth 8"),
            new(ToothNumber: 18, Status: ToothStatus.Healthy, Surface: null, Notes: "Tooth 9"),
            new(ToothNumber: 21, Status: ToothStatus.Healthy, Surface: null, Notes: "Tooth 10")
        };

        var command = new BatchSaveDentalChartCommand(patientId, null, teethInput);

        // Act
        var act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*'99' is invalid under ISO 3950 FDI notation*");

        // Verify zero teeth saved in database (atomic rejection)
        var persistedTeeth = await toothRepo.Query(t => t.PatientId == patientId).ToListAsync();
        persistedTeeth.Should().BeEmpty("the entire batch must roll back atomically when tooth #4 is invalid");
    }

    [Fact]
    public async Task BatchSave_AtomicRollback_WhenTooth4Of10HasInvalidSurface_RejectsBatchWithZeroTeethPersisted()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var sender = Substitute.For<ISender>();

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-STRESS-02",
            FirstName = "Apolinario",
            LastName = "Mabini",
            ContactNumber = "09181234568"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new BatchSaveDentalChartCommandHandler(toothRepo, patientRepo, uow, _clinicContext, sender);

        // Batch of 10 teeth, with tooth #4 having an invalid surface "XYZ"
        var teethInput = new List<ToothRecordInput>
        {
            new(ToothNumber: 11, Status: ToothStatus.Healthy),
            new(ToothNumber: 12, Status: ToothStatus.Healthy),
            new(ToothNumber: 13, Status: ToothStatus.Healthy),
            new(ToothNumber: 14, Status: ToothStatus.Decayed, Surface: "XYZ"), // INVALID SURFACE
            new(ToothNumber: 15, Status: ToothStatus.Healthy),
            new(ToothNumber: 16, Status: ToothStatus.Filled, Surface: "MOD"),
            new(ToothNumber: 17, Status: ToothStatus.Healthy),
            new(ToothNumber: 18, Status: ToothStatus.Healthy),
            new(ToothNumber: 21, Status: ToothStatus.Healthy),
            new(ToothNumber: 22, Status: ToothStatus.Healthy)
        };

        var command = new BatchSaveDentalChartCommand(patientId, null, teethInput);

        // Act
        var act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*Invalid tooth surface 'XYZ'*");

        // Verify zero teeth saved in database
        var persistedTeeth = await toothRepo.Query(t => t.PatientId == patientId).ToListAsync();
        persistedTeeth.Should().BeEmpty("the entire batch must roll back atomically when tooth #4 has an invalid surface");
    }

    [Fact]
    public async Task BatchSave_AtomicRollback_ExistingTeethUntouched_WhenAnyToothInBatchIsInvalid()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var sender = Substitute.For<ISender>();

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-STRESS-03",
            FirstName = "Melchora",
            LastName = "Aquino",
            ContactNumber = "09181234569"
        }, CancellationToken.None);

        // Seed 2 existing valid teeth
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ToothNumber = 11,
            Status = ToothStatus.Healthy,
            Notes = "Original Tooth 11"
        }, CancellationToken.None);

        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ToothNumber = 12,
            Status = ToothStatus.Filled,
            Surface = "O",
            Notes = "Original Tooth 12"
        }, CancellationToken.None);

        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new BatchSaveDentalChartCommandHandler(toothRepo, patientRepo, uow, _clinicContext, sender);

        // Batch attempts to mutate tooth 11 and tooth 12, but contains invalid tooth 99
        var command = new BatchSaveDentalChartCommand(
            patientId,
            null,
            new List<ToothRecordInput>
            {
                new(ToothNumber: 11, Status: ToothStatus.Decayed, Notes: "Mutated"),
                new(ToothNumber: 12, Status: ToothStatus.ForExtraction, Notes: "Mutated"),
                new(ToothNumber: 99, Status: ToothStatus.Healthy) // Invalid
            }
        );

        // Act
        var act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<BadRequestException>();

        // Verify existing records remain completely untouched
        var persisted = await toothRepo.Query(t => t.PatientId == patientId).ToListAsync();
        persisted.Should().HaveCount(2);

        var t11 = persisted.First(t => t.ToothNumber == 11);
        t11.Status.Should().Be(ToothStatus.Healthy);
        t11.Notes.Should().Be("Original Tooth 11");

        var t12 = persisted.First(t => t.ToothNumber == 12);
        t12.Status.Should().Be(ToothStatus.Filled);
        t12.Notes.Should().Be("Original Tooth 12");
    }

    [Fact]
    public async Task BatchSave_DuplicateToothInSameBatch_PreservesLatestStateAndDeduplicates()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-STRESS-04",
            FirstName = "Gabriela",
            LastName = "Silang",
            ContactNumber = "09181234570"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var chartQueryHandler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContext);
        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetPatientDentalChartQuery>(q => q.PatientId == patientId), Arg.Any<CancellationToken>())
            .Returns(ci => chartQueryHandler.Handle(ci.Arg<GetPatientDentalChartQuery>(), ci.Arg<CancellationToken>()));

        var handler = new BatchSaveDentalChartCommandHandler(toothRepo, patientRepo, uow, _clinicContext, sender);

        // Batch contains duplicates for tooth 16:
        // 1st entry: Status = Decay, Surface = "O", Notes = "Initial cavity observation"
        // 2nd entry for tooth 16: Status = Filled, Surface = "dom", Notes = "Composite restoration completed in same session"
        var command = new BatchSaveDentalChartCommand(
            patientId,
            null,
            new List<ToothRecordInput>
            {
                new(ToothNumber: 11, Status: ToothStatus.Healthy, Surface: null, Notes: "Normal incisor"),
                new(ToothNumber: 16, Status: ToothStatus.Decayed, Surface: "O", Notes: "Initial cavity observation"),
                new(ToothNumber: 21, Status: ToothStatus.Healthy, Surface: null, Notes: "Normal incisor"),
                new(ToothNumber: 16, Status: ToothStatus.Filled, Surface: "dom", Notes: "Composite restoration completed in same session")
            }
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Teeth.Should().HaveCount(3, "tooth 16 must be deduplicated to a single record");

        var tooth16 = result.Teeth.First(t => t.ToothNumber == 16);
        tooth16.Status.Should().Be(ToothStatus.Filled, "latest state in batch must take precedence");
        tooth16.Surface.Should().Be("MOD", "surface must be canonicalized in [MODBL] order");
        tooth16.Notes.Should().Be("Composite restoration completed in same session", "latest notes must be retained");

        // Verify database persistence
        var dbRecords = await toothRepo.Query(t => t.PatientId == patientId).ToListAsync();
        dbRecords.Should().HaveCount(3);
        var dbTooth16 = dbRecords.First(t => t.ToothNumber == 16);
        dbTooth16.Status.Should().Be(ToothStatus.Filled);
        dbTooth16.Surface.Should().Be("MOD");
        dbTooth16.Notes.Should().Be("Composite restoration completed in same session");
    }

    [Fact]
    public async Task BatchSave_TripleDuplicateToothInSameBatch_PreservesLatestState()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-STRESS-05",
            FirstName = "Marcelo",
            LastName = "Del Pilar",
            ContactNumber = "09181234571"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var chartQueryHandler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContext);
        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetPatientDentalChartQuery>(q => q.PatientId == patientId), Arg.Any<CancellationToken>())
            .Returns(ci => chartQueryHandler.Handle(ci.Arg<GetPatientDentalChartQuery>(), ci.Arg<CancellationToken>()));

        var handler = new BatchSaveDentalChartCommandHandler(toothRepo, patientRepo, uow, _clinicContext, sender);

        // Triple duplicate for tooth 46: Healthy -> Decay -> Crown
        var command = new BatchSaveDentalChartCommand(
            patientId,
            null,
            new List<ToothRecordInput>
            {
                new(ToothNumber: 46, Status: ToothStatus.Healthy, Notes: "Step 1"),
                new(ToothNumber: 46, Status: ToothStatus.Decayed, Surface: "O", Notes: "Step 2"),
                new(ToothNumber: 46, Status: ToothStatus.Crowned, Surface: "MODBL", Notes: "Step 3 - Final Crown")
            }
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Teeth.Should().HaveCount(1);
        var tooth46 = result.Teeth[0];
        tooth46.Status.Should().Be(ToothStatus.Crowned);
        tooth46.Surface.Should().Be("MODBL");
        tooth46.Notes.Should().Be("Step 3 - Final Crown");
    }

    [Fact]
    public async Task BatchSave_DuplicateUpdateOverwritesExistingDbRecord_WithLatestState()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-STRESS-06",
            FirstName = "Juan",
            LastName = "Luna",
            ContactNumber = "09181234572"
        }, CancellationToken.None);

        // Existing tooth 36 Healthy
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ToothNumber = 36,
            Status = ToothStatus.Healthy,
            Notes = "Sound at baseline"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var chartQueryHandler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContext);
        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetPatientDentalChartQuery>(q => q.PatientId == patientId), Arg.Any<CancellationToken>())
            .Returns(ci => chartQueryHandler.Handle(ci.Arg<GetPatientDentalChartQuery>(), ci.Arg<CancellationToken>()));

        var handler = new BatchSaveDentalChartCommandHandler(toothRepo, patientRepo, uow, _clinicContext, sender);

        // Batch contains duplicates for tooth 36: Decay then Extraction
        var command = new BatchSaveDentalChartCommand(
            patientId,
            null,
            new List<ToothRecordInput>
            {
                new(ToothNumber: 36, Status: ToothStatus.Decayed, Surface: "O", Notes: "Severe caries"),
                new(ToothNumber: 36, Status: ToothStatus.ForExtraction, Surface: null, Notes: "Extracted completely")
            }
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Teeth.Should().HaveCount(1);
        var tooth36 = result.Teeth[0];
        tooth36.Status.Should().Be(ToothStatus.ForExtraction);
        tooth36.Notes.Should().Be("Extracted completely");

        var dbRecord = await toothRepo.Query(t => t.PatientId == patientId).FirstAsync();
        dbRecord.Status.Should().Be(ToothStatus.ForExtraction);
        dbRecord.Notes.Should().Be("Extracted completely");
    }

    #endregion

    #region 2. ClinicalProcedure Tooth Tagging & Surface Normalization Tests

    [Fact]
    public async Task OrderProcedure_WithToothNumberAndLowercaseSurface_NormalizesSurfaceToUppercase()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var handler = new OrderProcedureCommandHandler(procRepo, uow, _clinicContext);

        var patientId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();

        var command = new OrderProcedureCommand(
            patientId,
            "Emilio Jacinto",
            null,
            null,
            "DENT-01",
            "Composite Restoration (Filling)",
            "Dental",
            doctorId,
            "Dr. Dental Specialist",
            null,
            null,
            null,
            16,
            "mod" // Lowercase input
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.ToothNumber.Should().Be(16);
        result.ToothSurface.Should().Be("MOD", "lowercase surfaces must be normalized to uppercase");

        var persisted = await procRepo.Query(p => p.Id == result.Id).FirstOrDefaultAsync();
        persisted.Should().NotBeNull();
        persisted!.ToothNumber.Should().Be(16);
        persisted.ToothSurface.Should().Be("MOD");
    }

    [Fact]
    public async Task OrderProcedure_WithWhitespaceAndMixedCaseSurface_NormalizesToUppercaseTrimmed()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var handler = new OrderProcedureCommandHandler(procRepo, uow, _clinicContext);

        var patientId = Guid.NewGuid();

        var command = new OrderProcedureCommand(
            patientId,
            "Antonio Luna",
            null,
            null,
            "DENT-02",
            "Buccal-Lingual Sealant",
            "Dental",
            null,
            null,
            null,
            null,
            null,
            24,
            "  bL  " // Mixed case with leading/trailing whitespace
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.ToothNumber.Should().Be(24);
        result.ToothSurface.Should().Be("BL", "whitespace must be trimmed and characters uppercased");

        var persisted = await procRepo.Query(p => p.Id == result.Id).FirstAsync();
        persisted.ToothNumber.Should().Be(24);
        persisted.ToothSurface.Should().Be("BL");
    }

    [Fact]
    public async Task OrderProcedure_WithWhitespaceOnlySurface_NormalizesToNull()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var handler = new OrderProcedureCommandHandler(procRepo, uow, _clinicContext);

        var patientId = Guid.NewGuid();

        var command = new OrderProcedureCommand(
            patientId,
            "Gregorio Del Pilar",
            null,
            null,
            "DENT-03",
            "Root Canal Treatment",
            "Dental",
            null,
            null,
            null,
            null,
            null,
            36,
            "   " // Whitespace only
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.ToothNumber.Should().Be(36);
        result.ToothSurface.Should().BeNull("whitespace-only surface must normalize to null");

        var persisted = await procRepo.Query(p => p.Id == result.Id).FirstAsync();
        persisted.ToothNumber.Should().Be(36);
        persisted.ToothSurface.Should().BeNull();
    }

    [Fact]
    public async Task OrderProcedure_WithoutToothNumber_PersistsAsNull()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var handler = new OrderProcedureCommandHandler(procRepo, uow, _clinicContext);

        var patientId = Guid.NewGuid();

        // Standard medical procedure with no tooth tagging
        var command = new OrderProcedureCommand(
            patientId,
            "Josefa Llanes Escoda",
            null,
            null,
            "MED-01",
            "Nebulization Therapy",
            "Respiratory",
            null,
            null,
            null,
            null,
            null,
            null,
            null
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.ToothNumber.Should().BeNull("non-dental procedures should have null ToothNumber");
        result.ToothSurface.Should().BeNull("non-dental procedures should have null ToothSurface");

        var persisted = await procRepo.Query(p => p.Id == result.Id).FirstAsync();
        persisted.ToothNumber.Should().BeNull();
        persisted.ToothSurface.Should().BeNull();
    }

    [Fact]
    public async Task OrderProcedure_WithChildDeciduousTooth_PersistsSuccessfully()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var handler = new OrderProcedureCommandHandler(procRepo, uow, _clinicContext);

        var patientId = Guid.NewGuid();

        var command = new OrderProcedureCommand(
            patientId,
            "Pediatric Patient",
            null,
            null,
            "DENT-PED-01",
            "Pulpotomy",
            "Dental",
            null,
            null,
            null,
            null,
            null,
            55, // Primary upper right second molar
            "o"
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.ToothNumber.Should().Be(55);
        result.ToothSurface.Should().Be("O");

        var persisted = await procRepo.Query(p => p.Id == result.Id).FirstAsync();
        persisted.ToothNumber.Should().Be(55);
        persisted.ToothSurface.Should().Be("O");
    }

    #endregion

    #region 3. PublishClinicToDirectoryCommand Stress Tests

    [Theory]
    [InlineData("dental", "Dental Clinic")]
    [InlineData("DENTAL", "Dental Clinic")]
    [InlineData("Dental", "Dental Clinic")]
    [InlineData("  dEnTaL  ", "Dental Clinic")]
    [InlineData("multispecialty", "Multi-Specialty Clinic")]
    [InlineData("Multi-Specialty", "Multi-Specialty Clinic")]
    [InlineData("MULTI-SPECIALTY", "Multi-Specialty Clinic")]
    [InlineData("MultiSpecialty", "Multi-Specialty Clinic")]
    [InlineData("medical", "Ambulatory Clinic")]
    [InlineData("MEDICAL", "Ambulatory Clinic")]
    [InlineData("Medical", "Ambulatory Clinic")]
    [InlineData(null, "Ambulatory Clinic")]
    [InlineData("", "Ambulatory Clinic")]
    [InlineData("   ", "Ambulatory Clinic")]
    [InlineData("GeneralPractice", "Ambulatory Clinic")]
    public async Task PublishClinic_CaseInsensitivity_MapsClassificationCorrectly(
        string? specialtyMode,
        string expectedClassification)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var interopPublisher = Substitute.For<IInteropPublisher>();

        // Active doctor with PRC license
        await staffRepo.AddAsync(new StaffMember
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            FirstName = "Jose",
            LastName = "Rizal",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-0012345",
            IsActive = true
        }, CancellationToken.None);

        // Active service item
        await servicesRepo.AddAsync(new ClinicServiceItem
        {
            ClinicId = _clinicId,
            Code = "SRV-TEST",
            Name = "General Examination",
            Category = "Consultation",
            StandardPrice = 500.00m,
            IsActive = true
        }, CancellationToken.None);

        var settings = new ClinicSettings
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Test Healthcare Hub",
            OperatingHours = "8:00 AM - 5:00 PM Mon-Fri",
            SpecialtyMode = specialtyMode!,
            IsDirectoryPublished = false
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, interopPublisher);

        // Act
        var result = await handler.Handle(new PublishClinicToDirectoryCommand(true), CancellationToken.None);

        // Assert
        result.Success.Should().BeTrue();
        result.IsPublished.Should().BeTrue();
        settings.IsDirectoryPublished.Should().BeTrue();

        interopPublisher.Received(1).Enqueue(
            InteropTypes.FacilityDirectoryUpdated,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            _clinicId,
            Arg.Is<FacilityCreatedEvent>(e => e.Classification == expectedClassification));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task PublishClinic_ReadinessCheck_ThrowsWhenOperatingHoursMissing(string invalidOperatingHours)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var interopPublisher = Substitute.For<IInteropPublisher>();

        await staffRepo.AddAsync(new StaffMember
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            FirstName = "Jose",
            LastName = "Rizal",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-0012345",
            IsActive = true
        }, CancellationToken.None);

        await servicesRepo.AddAsync(new ClinicServiceItem
        {
            ClinicId = _clinicId,
            Code = "SRV-TEST",
            Name = "General Consultation",
            Category = "Consultation",
            StandardPrice = 500.00m,
            IsActive = true
        }, CancellationToken.None);

        var settings = new ClinicSettings
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Test Clinic",
#pragma warning disable CS8601
            OperatingHours = invalidOperatingHours!,
#pragma warning restore CS8601
            SpecialtyMode = "Dental",
            IsDirectoryPublished = false
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, interopPublisher);

        // Act
        var act = async () => await handler.Handle(new PublishClinicToDirectoryCommand(true), CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*readiness checks failed*Operating hours must be configured*");

        interopPublisher.DidNotReceiveWithAnyArgs().Enqueue<FacilityCreatedEvent>(default!, default!, default!, default, default!);
        settings.IsDirectoryPublished.Should().BeFalse();
    }

    [Fact]
    public async Task PublishClinic_ReadinessCheck_ThrowsWhenNoDoctorsExist()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var interopPublisher = Substitute.For<IInteropPublisher>();

        // Zero staff members added

        await servicesRepo.AddAsync(new ClinicServiceItem
        {
            ClinicId = _clinicId,
            Code = "SRV-TEST",
            Name = "General Consultation",
            Category = "Consultation",
            StandardPrice = 500.00m,
            IsActive = true
        }, CancellationToken.None);

        var settings = new ClinicSettings
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Test Clinic",
            OperatingHours = "8:00 AM - 5:00 PM",
            SpecialtyMode = "Dental",
            IsDirectoryPublished = false
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, interopPublisher);

        // Act
        var act = async () => await handler.Handle(new PublishClinicToDirectoryCommand(true), CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*At least one active licensed doctor with PRC license number is required*");

        interopPublisher.DidNotReceiveWithAnyArgs().Enqueue<FacilityCreatedEvent>(default!, default!, default!, default, default!);
    }

    [Fact]
    public async Task PublishClinic_ReadinessCheck_ThrowsWhenDoctorLacksPrcLicense()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var interopPublisher = Substitute.For<IInteropPublisher>();

        // Doctor exists, but PrcLicenseNumber is empty
        await staffRepo.AddAsync(new StaffMember
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            FirstName = "Uncredentialed",
            LastName = "Doctor",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "", // Empty PRC
            IsActive = true
        }, CancellationToken.None);

        await servicesRepo.AddAsync(new ClinicServiceItem
        {
            ClinicId = _clinicId,
            Code = "SRV-TEST",
            Name = "General Consultation",
            Category = "Consultation",
            StandardPrice = 500.00m,
            IsActive = true
        }, CancellationToken.None);

        var settings = new ClinicSettings
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Test Clinic",
            OperatingHours = "8:00 AM - 5:00 PM",
            SpecialtyMode = "Dental",
            IsDirectoryPublished = false
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, interopPublisher);

        // Act
        var act = async () => await handler.Handle(new PublishClinicToDirectoryCommand(true), CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*At least one active licensed doctor with PRC license number is required*");
    }

    [Fact]
    public async Task PublishClinic_ReadinessCheck_ThrowsWhenDoctorIsInactive()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var interopPublisher = Substitute.For<IInteropPublisher>();

        // Doctor has PRC, but IsActive = false
        await staffRepo.AddAsync(new StaffMember
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            FirstName = "Inactive",
            LastName = "Physician",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-1234567",
            IsActive = false // Inactive
        }, CancellationToken.None);

        await servicesRepo.AddAsync(new ClinicServiceItem
        {
            ClinicId = _clinicId,
            Code = "SRV-TEST",
            Name = "General Consultation",
            Category = "Consultation",
            StandardPrice = 500.00m,
            IsActive = true
        }, CancellationToken.None);

        var settings = new ClinicSettings
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Test Clinic",
            OperatingHours = "8:00 AM - 5:00 PM",
            SpecialtyMode = "Dental",
            IsDirectoryPublished = false
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, interopPublisher);

        // Act
        var act = async () => await handler.Handle(new PublishClinicToDirectoryCommand(true), CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*At least one active licensed doctor with PRC license number is required*");
    }

    [Fact]
    public async Task PublishClinic_ReadinessCheck_ThrowsWhenStaffIsNotDoctorRole()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var interopPublisher = Substitute.For<IInteropPublisher>();

        // Staff member has PRC and IsActive=true, but Role = Nurse
        await staffRepo.AddAsync(new StaffMember
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            FirstName = "Nurse",
            LastName = "Joy",
            Role = StaffRole.Nurse,
            PrcLicenseNumber = "PRC-NURSE-1",
            IsActive = true
        }, CancellationToken.None);

        await servicesRepo.AddAsync(new ClinicServiceItem
        {
            ClinicId = _clinicId,
            Code = "SRV-TEST",
            Name = "General Consultation",
            Category = "Consultation",
            StandardPrice = 500.00m,
            IsActive = true
        }, CancellationToken.None);

        var settings = new ClinicSettings
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Test Clinic",
            OperatingHours = "8:00 AM - 5:00 PM",
            SpecialtyMode = "Dental",
            IsDirectoryPublished = false
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, interopPublisher);

        // Act
        var act = async () => await handler.Handle(new PublishClinicToDirectoryCommand(true), CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*At least one active licensed doctor with PRC license number is required*");
    }

    [Fact]
    public async Task PublishClinic_ReadinessCheck_ThrowsWhenActiveServicesMissing()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var interopPublisher = Substitute.For<IInteropPublisher>();

        await staffRepo.AddAsync(new StaffMember
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            FirstName = "Jose",
            LastName = "Rizal",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-0012345",
            IsActive = true
        }, CancellationToken.None);

        // Zero service items

        var settings = new ClinicSettings
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Test Clinic",
            OperatingHours = "8:00 AM - 5:00 PM",
            SpecialtyMode = "Dental",
            IsDirectoryPublished = false
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, interopPublisher);

        // Act
        var act = async () => await handler.Handle(new PublishClinicToDirectoryCommand(true), CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*At least one active clinic service must be published in the fee schedule*");
    }

    [Fact]
    public async Task PublishClinic_ReadinessCheck_ThrowsWhenServiceIsInactive()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var interopPublisher = Substitute.For<IInteropPublisher>();

        await staffRepo.AddAsync(new StaffMember
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            FirstName = "Jose",
            LastName = "Rizal",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "PRC-0012345",
            IsActive = true
        }, CancellationToken.None);

        // Service exists, but IsActive = false
        await servicesRepo.AddAsync(new ClinicServiceItem
        {
            ClinicId = _clinicId,
            Code = "SRV-TEST",
            Name = "Deprecated Consultation",
            Category = "Consultation",
            StandardPrice = 500.00m,
            IsActive = false
        }, CancellationToken.None);

        var settings = new ClinicSettings
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Test Clinic",
            OperatingHours = "8:00 AM - 5:00 PM",
            SpecialtyMode = "Dental",
            IsDirectoryPublished = false
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, interopPublisher);

        // Act
        var act = async () => await handler.Handle(new PublishClinicToDirectoryCommand(true), CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*At least one active clinic service must be published in the fee schedule*");
    }

    [Fact]
    public async Task PublishClinic_ReadinessCheck_AggregatesAllMissingChecks()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var interopPublisher = Substitute.For<IInteropPublisher>();

        // Missing OperatingHours, Doctor, and Services
        var settings = new ClinicSettings
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Completely Unconfigured Clinic",
            OperatingHours = "",
            SpecialtyMode = "Dental",
            IsDirectoryPublished = false
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, interopPublisher);

        // Act
        var act = async () => await handler.Handle(new PublishClinicToDirectoryCommand(true), CancellationToken.None);

        // Assert
        var ex = await act.Should().ThrowAsync<InvalidOperationException>();
        ex.WithMessage("*Operating hours must be configured*");
        ex.WithMessage("*At least one active licensed doctor with PRC license number is required*");
        ex.WithMessage("*At least one active clinic service must be published in the fee schedule*");
    }

    [Fact]
    public async Task PublishClinic_Unpublishing_BypassesReadinessChecks()
    {
        // Arrange: clinic is currently published, but has NO doctors, NO operating hours, NO services
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<ClinicSettings>(context, sieve);
        var staffRepo = TestDbHelper.CreateRepository<StaffMember>(context, sieve);
        var servicesRepo = TestDbHelper.CreateRepository<ClinicServiceItem>(context, sieve);
        var interopPublisher = Substitute.For<IInteropPublisher>();

        var settings = new ClinicSettings
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            ClinicName = "Closing Clinic",
            OperatingHours = "",
            SpecialtyMode = "Dental",
            IsDirectoryPublished = true
        };
        await settingsRepo.AddAsync(settings, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new PublishClinicToDirectoryCommandHandler(
            settingsRepo, staffRepo, servicesRepo, _clinicContext, uow, interopPublisher);

        // Act: Unpublish (IsPublished = false)
        var result = await handler.Handle(new PublishClinicToDirectoryCommand(false), CancellationToken.None);

        // Assert: Succeeds without readiness check errors
        result.Success.Should().BeTrue();
        result.IsPublished.Should().BeFalse();
        settings.IsDirectoryPublished.Should().BeFalse();

        interopPublisher.Received(1).Enqueue(
            InteropTypes.FacilityDirectoryUpdated,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            _clinicId,
            Arg.Is<FacilityCreatedEvent>(e => e.IsPublic == false));
    }

    #endregion
}
