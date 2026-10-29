using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Dental.DTOs;
using ClinicEz.Clinic.Application.Features.Dental.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Dental;

public class GetPatientDentalChartQueryHandlerTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private const string _tenantId = "tenant-dental-query-test";

    public GetPatientDentalChartQueryHandlerTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
    }

    [Fact]
    public async Task Handle_WithExistingTeethAndProcedures_ReturnsOrderedTeethAndDentalProcedures()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var patientId = Guid.NewGuid();

        // Teeth added intentionally out of order
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ToothNumber = 36,
            Status = ToothStatus.Filled,
            Surface = "MOD",
            Notes = "Composite restoration"
        }, CancellationToken.None);

        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ToothNumber = 11,
            Status = ToothStatus.Healthy,
            Notes = "Intact"
        }, CancellationToken.None);

        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ToothNumber = 21,
            Status = ToothStatus.Decayed,
            Surface = "M",
            Notes = "Incipient mesial caries"
        }, CancellationToken.None);

        // Dental procedure with tooth tagging
        await procRepo.AddAsync(new Procedure
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Dela Cruz, Juan",
            ProcedureCode = "DENT-REST",
            ProcedureName = "Composite Filling",
            Category = "Dental",
            ToothNumber = 36,
            ToothSurface = "MOD",
            ScheduledAt = DateTime.UtcNow.AddDays(-1),
            Status = ProcedureStatus.Completed
        }, CancellationToken.None);

        // General procedure with tooth tagging (e.g. minor surgery)
        await procRepo.AddAsync(new Procedure
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Dela Cruz, Juan",
            ProcedureCode = "ORAL-SURG",
            ProcedureName = "Tooth Extraction",
            Category = "Surgery",
            ToothNumber = 48,
            ScheduledAt = DateTime.UtcNow.AddDays(-2),
            Status = ProcedureStatus.Completed
        }, CancellationToken.None);

        // Unrelated non-dental procedure without tooth tagging
        await procRepo.AddAsync(new Procedure
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Dela Cruz, Juan",
            ProcedureCode = "MED-NEB",
            ProcedureName = "Salbutamol Nebulization",
            Category = "Respiratory",
            ToothNumber = null,
            ScheduledAt = DateTime.UtcNow,
            Status = ProcedureStatus.Completed
        }, CancellationToken.None);

        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContext);

        // Act
        var result = await handler.Handle(new GetPatientDentalChartQuery(patientId), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.PatientId.Should().Be(patientId);

        // Verified sorted by tooth number ascending: 11, 21, 36
        result.Teeth.Should().HaveCount(3);
        result.Teeth[0].ToothNumber.Should().Be(11);
        result.Teeth[0].Status.Should().Be(ToothStatus.Healthy);
        result.Teeth[1].ToothNumber.Should().Be(21);
        result.Teeth[1].Status.Should().Be(ToothStatus.Decayed);
        result.Teeth[2].ToothNumber.Should().Be(36);
        result.Teeth[2].Status.Should().Be(ToothStatus.Filled);

        // Verifies only procedures with Category == 'Dental' or ToothNumber.HasValue are included
        result.DentalProcedures.Should().HaveCount(2);
        result.DentalProcedures.Should().Contain(p => p.ToothNumber == 36 && p.ProcedureName == "Composite Filling");
        result.DentalProcedures.Should().Contain(p => p.ToothNumber == 48 && p.ProcedureName == "Tooth Extraction");
        result.DentalProcedures.Should().NotContain(p => p.ProcedureCode == "MED-NEB");

        result.LastExaminedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task Handle_WhenNoToothRecordsExist_ReturnsEmptyChart()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var patientId = Guid.NewGuid();

        var handler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContext);

        // Act
        var result = await handler.Handle(new GetPatientDentalChartQuery(patientId), CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.PatientId.Should().Be(patientId);
        result.Teeth.Should().BeEmpty();
        result.DentalProcedures.Should().BeEmpty();
        result.LastExaminedAt.Should().BeNull();
    }

    [Fact]
    public async Task Handle_EnforcesTenantIsolation_ExcludesOtherClinicsTeethAndProcedures()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var patientId = Guid.NewGuid();
        var otherClinicId = Guid.NewGuid();

        // Record under another clinic
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = "other-tenant",
            ClinicId = otherClinicId,
            PatientId = patientId,
            ToothNumber = 16,
            Status = ToothStatus.Decayed
        }, CancellationToken.None);

        await procRepo.AddAsync(new Procedure
        {
            TenantId = "other-tenant",
            ClinicId = otherClinicId,
            PatientId = patientId,
            PatientName = "Dela Cruz, Juan",
            ProcedureCode = "DENT-01",
            ProcedureName = "Other Clinic Prophylaxis",
            Category = "Dental",
            ToothNumber = 16,
            ScheduledAt = DateTime.UtcNow
        }, CancellationToken.None);

        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContext);

        // Act
        var result = await handler.Handle(new GetPatientDentalChartQuery(patientId), CancellationToken.None);

        // Assert
        result.Teeth.Should().BeEmpty();
        result.DentalProcedures.Should().BeEmpty();
    }

    [Fact]
    public async Task Handle_ExcludesSoftDeletedRecords()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var patientId = Guid.NewGuid();

        var deletedTooth = new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ToothNumber = 16,
            Status = ToothStatus.Decayed,
            IsDeleted = true,
            DeletedAt = DateTime.UtcNow
        };
        await toothRepo.AddAsync(deletedTooth, CancellationToken.None);

        var deletedProc = new Procedure
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Dela Cruz, Juan",
            ProcedureCode = "DENT-01",
            ProcedureName = "Deleted Procedure",
            Category = "Dental",
            ToothNumber = 16,
            IsDeleted = true,
            DeletedAt = DateTime.UtcNow,
            ScheduledAt = DateTime.UtcNow
        };
        await procRepo.AddAsync(deletedProc, CancellationToken.None);

        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContext);

        // Act
        var result = await handler.Handle(new GetPatientDentalChartQuery(patientId), CancellationToken.None);

        // Assert
        result.Teeth.Should().BeEmpty();
        result.DentalProcedures.Should().BeEmpty();
    }

    [Fact]
    public async Task Handle_WithMultiConditionTooth_ReturnsBothRecordsAndDistinctToothSummaryMetrics()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<Procedure>(context, sieve);
        var patientId = Guid.NewGuid();

        // Tooth 16: Condition 1 - Filled on O
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ToothNumber = 16,
            Status = ToothStatus.Filled,
            Surface = "O",
            Notes = "Occlusal composite",
            CreatedBy = "Dr. Prior Dentist",
            UpdatedBy = "Dr. Restoring Dentist"
        }, CancellationToken.None);

        // Tooth 16: Condition 2 - Decay on MD
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ToothNumber = 16,
            Status = ToothStatus.Decayed,
            Surface = "MD",
            Notes = "Mesial and distal recurrent decay",
            CreatedBy = "Dr. Diagnostic Dentist"
        }, CancellationToken.None);

        // Tooth 21: Healthy
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ToothNumber = 21,
            Status = ToothStatus.Healthy,
            CreatedBy = "Dr. Diagnostic Dentist"
        }, CancellationToken.None);

        // Tooth 36: Missing
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ToothNumber = 36,
            Status = ToothStatus.Missing,
            CreatedBy = "Dr. Diagnostic Dentist"
        }, CancellationToken.None);

        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContext);

        // Act
        var result = await handler.Handle(new GetPatientDentalChartQuery(patientId), CancellationToken.None);

        // Assert: 4 record rows across 3 distinct teeth
        result.Should().NotBeNull();
        result.Teeth.Should().HaveCount(4);

        // Both conditions on tooth 16 are present with their respective RecordedBy values
        var tooth16Filled = result.Teeth.FirstOrDefault(t => t.ToothNumber == 16 && t.Status == ToothStatus.Filled);
        tooth16Filled.Should().NotBeNull();
        tooth16Filled!.Surface.Should().Be("O");
        tooth16Filled.RecordedBy.Should().Be("Dr. Restoring Dentist"); // UpdatedBy ?? CreatedBy

        var tooth16Decay = result.Teeth.FirstOrDefault(t => t.ToothNumber == 16 && t.Status == ToothStatus.Decayed);
        tooth16Decay.Should().NotBeNull();
        tooth16Decay!.Surface.Should().Be("MD");
        tooth16Decay.RecordedBy.Should().Be("Dr. Diagnostic Dentist"); // CreatedBy fallback

        // Summary metrics strictly calculate distinct teeth
        result.Summary.Should().NotBeNull();
        result.Summary!.TotalTeethRecorded.Should().Be(3); // Distinct teeth: 16, 21, 36 (NOT 4 rows!)
        result.Summary.HealthyCount.Should().Be(1); // Tooth 21
        result.Summary.FilledCount.Should().Be(1);  // Tooth 16
        result.Summary.DecayCount.Should().Be(1);   // Tooth 16
        result.Summary.MissingCount.Should().Be(1); // Tooth 36
        result.Summary.CrownCount.Should().Be(0);
        result.Summary.ExtractionCount.Should().Be(0);

        // DMFT: Distinct teeth with Decay, Missing, or Filled:
        // Tooth 16 (has Decay and Filled) counts as 1. Tooth 36 (Missing) counts as 1. Total = 2.
        result.Summary.DmftIndex.Should().Be(2);
    }
}
