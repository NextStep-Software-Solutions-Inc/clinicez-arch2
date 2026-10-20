using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Dental.Commands;
using ClinicEz.Clinic.Application.Features.Dental.DTOs;
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
            Status: ToothStatus.Decay
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
            Status: ToothStatus.Decay,
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
            Status: ToothStatus.Decay,
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
            Status: ToothStatus.Decay,
            Surface: "MOD",
            Notes: "Deep caries"
        );
        var insertResult = await handler.Handle(insertCmd, CancellationToken.None);

        // 2. Subsequent update of same condition: tooth 16 updated Decay on MOD with new notes
        var updateCmd = new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 16,
            Status: ToothStatus.Decay,
            Surface: "MOD",
            Notes: "Deep caries reaching dentin"
        );
        var updateResult = await handler.Handle(updateCmd, CancellationToken.None);

        // Assert in-place update for the same condition
        updateResult.Id.Should().Be(insertResult.Id);
        updateResult.Status.Should().Be(ToothStatus.Decay);
        updateResult.Notes.Should().Be("Deep caries reaching dentin");
        updateResult.RecordedBy.Should().Be("Dr. Test Dentist");

        var allRecords = await toothRepo.Query(t => t.PatientId == patientId && t.ToothNumber == 16 && !t.IsDeleted).ToListAsync();
        allRecords.Should().HaveCount(1);
        allRecords[0].Status.Should().Be(ToothStatus.Decay);
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
            Status: ToothStatus.Decay,
            Surface: "MD",
            Notes: "Mesial-distal caries observed"
        );
        var decayResult = await handler.Handle(decayCmd, CancellationToken.None);

        // Assert: Distinct rows created with their own IDs, surfaces, and notes
        decayResult.Id.Should().NotBe(filledResult.Id);
        decayResult.Status.Should().Be(ToothStatus.Decay);
        decayResult.Surface.Should().Be("MD");
        decayResult.Notes.Should().Be("Mesial-distal caries observed");
        decayResult.RecordedBy.Should().Be("Dr. Test Dentist");

        var activeRecords = await toothRepo
            .Query(t => t.PatientId == patientId && t.ToothNumber == 16 && !t.IsDeleted)
            .OrderBy(t => t.Status)
            .ToListAsync();

        activeRecords.Should().HaveCount(2);

        var decayDb = activeRecords.First(r => r.Status == ToothStatus.Decay);
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
        await handler.Handle(new UpsertDentalToothRecordCommand(patientId, 16, ToothStatus.Decay, "MD", "Caries"), CancellationToken.None);
        // Add Filled on 16
        await handler.Handle(new UpsertDentalToothRecordCommand(patientId, 16, ToothStatus.Filled, "O", "Filling"), CancellationToken.None);

        // Act: Remove Decay condition
        var removeResult = await handler.Handle(new UpsertDentalToothRecordCommand(
            PatientId: patientId,
            ToothNumber: 16,
            Status: ToothStatus.Decay,
            RemoveCondition: true
        ), CancellationToken.None);

        // Assert: Decay is soft-deleted, Filled remains active
        var activeRecords = await toothRepo.Query(t => t.PatientId == patientId && t.ToothNumber == 16 && !t.IsDeleted).ToListAsync();
        activeRecords.Should().HaveCount(1);
        activeRecords[0].Status.Should().Be(ToothStatus.Filled);

        var allRecords = await toothRepo.Query(t => t.PatientId == patientId && t.ToothNumber == 16, ignoreQueryFilters: true).ToListAsync();
        allRecords.Should().HaveCount(2);
        var deletedDecay = allRecords.First(r => r.Status == ToothStatus.Decay);
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
        await handler.Handle(new UpsertDentalToothRecordCommand(patientId, 16, ToothStatus.Decay, "MD", "Caries"), CancellationToken.None);
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
}
