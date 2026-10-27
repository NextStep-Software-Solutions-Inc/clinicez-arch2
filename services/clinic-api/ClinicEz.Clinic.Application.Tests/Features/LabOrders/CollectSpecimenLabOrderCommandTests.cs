using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.LabOrders.Commands;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.LabOrders;

public class CollectSpecimenLabOrderCommandTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_specimen_test";

    public CollectSpecimenLabOrderCommandTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
    }

    [Fact]
    public async Task CollectSpecimen_WhenOrdered_TransitionsStatusAndStageToSpecimenCollected()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var orderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve);

        var order = new ClinicLabOrder
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            OrderNumber = "LAB-20261027-002",
            PatientId = Guid.NewGuid(),
            PatientName = "Makisig Abellana",
            Status = LabOrderStatus.Ordered,
            Stage = LabOrderStage.Issued,
            Items = new List<ClinicLabOrderItem>
            {
                new ClinicLabOrderItem
                {
                    Id = Guid.NewGuid(),
                    TestName = "Complete Blood Count (CBC)",
                    Category = "Hematology",
                    Status = LabOrderStatus.Ordered
                }
            }
        };
        await db.LabOrders.AddAsync(order);
        await db.SaveChangesAsync();

        var handler = new CollectSpecimenLabOrderCommandHandler(orderRepo, unitOfWork, _clinicContext);
        var command = new CollectSpecimenLabOrderCommand(
            order.Id,
            SpecimenType: "Whole Blood (EDTA)",
            ContainerType: "Purple_EDTA",
            AccessionBarcode: "SPEC-718400",
            CollectorName: "Treatment Nurse",
            Notes: "Adequate volume, unhemolyzed."
        );

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.Status.Should().Be(LabOrderStatus.SpecimenCollected);
        result.Stage.Should().Be(LabOrderStage.SpecimenCollected);
        result.StageReason.Should().Contain("Whole Blood (EDTA)").And.Contain("SPEC-718400");
        result.SpecimenType.Should().Be("Whole Blood (EDTA)");
        result.Notes.Should().Contain("Purple_EDTA").And.Contain("Treatment Nurse");
        result.Items.Should().ContainSingle(i => i.Status == LabOrderStatus.SpecimenCollected);

        // Verify in DB
        var reloaded = await db.LabOrders.FindAsync(order.Id);
        reloaded!.Status.Should().Be(LabOrderStatus.SpecimenCollected);
        reloaded.Stage.Should().Be(LabOrderStage.SpecimenCollected);
    }

    [Fact]
    public async Task CollectSpecimen_WhenOrderAlreadyCompleted_ThrowsValidationException()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var orderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve);

        var order = new ClinicLabOrder
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            OrderNumber = "LAB-20261027-003",
            PatientId = Guid.NewGuid(),
            PatientName = "Test Patient",
            Status = LabOrderStatus.Completed,
            Stage = LabOrderStage.ResultFinalized
        };
        await db.LabOrders.AddAsync(order);
        await db.SaveChangesAsync();

        var handler = new CollectSpecimenLabOrderCommandHandler(orderRepo, unitOfWork, _clinicContext);
        var command = new CollectSpecimenLabOrderCommand(
            order.Id,
            "Urine",
            "Yellow_Cup",
            "SPEC-999999",
            "Nurse",
            "Test"
        );

        var act = () => handler.Handle(command, CancellationToken.None);
        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*Completed lab orders cannot have specimen collection updated*");
    }

    [Fact]
    public async Task CollectSpecimen_WhenOrderCancelled_ThrowsValidationException()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var orderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve);

        var order = new ClinicLabOrder
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            OrderNumber = "LAB-20261027-004",
            PatientId = Guid.NewGuid(),
            PatientName = "Test Patient",
            Status = LabOrderStatus.Cancelled,
            Stage = LabOrderStage.Cancelled
        };
        await db.LabOrders.AddAsync(order);
        await db.SaveChangesAsync();

        var handler = new CollectSpecimenLabOrderCommandHandler(orderRepo, unitOfWork, _clinicContext);
        var command = new CollectSpecimenLabOrderCommand(
            order.Id,
            "Urine",
            "Yellow_Cup",
            "SPEC-999999",
            "Nurse",
            "Test"
        );

        var act = () => handler.Handle(command, CancellationToken.None);
        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*Cancelled lab orders cannot have specimen collected*");
    }

    [Fact]
    public async Task CollectSpecimen_WhenNotFound_ThrowsNotFoundException()
    {
        var (db, unitOfWork, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var orderRepo = TestDbHelper.CreateRepository<ClinicLabOrder>(db, sieve);

        var handler = new CollectSpecimenLabOrderCommandHandler(orderRepo, unitOfWork, _clinicContext);
        var command = new CollectSpecimenLabOrderCommand(
            Guid.NewGuid(),
            "Blood",
            "EDTA",
            "SPEC-123",
            "Nurse",
            null
        );

        var act = () => handler.Handle(command, CancellationToken.None);
        await act.Should().ThrowAsync<NotFoundException>();
    }
}
