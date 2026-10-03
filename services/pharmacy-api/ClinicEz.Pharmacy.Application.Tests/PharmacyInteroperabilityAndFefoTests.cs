using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Application.Common.Interfaces;
using ClinicEz.Pharmacy.Application.Features.Prescriptions.Commands;
using ClinicEz.Pharmacy.Application.Features.Prescriptions.Queries;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Domain.Services;
using ClinicEz.Pharmacy.Infrastructure.Consumers;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

namespace ClinicEz.Pharmacy.Application.Tests;

public class PharmacyInteroperabilityAndFefoTests
{
    [Fact]
    public void FefoInventoryAllocator_Should_Pick_Earliest_Expiring_Batch_First()
    {
        var now = new DateTime(2026, 10, 1);
        var batches = new List<InventoryBatch>
        {
            new()
            {
                Id = Guid.NewGuid(),
                BatchNumber = "BATCH-LATER-2027",
                ExpiryDate = new DateTime(2027, 12, 31),
                QuantityRemaining = 100,
                Status = BatchStatus.Active,
                ReceivedDate = now.AddDays(-10)
            },
            new()
            {
                Id = Guid.NewGuid(),
                BatchNumber = "BATCH-EARLIER-2026",
                ExpiryDate = new DateTime(2026, 11, 30), // Expiring first
                QuantityRemaining = 50,
                Status = BatchStatus.Active,
                ReceivedDate = now.AddDays(-30)
            }
        };

        var result = FefoInventoryAllocator.Allocate(30, batches, asOfDate: now);

        result.IsFullyAllocated.Should().BeTrue();
        result.AllocatedQuantity.Should().Be(30);
        result.Shortage.Should().Be(0);
        result.Allocations.Should().HaveCount(1);

        var firstAlloc = result.Allocations[0];
        firstAlloc.BatchNumber.Should().Be("BATCH-EARLIER-2026");
        firstAlloc.QuantityAllocated.Should().Be(30);
        firstAlloc.RemainingAfterDeduction.Should().Be(20);
    }

    [Fact]
    public void FefoInventoryAllocator_Should_Split_Allocation_Across_Multiple_Batches_When_Single_Batch_Insufficient()
    {
        var now = new DateTime(2026, 10, 1);
        var batch1 = new InventoryBatch
        {
            Id = Guid.NewGuid(),
            BatchNumber = "BATCH-1",
            ExpiryDate = new DateTime(2026, 12, 1),
            QuantityRemaining = 20,
            Status = BatchStatus.Active
        };
        var batch2 = new InventoryBatch
        {
            Id = Guid.NewGuid(),
            BatchNumber = "BATCH-2",
            ExpiryDate = new DateTime(2027, 6, 1),
            QuantityRemaining = 50,
            Status = BatchStatus.Active
        };

        var result = FefoInventoryAllocator.Allocate(35, new[] { batch1, batch2 }, asOfDate: now);

        result.IsFullyAllocated.Should().BeTrue();
        result.AllocatedQuantity.Should().Be(35);
        result.Allocations.Should().HaveCount(2);

        result.Allocations[0].BatchNumber.Should().Be("BATCH-1");
        result.Allocations[0].QuantityAllocated.Should().Be(20);
        result.Allocations[0].RemainingAfterDeduction.Should().Be(0);

        result.Allocations[1].BatchNumber.Should().Be("BATCH-2");
        result.Allocations[1].QuantityAllocated.Should().Be(15);
        result.Allocations[1].RemainingAfterDeduction.Should().Be(35);
    }

    [Fact]
    public void FefoInventoryAllocator_Should_Reject_Expired_Batches()
    {
        var now = new DateTime(2026, 10, 1);
        var expiredBatch = new InventoryBatch
        {
            Id = Guid.NewGuid(),
            BatchNumber = "BATCH-EXPIRED",
            ExpiryDate = new DateTime(2026, 8, 15), // Expired
            QuantityRemaining = 100,
            Status = BatchStatus.Active
        };
        var activeBatch = new InventoryBatch
        {
            Id = Guid.NewGuid(),
            BatchNumber = "BATCH-ACTIVE",
            ExpiryDate = new DateTime(2027, 3, 1),
            QuantityRemaining = 15,
            Status = BatchStatus.Active
        };

        var result = FefoInventoryAllocator.Allocate(25, new[] { expiredBatch, activeBatch }, asOfDate: now);

        result.IsFullyAllocated.Should().BeFalse();
        result.AllocatedQuantity.Should().Be(15);
        result.Shortage.Should().Be(10);
        result.Allocations.Should().HaveCount(1);
        result.Allocations[0].BatchNumber.Should().Be("BATCH-ACTIVE");
    }

