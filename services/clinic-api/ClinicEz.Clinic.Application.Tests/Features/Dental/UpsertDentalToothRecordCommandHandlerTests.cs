using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Dental.Commands;
using ClinicEz.Clinic.Application.Features.Dental.DTOs;
using ClinicEz.Clinic.Application.Features.Dental.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Dental;

public class UpsertDentalToothRecordCommandHandlerTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private const string _tenantId = "tenant-dental-upsert-test";

    public UpsertDentalToothRecordCommandHandlerTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffName.Returns("Dr. Test Dentist");
    }

    [Theory]
    [InlineData(11)]
    [InlineData(14)]
    [InlineData(18)]
    [InlineData(21)]
    [InlineData(25)]
    [InlineData(28)]
    [InlineData(31)]
    [InlineData(34)]
    [InlineData(38)]
    [InlineData(41)]
    [InlineData(45)]
    [InlineData(48)]
    public async Task Handle_ValidAdultFdiToothNumbers_SavesRecordSuccessfully(int toothNumber)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            ContactNumber = "09171234567"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new UpsertDentalToothRecordCommandHandler(toothRepo, patientRepo, uow, _clinicContext);

        var command = new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: toothNumber,
            Status: ToothStatus.Healthy,
            Notes: "Sound adult tooth"
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.ToothNumber.Should().Be(toothNumber);
        result.Status.Should().Be(ToothStatus.Healthy);
        result.PatientName.Should().Be("Dela Cruz, Juan");

        var persisted = await toothRepo.Query().FirstOrDefaultAsync(t => t.ToothNumber == toothNumber);
        persisted.Should().NotBeNull();
        persisted!.ClinicId.Should().Be(_clinicId);
        persisted.TenantId.Should().Be(_tenantId);
    }

    [Theory]
    [InlineData(51)]
    [InlineData(53)]
    [InlineData(55)]
    [InlineData(61)]
    [InlineData(63)]
    [InlineData(65)]
    [InlineData(71)]
    [InlineData(73)]
    [InlineData(75)]
    [InlineData(81)]
    [InlineData(83)]
    [InlineData(85)]
    public async Task Handle_ValidChildFdiToothNumbers_SavesRecordSuccessfully(int toothNumber)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-PEDI-001",
            FirstName = "Baby",
            LastName = "Santos",
            ContactNumber = "09171234567"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new UpsertDentalToothRecordCommandHandler(toothRepo, patientRepo, uow, _clinicContext);

        var command = new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: toothNumber,
            Status: ToothStatus.Healthy,
            Notes: "Primary deciduous tooth"
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.ToothNumber.Should().Be(toothNumber);
        result.Status.Should().Be(ToothStatus.Healthy);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(19)]
    [InlineData(29)]
    [InlineData(39)]
    [InlineData(49)]
    [InlineData(50)]
    [InlineData(56)]
    [InlineData(66)]
    [InlineData(76)]
    [InlineData(86)]
    [InlineData(99)]
    [InlineData(-1)]
    public async Task Handle_InvalidToothNumbers_ThrowsBadRequestException(int invalidToothNumber)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            ContactNumber = "09171234567"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new UpsertDentalToothRecordCommandHandler(toothRepo, patientRepo, uow, _clinicContext);

        var command = new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: invalidToothNumber,
            Status: ToothStatus.Decayed
        );

        // Act
        var act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage($"*'{invalidToothNumber}' is invalid under ISO 3950 FDI notation*");
    }

    [Theory]
    [InlineData("dom", "MOD")]
    [InlineData("bmo", "MOB")]
    [InlineData("lbd", "DBL")]
    [InlineData("modbl", "MODBL")]
    [InlineData("o", "O")]
    [InlineData("  mod  ", "MOD")]
    [InlineData("MMOODD", "MOD")]
    [InlineData("d", "D")]
    [InlineData("b", "B")]
    [InlineData("l", "L")]
    public async Task Handle_CanonicalSurfaceSorting_NormalizesToStandardMODBL(string inputSurface, string expectedCanonical)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            ContactNumber = "09171234567"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new UpsertDentalToothRecordCommandHandler(toothRepo, patientRepo, uow, _clinicContext);

        var command = new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 16,
            Status: ToothStatus.Decayed,
            Surface: inputSurface
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Surface.Should().Be(expectedCanonical);

        var persisted = await toothRepo.Query().FirstOrDefaultAsync(t => t.ToothNumber == 16);
        persisted!.Surface.Should().Be(expectedCanonical);
    }

    [Theory]
    [InlineData("XYZ")]
    [InlineData("M1")]
    [InlineData("MODZ")]
    [InlineData("A")]
    [InlineData("O-D")]
    public async Task Handle_InvalidSurfaceCharacters_ThrowsBadRequestException(string invalidSurface)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            ContactNumber = "09171234567"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new UpsertDentalToothRecordCommandHandler(toothRepo, patientRepo, uow, _clinicContext);

        var command = new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 16,
            Status: ToothStatus.Decayed,
            Surface: invalidSurface
        );

        // Act
        var act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*Invalid tooth surface*");
    }

    [Fact]
    public async Task Handle_UpsertExistingTooth_UpdatesInPlaceWithoutDuplication()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            ContactNumber = "09171234567"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new UpsertDentalToothRecordCommandHandler(toothRepo, patientRepo, uow, _clinicContext);

        // 1. Initial insert: tooth 16 has decay on MOD
        var insertCmd = new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 16,
            Status: ToothStatus.Decayed,
            Surface: "MOD",
            Notes: "Deep caries"
        );
        var insertResult = await handler.Handle(insertCmd, CancellationToken.None);

        // 2. Subsequent update of same condition: tooth 16 updated Decay on MOD with new notes
        var updateCmd = new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 16,
            Status: ToothStatus.Decayed,
            Surface: "MOD",
            Notes: "Deep caries reaching dentin"
        );
        var updateResult = await handler.Handle(updateCmd, CancellationToken.None);

        // Assert in-place update for the same condition
        updateResult.Id.Should().Be(insertResult.Id);
        updateResult.Status.Should().Be(ToothStatus.Decayed);
        updateResult.Notes.Should().Be("Deep caries reaching dentin");
        updateResult.RecordedBy.Should().Be("Dr. Test Dentist");

        var allRecords = await toothRepo.Query(t => t.PatientId == patientId && t.ToothNumber == 16 && !t.IsDeleted).ToListAsync();
        allRecords.Should().HaveCount(1);
        allRecords[0].Status.Should().Be(ToothStatus.Decayed);
        allRecords[0].UpdatedAt.Should().NotBeNull();
        allRecords[0].UpdatedBy.Should().Be("Dr. Test Dentist");
    }

    [Fact]
    public async Task Handle_UpsertMultipleConditionsOnSameTooth_PreservesBothConditionsWithOwnDetails()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-MULTI-001",
            FirstName = "Maria",
            LastName = "Santos",
            ContactNumber = "09171234567"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new UpsertDentalToothRecordCommandHandler(toothRepo, patientRepo, uow, _clinicContext);

        // 1. Initial condition: tooth 16 has existing Filled on O
        var filledCmd = new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 16,
            Status: ToothStatus.Filled,
            Surface: "O",
            Notes: "Composite restoration on occlusal"
        );
        var filledResult = await handler.Handle(filledCmd, CancellationToken.None);

        // 2. New condition: tooth 16 has recurrent Decay on MD
        var decayCmd = new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 16,
            Status: ToothStatus.Decayed,
            Surface: "MD",
            Notes: "Mesial-distal caries observed"
        );
        var decayResult = await handler.Handle(decayCmd, CancellationToken.None);

        // Assert: Distinct rows created with their own IDs, surfaces, and notes
        decayResult.Id.Should().NotBe(filledResult.Id);
        decayResult.Status.Should().Be(ToothStatus.Decayed);
        decayResult.Surface.Should().Be("MD");
        decayResult.Notes.Should().Be("Mesial-distal caries observed");
        decayResult.RecordedBy.Should().Be("Dr. Test Dentist");

        var activeRecords = await toothRepo
            .Query(t => t.PatientId == patientId && t.ToothNumber == 16 && !t.IsDeleted)
            .OrderBy(t => t.Status)
            .ToListAsync();

        activeRecords.Should().HaveCount(2);

        var decayDb = activeRecords.First(r => r.Status == ToothStatus.Decayed);
        decayDb.Surface.Should().Be("MD");
        decayDb.Notes.Should().Be("Mesial-distal caries observed");

        var filledDb = activeRecords.First(r => r.Status == ToothStatus.Filled);
        filledDb.Surface.Should().Be("O");
        filledDb.Notes.Should().Be("Composite restoration on occlusal");
    }

    [Fact]
    public async Task Handle_RemoveCondition_SoftDeletesSpecificCondition()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-REM-001",
            FirstName = "Juan",
            LastName = "Luna",
            ContactNumber = "09171234567"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new UpsertDentalToothRecordCommandHandler(toothRepo, patientRepo, uow, _clinicContext);

        // Add Decay on 16
        await handler.Handle(new UpsertDentalToothRecordCommand(patientId, 16, ToothStatus.Decayed, "MD", "Caries"), CancellationToken.None);
        // Add Filled on 16
        await handler.Handle(new UpsertDentalToothRecordCommand(patientId, 16, ToothStatus.Filled, "O", "Filling"), CancellationToken.None);

        // Act: Remove Decay condition
        var removeResult = await handler.Handle(new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 16,
            Status: ToothStatus.Decayed,
            RemoveCondition: true
        ), CancellationToken.None);

        // Assert: Decay is soft-deleted, Filled remains active
        var activeRecords = await toothRepo.Query(t => t.PatientId == patientId && t.ToothNumber == 16 && !t.IsDeleted).ToListAsync();
        activeRecords.Should().HaveCount(1);
        activeRecords[0].Status.Should().Be(ToothStatus.Filled);

        var allRecords = await toothRepo.Query(t => t.PatientId == patientId && t.ToothNumber == 16, ignoreQueryFilters: true).ToListAsync();
        allRecords.Should().HaveCount(2);
        var deletedDecay = allRecords.First(r => r.Status == ToothStatus.Decayed);
        deletedDecay.IsDeleted.Should().BeTrue();
        deletedDecay.DeletedAt.Should().NotBeNull();
        deletedDecay.DeletedBy.Should().Be("Dr. Test Dentist");
    }

    [Fact]
    public async Task Handle_MarkToothHealthy_SoftDeletesAllNonHealthyConditions()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-HLTH-001",
            FirstName = "Andres",
            LastName = "Bonifacio",
            ContactNumber = "09171234567"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new UpsertDentalToothRecordCommandHandler(toothRepo, patientRepo, uow, _clinicContext);

        // Add multiple conditions
        await handler.Handle(new UpsertDentalToothRecordCommand(patientId, 16, ToothStatus.Decayed, "MD", "Caries"), CancellationToken.None);
        await handler.Handle(new UpsertDentalToothRecordCommand(patientId, 16, ToothStatus.Filled, "O", "Filling"), CancellationToken.None);

        // Act: Mark tooth Healthy
        var healthyResult = await handler.Handle(new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 16,
            Status: ToothStatus.Healthy,
            Notes: "Resolved and healthy"
        ), CancellationToken.None);

        // Assert
        healthyResult.Status.Should().Be(ToothStatus.Healthy);

        var activeRecords = await toothRepo.Query(t => t.PatientId == patientId && t.ToothNumber == 16 && !t.IsDeleted).ToListAsync();
        activeRecords.Should().HaveCount(1);
        activeRecords[0].Status.Should().Be(ToothStatus.Healthy);
        activeRecords[0].Notes.Should().Be("Resolved and healthy");

        var allRecords = await toothRepo.Query(t => t.PatientId == patientId && t.ToothNumber == 16, ignoreQueryFilters: true).ToListAsync();
        allRecords.Where(r => r.IsDeleted).Should().HaveCount(2);
    }

    [Fact]
    public async Task Handle_WhenPatientNotFound_ThrowsNotFoundException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var handler = new UpsertDentalToothRecordCommandHandler(toothRepo, patientRepo, uow, _clinicContext);

        var command = new UpsertDentalToothRecordCommand(
            PatientId: Guid.NewGuid(),
            ToothNumber: 11,
            Status: ToothStatus.Healthy
        );

        // Act
        var act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task Handle_TenantIsolation_EnforcesClinicBoundaries()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var otherClinicId = Guid.NewGuid();
        var patientInOtherClinic = Guid.NewGuid();

        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientInOtherClinic,
            TenantId = "other-tenant",
            ClinicId = otherClinicId,
            PatientCode = "PAT-OTHER",
            FirstName = "Other",
            LastName = "Patient",
            ContactNumber = "09171234567"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new UpsertDentalToothRecordCommandHandler(toothRepo, patientRepo, uow, _clinicContext);

        var command = new UpsertDentalToothRecordCommand(
            PatientId: patientInOtherClinic,
            ToothNumber: 11,
            Status: ToothStatus.Healthy
        );

        // Act
        var act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert: Patient not found in this clinic context
        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task Handle_LongitudinalSurfaceProgression_DecayPartialFillCompleteFillAndExtraction_TracksActiveSurfacesAndSupersededHistory()
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
            PatientCode = "PAT-LONG-001",
            FirstName = "Jose",
            LastName = "Rizal",
            ContactNumber = "09171234567"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var upsertHandler = new UpsertDentalToothRecordCommandHandler(toothRepo, patientRepo, uow, _clinicContext);
        var queryHandler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContext);

        var visit1Id = Guid.NewGuid();
        var visit2Id = Guid.NewGuid();
        var visit3Id = Guid.NewGuid();
        var visit4Id = Guid.NewGuid();

        // Visit 1: Tooth 16 diagnosed with Decay on MO
        var visit1Decay = await upsertHandler.Handle(new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 16,
            Status: ToothStatus.Decayed,
            Surface: "MO",
            Notes: "Mesio-occlusal caries",
            ConsultationId: visit1Id
        ), CancellationToken.None);

        visit1Decay.Surface.Should().Be("MO");
        visit1Decay.ActiveSurface.Should().Be("MO");
        visit1Decay.IsCurrent.Should().BeTrue();

        // Visit 2 (weeks later): Occlusal surface O is filled; M remains Decay
        var visit2FillO = await upsertHandler.Handle(new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 16,
            Status: ToothStatus.Filled,
            Surface: "O",
            Notes: "Occlusal composite restoration",
            ConsultationId: visit2Id
        ), CancellationToken.None);

        visit2FillO.Surface.Should().Be("O");
        visit2FillO.ActiveSurface.Should().Be("O");
        visit2FillO.IsCurrent.Should().BeTrue();

        var chartAfterVisit2 = await queryHandler.Handle(new GetPatientDentalChartQuery(patientId), CancellationToken.None);
        var decayAfterVisit2 = chartAfterVisit2.Teeth.First(t => t.Id == visit1Decay.Id);
        decayAfterVisit2.Surface.Should().Be("MO", "Historical originally recorded surface must remain immutable");
        decayAfterVisit2.ActiveSurface.Should().Be("M", "Treated surface O is subtracted, leaving M active");
        decayAfterVisit2.IsCurrent.Should().BeTrue();
        chartAfterVisit2.Summary!.DecayCount.Should().Be(1);
        chartAfterVisit2.Summary.FilledCount.Should().Be(1);
        chartAfterVisit2.Summary.DmftIndex.Should().Be(1);

        // Visit 3: Remaining mesial surface M is now filled (complete restoration of M and O)
        var visit3FillM = await upsertHandler.Handle(new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 16,
            Status: ToothStatus.Filled,
            Surface: "M",
            Notes: "Mesial composite restoration completed",
            ConsultationId: visit3Id
        ), CancellationToken.None);

        var chartAfterVisit3 = await queryHandler.Handle(new GetPatientDentalChartQuery(patientId), CancellationToken.None);
        var decayAfterVisit3 = chartAfterVisit3.Teeth.First(t => t.Id == visit1Decay.Id);
        decayAfterVisit3.Surface.Should().Be("MO", "Historical surface MO is preserved");
        decayAfterVisit3.ActiveSurface.Should().BeNull("All decayed surfaces have been restored");
        decayAfterVisit3.IsCurrent.Should().BeFalse("Decay record is now superseded");
        decayAfterVisit3.SupersededAt.Should().NotBeNull();
        decayAfterVisit3.SupersededByRecordId.Should().Be(visit3FillM.Id);

        chartAfterVisit3.Summary!.DecayCount.Should().Be(0, "Superseded decay must not count as active decay");
        chartAfterVisit3.Summary.FilledCount.Should().Be(1);
        chartAfterVisit3.Summary.DmftIndex.Should().Be(1);

        // Visit 4: Whole tooth 16 is extracted (Missing)
        var visit4Missing = await upsertHandler.Handle(new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 16,
            Status: ToothStatus.Missing,
            Notes: "Tooth extracted due to root fracture",
            ConsultationId: visit4Id
        ), CancellationToken.None);

        visit4Missing.IsCurrent.Should().BeTrue();
        visit4Missing.Surface.Should().BeNull();

        var chartAfterVisit4 = await queryHandler.Handle(new GetPatientDentalChartQuery(patientId), CancellationToken.None);
        chartAfterVisit4.Teeth.Should().HaveCount(4, "All 4 historical visit records remain in the longitudinal log");
        chartAfterVisit4.Teeth.Where(t => t.IsCurrent).Should().ContainSingle(t => t.Id == visit4Missing.Id && t.Status == ToothStatus.Missing);
        chartAfterVisit4.Summary!.DecayCount.Should().Be(0);
        chartAfterVisit4.Summary.FilledCount.Should().Be(0);
        chartAfterVisit4.Summary.MissingCount.Should().Be(1);
        chartAfterVisit4.Summary.DmftIndex.Should().Be(1);

        // Guard: Same-encounter conflict on a tooth marked Missing in the SAME encounter throws BadRequestException
        var actConflictSameEncounterOnMissing = async () => await upsertHandler.Handle(new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 16,
            Status: ToothStatus.Crowned,
            Surface: "MODBL",
            ConsultationId: visit4Id
        ), CancellationToken.None);

        await actConflictSameEncounterOnMissing.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*already has*recorded in the current encounter*");

        // Visit 5 (Subsequent Encounter): Dentist places Pontic / Implant on top of the Missing tooth without deleting Missing
        var visit5Id = Guid.NewGuid();
        var visit5Implant = await upsertHandler.Handle(new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 16,
            Status: ToothStatus.Implant,
            Notes: "Titanium implant placed at edentulous site #16",
            ConsultationId: visit5Id
        ), CancellationToken.None);

        visit5Implant.IsCurrent.Should().BeTrue();
        visit5Implant.Status.Should().Be(ToothStatus.Implant);

        var chartAfterVisit5 = await queryHandler.Handle(new GetPatientDentalChartQuery(patientId), CancellationToken.None);
        chartAfterVisit5.Teeth.Should().HaveCount(5, "All 5 longitudinal visit records remain in the stack");
        chartAfterVisit5.Teeth.Where(t => t.IsCurrent).Should().ContainSingle(t => t.Id == visit5Implant.Id && t.Status == ToothStatus.Implant);
        chartAfterVisit5.Teeth.First(t => t.Id == visit4Missing.Id).IsCurrent.Should().BeFalse("Missing is superseded by Implant in Visit 5");

        // Audit-Safe Void: Doctor voids Visit 5 Implant record -> Missing from Visit 4 is restored as Current
        var voidSender = NSubstitute.Substitute.For<MediatR.ISender>();
        voidSender.Send(NSubstitute.Arg.Any<GetPatientDentalChartQuery>(), NSubstitute.Arg.Any<CancellationToken>())
            .Returns(callInfo => queryHandler.Handle(callInfo.Arg<GetPatientDentalChartQuery>(), CancellationToken.None));

        var voidHandler = new VoidDentalToothRecordCommandHandler(toothRepo, uow, _clinicContext, voidSender);
        var chartAfterVoid = await voidHandler.Handle(new VoidDentalToothRecordCommand(
            PatientId: patientId,
            RecordId: visit5Implant.Id,
            Reason: "Recorded on wrong tooth number"
        ), CancellationToken.None);

        chartAfterVoid.Teeth.Should().HaveCount(5, "Voided record remains in the history stack for audit trail");
        var voidedRec = chartAfterVoid.Teeth.First(t => t.Id == visit5Implant.Id);
        voidedRec.IsVoided.Should().BeTrue();
        voidedRec.IsCurrent.Should().BeFalse();
        voidedRec.VoidReason.Should().Be("Recorded on wrong tooth number");

        var restoredMissing = chartAfterVoid.Teeth.First(t => t.Id == visit4Missing.Id);
        restoredMissing.IsCurrent.Should().BeTrue("Prior non-voided record on the stack is automatically restored as Current");
    }

    [Fact]
    public async Task Handle_SameEncounterSurfaceConflictAndWholeToothExtraction_EnforcesEncounterLockAndWholeToothSupersession()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var patientId = Guid.NewGuid();
        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-LOCK-001",
            FirstName = "Andres",
            LastName = "Bonifacio",
            ContactNumber = "09171234567"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var upsertHandler = new UpsertDentalToothRecordCommandHandler(toothRepo, patientRepo, uow, _clinicContext);
        var enc1Id = Guid.NewGuid();
        var enc2Id = Guid.NewGuid();

        // 1. Encounter 1: Record Decay on surface O of Tooth 26
        var decayO = await upsertHandler.Handle(new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 26,
            Status: ToothStatus.Decayed,
            Surface: "O",
            Notes: "Occlusal caries",
            ConsultationId: enc1Id
        ), CancellationToken.None);

        decayO.IsCurrent.Should().BeTrue();
        decayO.ActiveSurface.Should().Be("O");

        // 2. Same Encounter (enc1Id): Attempting to add Filled on overlapping surface O or MO must throw BadRequestException
        var actConflictInSameEncounter = async () => await upsertHandler.Handle(new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 26,
            Status: ToothStatus.Filled,
            Surface: "MO",
            Notes: "Conflicting same-encounter status on O",
            ConsultationId: enc1Id
        ), CancellationToken.None);

        await actConflictInSameEncounter.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*already has*recorded in the current encounter*");

        // 3. Same Encounter (enc1Id): Non-overlapping surface M is allowed
        var filledM = await upsertHandler.Handle(new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 26,
            Status: ToothStatus.Filled,
            Surface: "M",
            Notes: "Existing mesial filling",
            ConsultationId: enc1Id
        ), CancellationToken.None);
        filledM.IsCurrent.Should().BeTrue();
        filledM.ActiveSurface.Should().Be("M");

        // 4. Next Encounter (enc2Id): Whole-tooth Extraction disables/clears surfaces and supersedes prior encounter records into History
        var extractionEnc2 = await upsertHandler.Handle(new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 26,
            Status: ToothStatus.ForExtraction,
            Surface: "MOD", // Must be ignored/cleared because Extraction applies to whole tooth
            Notes: "Severe mobility, indicated for extraction",
            ConsultationId: enc2Id
        ), CancellationToken.None);

        extractionEnc2.Surface.Should().BeNull("Extraction applies to whole tooth and disables surfaces");
        extractionEnc2.ActiveSurface.Should().BeNull();
        extractionEnc2.IsCurrent.Should().BeTrue();

        var allTooth26 = await toothRepo.Query(t => t.PatientId == patientId && t.ToothNumber == 26 && !t.IsDeleted).ToListAsync();
        allTooth26.Where(t => t.IsCurrent).Should().ContainSingle(t => t.Id == extractionEnc2.Id && t.Status == ToothStatus.ForExtraction);
        allTooth26.Where(t => !t.IsCurrent).Should().HaveCount(2, "Prior encounter Decay(O) and Filled(M) are now historical");
    }
}
