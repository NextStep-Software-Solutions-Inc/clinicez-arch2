using System;
using System.Collections.Generic;
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
using MediatR;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Dental;

public class BatchSaveDentalChartCommandHandlerTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private const string _tenantId = "tenant-dental-batch-test";

    public BatchSaveDentalChartCommandHandlerTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffName.Returns("Dr. Test Dentist");
    }

    [Fact]
    public async Task Handle_BatchUpsertMultipleTeeth_SavesAllAndReturnsUpdatedChart()
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
            PatientCode = "PAT-BATCH-001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            ContactNumber = "09171234567"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var chartQueryHandler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContext);
        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetPatientDentalChartQuery>(q => q.PatientId == patientId), Arg.Any<CancellationToken>())
            .Returns(ci => chartQueryHandler.Handle(ci.Arg<GetPatientDentalChartQuery>(), ci.Arg<CancellationToken>()));

        var handler = new BatchSaveDentalChartCommandHandler(toothRepo, patientRepo, uow, _clinicContext, sender);

        var command = new BatchSaveDentalChartCommand(
            PatientId: patientId,
            ConsultationId: null,
            Teeth: new List<ToothRecordInput>
            {
                new(ToothNumber: 11, Status: ToothStatus.Healthy, Surface: null, Notes: "Intact"),
                new(ToothNumber: 16, Status: ToothStatus.Decay, Surface: "dom", Notes: "Caries on occlusal/mesial/distal"),
                new(ToothNumber: 26, Status: ToothStatus.Filled, Surface: "O", Notes: "Amalgam"),
                new(ToothNumber: 38, Status: ToothStatus.Extraction, Surface: null, Notes: "Impacted wisdom tooth")
            }
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.PatientId.Should().Be(patientId);
        result.Teeth.Should().HaveCount(4);

        // Tooth 16 surface canonicalized to "MOD"
        var tooth16 = result.Teeth.First(t => t.ToothNumber == 16);
        tooth16.Status.Should().Be(ToothStatus.Decay);
        tooth16.Surface.Should().Be("MOD");

        // Verify database persistence
        var persisted = await toothRepo.Query(t => t.PatientId == patientId).ToListAsync();
        persisted.Should().HaveCount(4);
    }

    [Fact]
    public async Task Handle_BatchUpdatesExistingAndInsertsNew_InSingleAtomicOperation()
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
            PatientCode = "PAT-002",
            FirstName = "Maria",
            LastName = "Clara",
            ContactNumber = "09171234567"
        }, CancellationToken.None);

        // Existing tooth 16 Decay
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            ToothNumber = 16,
            Status = ToothStatus.Decay,
            Surface = "MOD",
            Notes = "Caries observed previously"
        }, CancellationToken.None);

        await uow.SaveChangesAsync(CancellationToken.None);

        var chartQueryHandler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContext);
        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetPatientDentalChartQuery>(q => q.PatientId == patientId), Arg.Any<CancellationToken>())
            .Returns(ci => chartQueryHandler.Handle(ci.Arg<GetPatientDentalChartQuery>(), ci.Arg<CancellationToken>()));

        var handler = new BatchSaveDentalChartCommandHandler(toothRepo, patientRepo, uow, _clinicContext, sender);

        var command = new BatchSaveDentalChartCommand(
            PatientId: patientId,
            ConsultationId: null,
            Teeth: new List<ToothRecordInput>
            {
                // Updating tooth 16 to Filled
                new(ToothNumber: 16, Status: ToothStatus.Filled, Surface: "MOD", Notes: "Restoration complete"),
                // Inserting new tooth 21
                new(ToothNumber: 21, Status: ToothStatus.Healthy, Surface: null, Notes: "Normal")
            }
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Teeth.Should().HaveCount(2);

        var dbRecords = await toothRepo.Query(t => t.PatientId == patientId).ToListAsync();
        dbRecords.Should().HaveCount(2);

        var tooth16 = dbRecords.First(t => t.ToothNumber == 16);
        tooth16.Status.Should().Be(ToothStatus.Filled);
        tooth16.Notes.Should().Be("Restoration complete");
        tooth16.UpdatedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task Handle_WhenAnyToothNumberIsInvalid_RollsBackTransactionAndThrowsBadRequest()
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
            PatientCode = "PAT-003",
            FirstName = "Pedro",
            LastName = "Penduko",
            ContactNumber = "09171234567"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new BatchSaveDentalChartCommandHandler(toothRepo, patientRepo, uow, _clinicContext, sender);

        var command = new BatchSaveDentalChartCommand(
            PatientId: patientId,
            ConsultationId: null,
            Teeth: new List<ToothRecordInput>
            {
                new(ToothNumber: 11, Status: ToothStatus.Healthy),
                new(ToothNumber: 21, Status: ToothStatus.Healthy),
                new(ToothNumber: 56, Status: ToothStatus.Decay) // Invalid child tooth (child quadrants max at 5)
            }
        );

        // Act
        var act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*'56' is invalid under ISO 3950 FDI notation*");

        // Atomic rollback verification: zero records persisted
        var dbRecords = await toothRepo.Query(t => t.PatientId == patientId).ToListAsync();
        dbRecords.Should().BeEmpty();
    }

    [Fact]
    public async Task Handle_WhenAnySurfaceIsInvalid_RollsBackTransactionAndThrowsBadRequest()
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
            PatientCode = "PAT-004",
            FirstName = "Clara",
            LastName = "Reyes",
            ContactNumber = "09171234567"
        }, CancellationToken.None);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new BatchSaveDentalChartCommandHandler(toothRepo, patientRepo, uow, _clinicContext, sender);

        var command = new BatchSaveDentalChartCommand(
            PatientId: patientId,
            ConsultationId: null,
            Teeth: new List<ToothRecordInput>
            {
                new(ToothNumber: 11, Status: ToothStatus.Healthy),
                new(ToothNumber: 16, Status: ToothStatus.Decay, Surface: "XYZ") // Invalid surface characters
            }
        );

        // Act
        var act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*Invalid tooth surface*");

        var dbRecords = await toothRepo.Query(t => t.PatientId == patientId).ToListAsync();
        dbRecords.Should().BeEmpty();
    }

    [Fact]
    public async Task Handle_WhenPatientNotFound_ThrowsNotFoundException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var sender = Substitute.For<ISender>();

        var handler = new BatchSaveDentalChartCommandHandler(toothRepo, patientRepo, uow, _clinicContext, sender);

        var command = new BatchSaveDentalChartCommand(
            PatientId: Guid.NewGuid(),
            ConsultationId: null,
            Teeth: new List<ToothRecordInput>
            {
                new(ToothNumber: 11, Status: ToothStatus.Healthy)
            }
        );

        // Act
        var act = async () => await handler.Handle(command, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task Handle_TenantIsolation_DoesNotMutateOtherClinicsRecords()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var toothRepo = TestDbHelper.CreateRepository<DentalToothRecord>(context, sieve);
        var procRepo = TestDbHelper.CreateRepository<ClinicalProcedure>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);

        var otherClinicId = Guid.NewGuid();
        var patientId = Guid.NewGuid();

        await patientRepo.AddAsync(new ClinicPatient
        {
            Id = patientId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientCode = "PAT-005",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            ContactNumber = "09171234567"
        }, CancellationToken.None);

        // Tooth record in other clinic
        await toothRepo.AddAsync(new DentalToothRecord
        {
            TenantId = "other-tenant",
            ClinicId = otherClinicId,
            PatientId = patientId,
            ToothNumber = 16,
            Status = ToothStatus.Healthy,
            Notes = "Other clinic record"
        }, CancellationToken.None);

        await uow.SaveChangesAsync(CancellationToken.None);

        var chartQueryHandler = new GetPatientDentalChartQueryHandler(toothRepo, procRepo, _clinicContext);
        var sender = Substitute.For<ISender>();
        sender.Send(Arg.Is<GetPatientDentalChartQuery>(q => q.PatientId == patientId), Arg.Any<CancellationToken>())
            .Returns(ci => chartQueryHandler.Handle(ci.Arg<GetPatientDentalChartQuery>(), ci.Arg<CancellationToken>()));

        var handler = new BatchSaveDentalChartCommandHandler(toothRepo, patientRepo, uow, _clinicContext, sender);

        var command = new BatchSaveDentalChartCommand(
            PatientId: patientId,
            ConsultationId: null,
            Teeth: new List<ToothRecordInput>
            {
                new(ToothNumber: 16, Status: ToothStatus.Decay, Surface: "MOD", Notes: "Our clinic record")
            }
        );

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Teeth.Should().HaveCount(1);
        result.Teeth[0].ClinicId.Should().Be(_clinicId);
        result.Teeth[0].Status.Should().Be(ToothStatus.Decay);

        // Other clinic record remains unaltered
        var otherRecord = await toothRepo.Query(t => t.ClinicId == otherClinicId && t.ToothNumber == 16, ignoreQueryFilters: true).FirstAsync();
        otherRecord.Status.Should().Be(ToothStatus.Healthy);
        otherRecord.Notes.Should().Be("Other clinic record");
    }
}
