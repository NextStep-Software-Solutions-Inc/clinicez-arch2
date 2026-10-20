using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Features.Dental.Commands;
using ClinicEz.Clinic.Application.Features.Dental.DTOs;
using ClinicEz.Clinic.Application.Features.Dental.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Challenger 1 Empirical Stress Test & Adversarial Verification Suite for Milestone MA (Backend Core):
/// 1. Complete FDI World Dental Federation (ISO 3950) boundaries: adult 11-48, child 51-85, and extensive rejection of all invalid boundaries.
/// 2. Surface permutations, casing, deduplication, and invalid character rejection ([MODBL]).
/// 3. Batch save atomicity, duplicate resolution, and mixed dentition.
/// 4. Multi-tenant query filter isolation across ClinicId and soft-deletion.
/// 5. Procedure tooth tagging and dental chart aggregation.
/// 6. Controller endpoint security attributes and route mapping.
/// </summary>
public class ChallengerMaDentalCoreStressTests
{
    private readonly IClinicContext _clinicContextA;
    private readonly IClinicContext _clinicContextB;
    private readonly Guid _clinicIdA = Guid.NewGuid();
    private readonly Guid _clinicIdB = Guid.NewGuid();
    private const string _tenantIdA = "tenant-stress-clinic-a";
    private const string _tenantIdB = "tenant-stress-clinic-b";

    public ChallengerMaDentalCoreStressTests()
    {
        _clinicContextA = Substitute.For<IClinicContext>();
        _clinicContextA.ClinicId.Returns(_clinicIdA);
        _clinicContextA.TenantId.Returns(_tenantIdA);
        _clinicContextA.StaffName.Returns("Dr. Challenger A");

        _clinicContextB = Substitute.For<IClinicContext>();
        _clinicContextB.ClinicId.Returns(_clinicIdB);
        _clinicContextB.TenantId.Returns(_tenantIdB);
        _clinicContextB.StaffName.Returns("Dr. Challenger B");
    }

    // =========================================================================
    // 1. FDI TOOTH NUMBER BOUNDARIES (Adult 11-48, Deciduous 51-85)
    // =========================================================================

    [Theory]
    // Adult Quadrant 1 (Maxillary Right): 11 to 18
    [InlineData(11)] [InlineData(12)] [InlineData(13)] [InlineData(14)]
    [InlineData(15)] [InlineData(16)] [InlineData(17)] [InlineData(18)]
    // Adult Quadrant 2 (Maxillary Left): 21 to 28
    [InlineData(21)] [InlineData(22)] [InlineData(23)] [InlineData(24)]
    [InlineData(25)] [InlineData(26)] [InlineData(27)] [InlineData(28)]
    // Adult Quadrant 3 (Mandibular Left): 31 to 38
    [InlineData(31)] [InlineData(32)] [InlineData(33)] [InlineData(34)]
    [InlineData(35)] [InlineData(36)] [InlineData(37)] [InlineData(38)]
    // Adult Quadrant 4 (Mandibular Right): 41 to 48
    [InlineData(41)] [InlineData(42)] [InlineData(43)] [InlineData(44)]
    [InlineData(45)] [InlineData(46)] [InlineData(47)] [InlineData(48)]
    public void ValidateToothNumber_All32AdultFdiTeeth_AreValid(int adultToothNumber)
    {
        // Act & Assert
        var act = () => UpsertDentalToothRecordCommandHandler.ValidateToothNumber(adultToothNumber);
        act.Should().NotThrow();
    }

    [Theory]
    // Child Quadrant 5 (Maxillary Right): 51 to 55
    [InlineData(51)] [InlineData(52)] [InlineData(53)] [InlineData(54)] [InlineData(55)]
    // Child Quadrant 6 (Maxillary Left): 61 to 65
    [InlineData(61)] [InlineData(62)] [InlineData(63)] [InlineData(64)] [InlineData(65)]
    // Child Quadrant 7 (Mandibular Left): 71 to 75
    [InlineData(71)] [InlineData(72)] [InlineData(73)] [InlineData(74)] [InlineData(75)]
    // Child Quadrant 8 (Mandibular Right): 81 to 85
    [InlineData(81)] [InlineData(82)] [InlineData(83)] [InlineData(84)] [InlineData(85)]
    public void ValidateToothNumber_All20ChildDeciduousFdiTeeth_AreValid(int childToothNumber)
    {
        // Act & Assert
        var act = () => UpsertDentalToothRecordCommandHandler.ValidateToothNumber(childToothNumber);
        act.Should().NotThrow();
    }