    [Fact]
    public async Task PrescriptionIssuedConsumer_Should_Ingest_Event_Into_PrescriptionOrder_Queue()
    {
        var (db, uow, sieve) = PharmacyTestDbHelper.CreateTestContext();
        var orderRepo = PharmacyTestDbHelper.CreateRepository<PrescriptionOrder>(db, sieve);
        var inventoryRepo = PharmacyTestDbHelper.CreateRepository<PharmacyInventoryItem>(db, sieve);
        var logger = Substitute.For<ILogger<PrescriptionIssuedConsumer>>();

        // Seed inventory catalog
        var med = new PharmacyInventoryItem
        {
            Id = Guid.NewGuid(),
            Sku = "MED-AML-001",
            GenericName = "Amlodipine Besylate",
            DosageForm = "Tablet",
            Strength = "5mg",
            CurrentStock = 100,
            UnitPrice = 8.50m
        };
        await db.InventoryItems.AddAsync(med);
        await db.SaveChangesAsync();

        var consumer = new PrescriptionIssuedConsumer(orderRepo, inventoryRepo, uow, logger);

        var rxEvent = new PrescriptionIssuedEvent
        {
            PrescriptionId = Guid.NewGuid(),
            PrescriptionNumber = "RX-20261001-0081",
            OrderingFacilityId = "clinic-1",
            OrderingFacilityName = "Metro Family Clinic",
            TenantId = "tenant-clinic",
            PrescriberDoctor = new PrescriberDoctorDto
            {
                DoctorId = "doc-001",
                DoctorName = "Dr. Cruz, MD",
                PrcLicenseNumber = "PRC-0149281"
            },
            Patient = new PrescriptionPatientDto
            {
                PatientId = Guid.NewGuid(),
                FullName = "Maria Santos",
                Age = 42,
                Gender = "Female",
                ContactNumber = "09171234567"
            },
            ClinicalDiagnosis = "Essential Hypertension",
            Items = new List<PrescriptionItemDto>
            {
                new()
                {
                    GenericName = "Amlodipine Besylate",
                    Dosage = "5mg",
                    Form = "Tablet",
                    Sig = "Take 1 tablet once daily in the morning",
                    Quantity = 30
                }
            }
        };

        var context = Substitute.For<ConsumeContext<PrescriptionIssuedEvent>>();
        context.Message.Returns(rxEvent);
        context.CancellationToken.Returns(CancellationToken.None);

        await consumer.Consume(context);

        var savedOrder = await db.PrescriptionOrders
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.PrescriptionNumber == "RX-20261001-0081");

