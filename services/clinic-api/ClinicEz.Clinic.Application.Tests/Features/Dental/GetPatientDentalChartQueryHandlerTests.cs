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
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
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
            Status = ToothStatus.Decay,
            Surface = "M",
            Notes = "Incipient mesial caries"
        }, CancellationToken.None);

        // Dental procedure with tooth tagging
        await procRepo.AddAsync(new ClinicalProcedure
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
        await procRepo.AddAsync(new ClinicalProcedure
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
        await procRepo.AddAsync(new ClinicalProcedure
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
        result.Teeth[1].Status.Should().Be(ToothStatus.Decay);
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
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
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
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var patientId = Guid.NewGuid();
        var otherClinicId = Guid.NewGuid();

        // Record under another clinic
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = "other-tenant",
            ClinicId = otherClinicId,
            PatientId = patientId,
            ToothNumber = 16,
            Status = ToothStatus.Decay
        }, CancellationToken.None);

        await procRepo.AddAsync(new ClinicalProcedure
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
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var patientId = Guid.NewGuid();

        var deletedTooth = new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ToothNumber = 16,
            Status = ToothStatus.Decay,
            IsDeleted = true,
            DeletedAt = DateTime.UtcNow
        };
        await toothRepo.AddAsync(deletedTooth, CancellationToken.None);

        var deletedProc = new ClinicalProcedure
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
}