    [Theory]
    // Zero, negative numbers, extreme integers
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(-10)]
    [InlineData(-99)]
    [InlineData(int.MinValue)]
    [InlineData(int.MaxValue)]
    // Boundaries around adult quadrants
    [InlineData(1)]
    [InlineData(10)]
    [InlineData(19)]
    [InlineData(20)]
    [InlineData(29)]
    [InlineData(30)]
    [InlineData(39)]
    [InlineData(40)]
    [InlineData(49)]
    [InlineData(50)]
    // Boundaries around deciduous quadrants (51-55, 61-65, 71-75, 81-85)
    [InlineData(56)] [InlineData(57)] [InlineData(58)] [InlineData(59)] [InlineData(60)]
    [InlineData(66)] [InlineData(67)] [InlineData(68)] [InlineData(69)] [InlineData(70)]
    [InlineData(76)] [InlineData(77)] [InlineData(78)] [InlineData(79)] [InlineData(80)]
    [InlineData(86)] [InlineData(87)] [InlineData(88)] [InlineData(89)] [InlineData(90)]
    // Beyond valid quadrants
    [InlineData(91)]
    [InlineData(95)]
    [InlineData(99)]
    [InlineData(100)]
    [InlineData(111)]
    public void ValidateToothNumber_AllInvalidToothNumbers_ThrowBadRequestException(int invalidToothNumber)
    {
        // Act
        var act = () => UpsertDentalToothRecordCommandHandler.ValidateToothNumber(invalidToothNumber);

        // Assert
        act.Should().Throw<BadRequestException>()
            .WithMessage($"*{invalidToothNumber}*is invalid under ISO 3950 FDI notation*");
    }

    // =========================================================================
    // 2. SURFACE PERMUTATIONS, DEDUPLICATION & CHARACTER REJECTION
    // =========================================================================

    [Theory]
    // Permutations and casing
    [InlineData("dom", "MOD")]
    [InlineData("DOM", "MOD")]
    [InlineData("BBL", "BL")]
    [InlineData("bbl", "BL")]
    [InlineData("modbl", "MODBL")]
    [InlineData("LBDOM", "MODBL")]
    [InlineData("lbodm", "MODBL")]
    [InlineData("o", "O")]
    [InlineData("d", "D")]
    [InlineData("m", "M")]
    [InlineData("b", "B")]
    [InlineData("l", "L")]
    // Duplicates and repeated letters
    [InlineData("MMMOOODDD", "MOD")]
    [InlineData("BBBBBLLLLL", "BL")]
    [InlineData("OOO", "O")]
    // Whitespace handling
    [InlineData("  d   o   m  ", "MOD")]
    [InlineData("\td\no\rm\t", "MOD")]
    [InlineData("   B B L   ", "BL")]
    public void NormalizeAndSortSurfaces_ValidInputs_SortsCanonicallyToMODBL(string input, string expected)
    {
        // Act
        var result = UpsertDentalToothRecordCommandHandler.NormalizeAndSortSurfaces(input);

        // Assert
        result.Should().Be(expected);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t\n\r ")]
    public void NormalizeAndSortSurfaces_NullOrWhitespace_ReturnsNull(string? input)
    {
        // Act
        var result = UpsertDentalToothRecordCommandHandler.NormalizeAndSortSurfaces(input);

        // Assert
        result.Should().BeNull();
    }

    [Theory]
    [InlineData("X")]
    [InlineData("Z")]
    [InlineData("1")]
    [InlineData("@")]
    [InlineData("#")]
    [InlineData("$")]
    [InlineData("%")]
    [InlineData("!")]
    [InlineData("?")]
    [InlineData("-")]
    [InlineData("_")]
    [InlineData("O-D")]
    [InlineData("M1")]
    [InlineData("domX")]
    [InlineData("BBLZ")]
    [InlineData("MOD@")]
    [InlineData("ABCDE")]
    public void NormalizeAndSortSurfaces_InvalidCharacters_ThrowsBadRequestException(string invalidInput)
    {
        // Act
        var act = () => UpsertDentalToothRecordCommandHandler.NormalizeAndSortSurfaces(invalidInput);

        // Assert
        act.Should().Throw<BadRequestException>()
            .WithMessage($"*Invalid tooth surface '{invalidInput}'*");
    }

    // =========================================================================
    // 3. MULTI-TENANT QUERY FILTER ISOLATION & CONTEXT SAFETY
    // =========================================================================

    [Fact]
    public async Task MultiTenantIsolation_GetPatientDentalChart_ExcludesTeethFromOtherClinics()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContextA);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);

        var patientId = Guid.NewGuid();

        // Tooth record belonging to Clinic A
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantIdA,
            ClinicId = _clinicIdA,
            PatientId = patientId,
            ToothNumber = 16,
            Status = ToothStatus.Filled,
            Surface = "MOD",
            Notes = "Clinic A filling"
        }, CancellationToken.None);

        // Tooth record belonging to Clinic B for the same patient
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantIdB,
            ClinicId = _clinicIdB,
            PatientId = patientId,
            ToothNumber = 26,
            Status = ToothStatus.Decayed,
            Surface = "O",
            Notes = "Clinic B decay"
        }, CancellationToken.None);

        await uow.SaveChangesAsync(CancellationToken.None);

        var handlerA = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContextA);

        // Act: Query under Clinic A context
        var resultA = await handlerA.Handle(new GetPatientDentalChartQuery(patientId), CancellationToken.None);

        // Assert: Only Clinic A tooth 16 is visible; tooth 26 from Clinic B is completely isolated
        resultA.Teeth.Should().HaveCount(1);
        resultA.Teeth[0].ToothNumber.Should().Be(16);
        resultA.Teeth[0].ClinicId.Should().Be(_clinicIdA);
        resultA.Teeth[0].Notes.Should().Be("Clinic A filling");
    }

    [Fact]
    public async Task MultiTenantIsolation_UpsertToothRecord_CannotModifyOtherClinicRecord()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContextA);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var patientId = Guid.NewGuid();

        // Patient registered under Clinic A
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantIdA,
            ClinicId = _clinicIdA,
            PatientCode = "PAT-TENANT-A",
            FirstName = "Juan",
            LastName = "A",
            ContactNumber = "09171111111"
        }, CancellationToken.None);

        // Existing tooth 16 under Clinic B
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantIdB,
            ClinicId = _clinicIdB,
            PatientId = patientId,
            ToothNumber = 16,
            Status = ToothStatus.Healthy,
            Notes = "Clinic B original"
        }, CancellationToken.None);

        await uow.SaveChangesAsync(CancellationToken.None);

        var handlerA = new UpsertDentalToothRecordCommandHandler(toothRepo, patientRepo, uow, _clinicContextA);

        // Act: Clinic A upserts tooth 16 for this patient
        var commandA = new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 16,
            Status: ToothStatus.Decayed,
            Surface: "dom",
            Notes: "Clinic A Caries"
        );
        var resultA = await handlerA.Handle(commandA, CancellationToken.None);

        // Assert: Clinic A created its own tooth record without touching Clinic B's record
        resultA.ClinicId.Should().Be(_clinicIdA);
        resultA.Status.Should().Be(ToothStatus.Decayed);
        resultA.Surface.Should().Be("MOD");

        // Verify Clinic B record still exists intact in DB
        var clinicBRecord = await toothRepo.Query(t => t.ClinicId == _clinicIdB && t.ToothNumber == 16, ignoreQueryFilters: true).FirstAsync();
        clinicBRecord.Status.Should().Be(ToothStatus.Healthy);
        clinicBRecord.Notes.Should().Be("Clinic B original");
    }

    // =========================================================================
    // 4. BATCH SAVE ATOMICITY, DEDUPLICATION & MIXED DENTITION
    // =========================================================================

    [Fact]
    public async Task BatchSave_WithDuplicateTeethInInput_LastItemWinsWithoutConflict()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContextA);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantIdA,
            ClinicId = _clinicIdA,
            PatientCode = "PAT-DUP-TEST",
            FirstName = "Pedro",
            LastName = "Duplicato",
            ContactNumber = "09172222222"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var chartQueryHandler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContextA);
        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetPatientDentalChartQuery>(q => q.PatientId == patientId), Arg.Any<CancellationToken>())
            .Returns(ci => chartQueryHandler.Handle(ci.Arg<GetPatientDentalChartQuery>(), ci.Arg<CancellationToken>()));

        var handler = new BatchSaveDentalChartCommandHandler(toothRepo, patientRepo, uow, _clinicContextA, sender);

        var command = new BatchSaveDentalChartCommand(
            PatientId: patientId,
            ConsultationId: null,
            Teeth: new List<ToothRecordInput>
            {
                new(ToothNumber: 11, Status: ToothStatus.Healthy, Surface: null, Notes: "First pass - Healthy"),
                new(ToothNumber: 11, Status: ToothStatus.Decayed, Surface: "m", Notes: "Second pass - Found Decay"),
                new(ToothNumber: 11, Status: ToothStatus.Filled, Surface: "m", Notes: "Final pass - Restored")
            }
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert: Deduplicated to 1 record, with the last item winning
        result.Teeth.Should().HaveCount(1);
        result.Teeth[0].ToothNumber.Should().Be(11);
        result.Teeth[0].Status.Should().Be(ToothStatus.Filled);
        result.Teeth[0].Notes.Should().Be("Final pass - Restored");

        var dbRecords = await toothRepo.Query(t => t.PatientId == patientId).ToListAsync();
        dbRecords.Should().HaveCount(1);
        dbRecords[0].Status.Should().Be(ToothStatus.Filled);
    }

    [Fact]
    public async Task BatchSave_MixedDentition_SavesBothAdultAndDeciduousTeethCleanly()
    {
        // Arrange (Child aged 9 with mixed dentition: adult incisors/first molars and deciduous canines/premolars)
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContextA);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantIdA,
            ClinicId = _clinicIdA,
            PatientCode = "PAT-MIXED-001",
            FirstName = "Junior",
            LastName = "Santos",
            ContactNumber = "09173333333"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var chartQueryHandler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContextA);
        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetPatientDentalChartQuery>(q => q.PatientId == patientId), Arg.Any<CancellationToken>())
            .Returns(ci => chartQueryHandler.Handle(ci.Arg<GetPatientDentalChartQuery>(), ci.Arg<CancellationToken>()));

        var handler = new BatchSaveDentalChartCommandHandler(toothRepo, patientRepo, uow, _clinicContextA, sender);

        var command = new BatchSaveDentalChartCommand(
            PatientId: patientId,
            ConsultationId: null,
            Teeth: new List<ToothRecordInput>
            {
                new(ToothNumber: 16, Status: ToothStatus.Healthy, Surface: null, Notes: "Adult permanent first molar"),
                new(ToothNumber: 11, Status: ToothStatus.Healthy, Surface: null, Notes: "Adult permanent central incisor"),
                new(ToothNumber: 53, Status: ToothStatus.Decayed, Surface: "b", Notes: "Deciduous canine caries"),
                new(ToothNumber: 55, Status: ToothStatus.Filled, Surface: "O", Notes: "Deciduous molar filled")
            }
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert: 4 teeth saved, sorted ascending by tooth number (11, 16, 53, 55)
        result.Teeth.Should().HaveCount(4);
        result.Teeth.Select(t => t.ToothNumber).Should().ContainInOrder(11, 16, 53, 55);
        result.Summary.Should().NotBeNull();
        result.Summary!.HealthyCount.Should().Be(2);
        result.Summary.DecayCount.Should().Be(1);
        result.Summary.FilledCount.Should().Be(1);
    }

    [Fact]
    public async Task BatchSave_AtomicRollback_WhenSingleToothFailsValidation_NoTeethAreSaved()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContextA);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var sender = Substitute.For<ISender>();

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantIdA,
            ClinicId = _clinicIdA,
            PatientCode = "PAT-ROLLBACK",
            FirstName = "Rollback",
            LastName = "Test",
            ContactNumber = "09174444444"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new BatchSaveDentalChartCommandHandler(toothRepo, patientRepo, uow, _clinicContextA, sender);

        var command = new BatchSaveDentalChartCommand(
            PatientId: patientId,
            ConsultationId: null,
            Teeth: new List<ToothRecordInput>
            {
                new(ToothNumber: 11, Status: ToothStatus.Healthy),
                new(ToothNumber: 12, Status: ToothStatus.Healthy),
                new(ToothNumber: 13, Status: ToothStatus.Healthy),
                new(ToothNumber: 99, Status: ToothStatus.Healthy) // Invalid tooth 99
            }
        );

        // Act
        var act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert: Exception thrown and zero records inserted
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*'99' is invalid under ISO 3950 FDI notation*");

        var persisted = await toothRepo.Query(t => t.PatientId == patientId).ToListAsync();
        persisted.Should().BeEmpty();
    }

    // =========================================================================
    // 5. PROCEDURE TOOTH TAGGING & DENTAL CHART AGGREGATION
    // =========================================================================

    [Fact]
    public async Task GetPatientDentalChart_AggregatesToothTaggedProcedures_AndCalculatesSummaryAccurately()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContextA);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);

        var patientId = Guid.NewGuid();

        // 6 teeth with distinct statuses (1 of each status)
        await toothRepo.AddAsync(new DentalToothRecord { TenantId = _tenantIdA, ClinicId = _clinicIdA, PatientId = patientId, ToothNumber = 11, Status = ToothStatus.Healthy }, CancellationToken.None);
        await toothRepo.AddAsync(new DentalToothRecord { TenantId = _tenantIdA, ClinicId = _clinicIdA, PatientId = patientId, ToothNumber = 12, Status = ToothStatus.Decayed, Surface = "M" }, CancellationToken.None);
        await toothRepo.AddAsync(new DentalToothRecord { TenantId = _tenantIdA, ClinicId = _clinicIdA, PatientId = patientId, ToothNumber = 13, Status = ToothStatus.Filled, Surface = "MOD" }, CancellationToken.None);
        await toothRepo.AddAsync(new DentalToothRecord { TenantId = _tenantIdA, ClinicId = _clinicIdA, PatientId = patientId, ToothNumber = 14, Status = ToothStatus.Missing }, CancellationToken.None);
        await toothRepo.AddAsync(new DentalToothRecord { TenantId = _tenantIdA, ClinicId = _clinicIdA, PatientId = patientId, ToothNumber = 15, Status = ToothStatus.Crowned }, CancellationToken.None);
        await toothRepo.AddAsync(new DentalToothRecord { TenantId = _tenantIdA, ClinicId = _clinicIdA, PatientId = patientId, ToothNumber = 16, Status = ToothStatus.ForExtraction }, CancellationToken.None);

        // Procedure 1: Explicit Dental Category with ToothNumber & ToothSurface
        await procRepo.AddAsync(new ClinicalProcedure
        {
            TenantId = _tenantIdA,
            ClinicId = _clinicIdA,
            PatientId = patientId,
            PatientName = "Dela Cruz, Juan",
            ProcedureCode = "DENT-001",
            ProcedureName = "Composite Restoration",
            Category = "Dental",
            ToothNumber = 13,
            ToothSurface = "MOD",
            ScheduledAt = DateTime.UtcNow
        }, CancellationToken.None);

        // Procedure 2: General Surgery with ToothNumber
        await procRepo.AddAsync(new ClinicalProcedure
        {
            TenantId = _tenantIdA,
            ClinicId = _clinicIdA,
            PatientId = patientId,
            PatientName = "Dela Cruz, Juan",
            ProcedureCode = "SURG-002",
            ProcedureName = "Surgical Molar Extraction",
            Category = "Minor Surgery",
            ToothNumber = 16,
            ToothSurface = null,
            ScheduledAt = DateTime.UtcNow
        }, CancellationToken.None);

        // Procedure 3: Medical Nebulization without ToothNumber
        await procRepo.AddAsync(new ClinicalProcedure
        {
            TenantId = _tenantIdA,
            ClinicId = _clinicIdA,
            PatientId = patientId,
            PatientName = "Dela Cruz, Juan",
            ProcedureCode = "MED-003",
            ProcedureName = "Nebulization",
            Category = "Medical",
            ToothNumber = null,
            ScheduledAt = DateTime.UtcNow
        }, CancellationToken.None);

        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContextA);

        // Act
        var chart = await handler.Handle(new GetPatientDentalChartQuery(patientId), CancellationToken.None);

        // Assert: Summary counts reflect exactly 1 of each status
        chart.Summary.Should().NotBeNull();
        chart.Summary!.TotalTeethRecorded.Should().Be(6);
        chart.Summary.HealthyCount.Should().Be(1);
        chart.Summary.DecayCount.Should().Be(1);
        chart.Summary.FilledCount.Should().Be(1);
        chart.Summary.MissingCount.Should().Be(1);
        chart.Summary.CrownCount.Should().Be(1);
        chart.Summary.ExtractionCount.Should().Be(1);

        // Only Dental or Tooth-tagged procedures are returned (Procedures 1 & 2, not 3)
        chart.DentalProcedures.Should().HaveCount(2);
        chart.DentalProcedures.Should().Contain(p => p.ProcedureCode == "DENT-001" && p.ToothNumber == 13 && p.ToothSurface == "MOD");
        chart.DentalProcedures.Should().Contain(p => p.ProcedureCode == "SURG-002" && p.ToothNumber == 16);
        chart.DentalProcedures.Should().NotContain(p => p.ProcedureCode == "MED-003");
    }

    // =========================================================================
    // 6. CONTROLLER RBAC & ROUTING ATTRIBUTES VERIFICATION
    // =========================================================================

    [Fact]
    public void DentalController_HasCorrectRouteAndPermissionAttributes()
    {
        // 1. Controller attributes
        var controllerType = typeof(DentalController);
        var apiControllerAttr = controllerType.GetCustomAttribute<ApiControllerAttribute>();
        apiControllerAttr.Should().NotBeNull();

        var routeAttr = controllerType.GetCustomAttribute<RouteAttribute>();
        routeAttr.Should().NotBeNull();
        routeAttr!.Template.Should().Be("api/v1/dental");

        // 2. GetPatientChart endpoint attributes
        var getChartMethod = controllerType.GetMethod(nameof(DentalController.GetPatientChart));
        getChartMethod.Should().NotBeNull();
        var getChartPerm = getChartMethod!.GetCustomAttribute<HasPermissionAttribute>();
        getChartPerm.Should().NotBeNull();
        getChartPerm!.Permission.Should().Be(ClinicPermissions.ConsultationsRead);

        // 3. UpsertToothRecord endpoint attributes
        var upsertMethod = controllerType.GetMethod(nameof(DentalController.UpsertToothRecord));
        upsertMethod.Should().NotBeNull();
        var upsertPerm = upsertMethod!.GetCustomAttribute<HasPermissionAttribute>();
        upsertPerm.Should().NotBeNull();
        upsertPerm!.Permission.Should().Be(ClinicPermissions.ConsultationsWrite);

        // 4. BatchSaveChart endpoint attributes
        var batchMethod = controllerType.GetMethod(nameof(DentalController.BatchSaveChart));
        batchMethod.Should().NotBeNull();
        var batchPerm = batchMethod!.GetCustomAttribute<HasPermissionAttribute>();
        batchPerm.Should().NotBeNull();
        batchPerm!.Permission.Should().Be(ClinicPermissions.ConsultationsWrite);
    }
}