        savedOrder.Should().NotBeNull();
        savedOrder!.PatientName.Should().Be("Maria Santos");
        savedOrder.Status.Should().Be(PrescriptionStatus.Pending);
        savedOrder.Items.Should().HaveCount(1);
        savedOrder.Items.First().GenericName.Should().Be("Amlodipine Besylate");
        savedOrder.Items.First().UnitPrice.Should().Be(8.50m);
        savedOrder.TotalAmount.Should().Be(255.00m); // 30 * 8.50
    }

    [Fact]
    public async Task DispensePrescriptionCommand_Should_Deduct_Inventory_Via_FEFO_And_Publish_PrescriptionDispensedEvent()
    {
        var (db, uow, sieve) = PharmacyTestDbHelper.CreateTestContext();
        var orderRepo = PharmacyTestDbHelper.CreateRepository<PrescriptionOrder>(db, sieve);
        var inventoryRepo = PharmacyTestDbHelper.CreateRepository<PharmacyInventoryItem>(db, sieve);
        var auditRepo = PharmacyTestDbHelper.CreateRepository<DispenseAuditRecord>(db, sieve);
        var publisher = Substitute.For<IPrescriptionDispensedPublisher>();

        var now = DateTime.UtcNow;

        // Create medication with 2 batches (FEFO test)
        var med = new PharmacyInventoryItem
        {
            Id = Guid.NewGuid(),
            Sku = "MED-LOS-002",
            GenericName = "Losartan Potassium",
            DosageForm = "Tablet",
            Strength = "50mg",
            CurrentStock = 50,
            UnitPrice = 12.00m,
            Batches = new List<InventoryBatch>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    BatchNumber = "B-LOS-EARLY",
                    ExpiryDate = now.AddMonths(4), // Expiring sooner
                    QuantityRemaining = 15,
                    Status = BatchStatus.Active
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    BatchNumber = "B-LOS-LATER",
                    ExpiryDate = now.AddMonths(18), // Expiring later
                    QuantityRemaining = 35,
                    Status = BatchStatus.Active
                }
            }
        };
        await db.InventoryItems.AddAsync(med);

        // Create prescription order for 20 tablets
        var order = new PrescriptionOrder
        {
            Id = Guid.NewGuid(),
            ExternalPrescriptionId = Guid.NewGuid(),
            PrescriptionNumber = "RX-20261001-0099",
            PatientName = "Juan Dela Cruz",
            Status = PrescriptionStatus.Pending,
            Items = new List<PrescriptionOrderItem>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    InventoryItemId = med.Id,
                    GenericName = "Losartan Potassium",
                    Dosage = "50mg",
                    Sig = "Take 1 tablet daily at bedtime",
                    QuantityPrescribed = 20,
                    UnitPrice = 12.00m,
                    Subtotal = 240.00m,
                    Status = ItemDispenseStatus.Pending
                }
            }
        };
        await db.PrescriptionOrders.AddAsync(order);
        await db.SaveChangesAsync();

        var handler = new DispensePrescriptionCommandHandler(orderRepo, inventoryRepo, auditRepo, uow, publisher);
        var command = new DispensePrescriptionCommand(
            order.Id,
            "Pharmacist Karen Reyes, RPh",
            "PRC-PHARM-88912",
            "OR-2026-0491",
            "Dispensed with patient counseling"
        );

        var result = await handler.Handle(command, CancellationToken.None);

        result.Status.Should().Be(PrescriptionStatus.Dispensed.ToString());
        result.DispensingPharmacistName.Should().Be("Pharmacist Karen Reyes, RPh");
        result.Items.First().Status.Should().Be(ItemDispenseStatus.Dispensed.ToString());
        result.Items.First().QuantityDispensed.Should().Be(20);

        // Verify inventory deduction in DB
        var updatedMed = await db.InventoryItems.Include(i => i.Batches).FirstAsync(i => i.Id == med.Id);
        var earlyBatch = updatedMed.Batches.First(b => b.BatchNumber == "B-LOS-EARLY");
        var laterBatch = updatedMed.Batches.First(b => b.BatchNumber == "B-LOS-LATER");

        earlyBatch.QuantityRemaining.Should().Be(0); // 15 taken, depleted
        earlyBatch.Status.Should().Be(BatchStatus.Depleted);
        laterBatch.QuantityRemaining.Should().Be(30); // 5 taken out of 35
        updatedMed.CurrentStock.Should().Be(30); // 50 - 20 = 30

        // Verify event was published over MassTransit
        await publisher.Received(1).PublishPrescriptionDispensedAsync(
            Arg.Is<PrescriptionDispensedEvent>(e =>
                e.PrescriptionNumber == "RX-20261001-0099" &&
                e.DispensingPharmacistName == "Pharmacist Karen Reyes, RPh" &&
                e.TotalAmount == 240.00m &&
                e.DispensedItems.Count == 1),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task DispensePrescriptionCommand_Should_Block_Dangerous_Drugs_If_Doctor_S2_Missing()
    {
        var (db, uow, sieve) = PharmacyTestDbHelper.CreateTestContext();
        var orderRepo = PharmacyTestDbHelper.CreateRepository<PrescriptionOrder>(db, sieve);
        var inventoryRepo = PharmacyTestDbHelper.CreateRepository<PharmacyInventoryItem>(db, sieve);
        var auditRepo = PharmacyTestDbHelper.CreateRepository<DispenseAuditRecord>(db, sieve);
        var publisher = Substitute.For<IPrescriptionDispensedPublisher>();

        var order = new PrescriptionOrder
        {
            Id = Guid.NewGuid(),
            PrescriptionNumber = "RX-DANGEROUS-001",
            PatientName = "Pedro Penduko",
            DoctorS2License = null, // Missing S2 license!
            Status = PrescriptionStatus.Pending,
            Items = new List<PrescriptionOrderItem>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    GenericName = "Morphine Sulfate",
                    Dosage = "10mg",
                    Sig = "Take as directed under strict supervision",
                    QuantityPrescribed = 10,
                    IsDangerousDrug = true // PDEA controlled drug
                }
            }
        };
        await db.PrescriptionOrders.AddAsync(order);
        await db.SaveChangesAsync();

        var handler = new DispensePrescriptionCommandHandler(orderRepo, inventoryRepo, auditRepo, uow, publisher);
        var command = new DispensePrescriptionCommand(
            order.Id,
            "Pharmacist Karen Reyes, RPh",
            "PRC-PHARM-88912"
        );

        var act = async () => await handler.Handle(command, CancellationToken.None);
        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*RA 9165*S2 License*");
    }
}
