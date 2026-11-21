using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Application.Interop;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Pharmacy.Infrastructure.Context;
using ClinicEz.Pharmacy.Infrastructure.Persistence;
using ClinicEz.Pharmacy.Infrastructure.Persistence.Repositories;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Sieve.Services;
using Xunit;

namespace ClinicEz.Pharmacy.Application.Tests;

public class OtcDispensationHandlerTests
{
    private const string PharmacyTenant = "tenant-pharmacy";
    private const string ClinicTenant = "tenant-clinic";
    private static readonly Guid PharmacyGuid = new("bbbbbbbb-0000-0000-0000-000000000001");
    private static readonly Guid ClinicGuid = new("cccccccc-0000-0000-0000-000000000001");

    private static Party PharmacyParty => Party.ForFacility(PharmacyTenant, PharmacyGuid.ToString(), FacilityType.Pharmacy);
    private static Party ClinicParty => Party.ForFacility(ClinicTenant, ClinicGuid.ToString(), FacilityType.Clinic);

    private sealed class Fixture
    {
        public required ApplicationDbContext Db { get; init; }
        public required TestPharmacyScope Scope { get; init; }
        public required OtcDispensationHandler Handler { get; init; }
        public required Repository<PrescriptionOrder> Orders { get; init; }
        public required Repository<PharmacyInventoryItem> Inventory { get; init; }
    }

    private static Fixture CreateFixture()
    {
        var scope = new TestPharmacyScope(string.Empty, Guid.Empty);
        var db = PharmacyTestDbHelper.CreateContext($"Pharmacy_OtcDb_{Guid.NewGuid()}", scope);
        var sieve = Substitute.For<ISieveProcessor>();
        var uow = new UnitOfWork(db, sieve, Substitute.For<IProductRepository>());
        var orders = new Repository<PrescriptionOrder>(db, sieve);
        var inventory = new Repository<PharmacyInventoryItem>(db, sieve);
        var settings = new Repository<PharmacySettings>(db, sieve);
        var audit = new Repository<DispenseAuditRecord>(db, sieve);

        // Provision pharmacy settings
        db.PharmacySettings.Add(new PharmacySettings
        {
            TenantId = PharmacyTenant,
            PharmacyId = PharmacyGuid,
            PharmacyName = "Test Community Pharmacy",
            PaymentPolicy = PharmacyPaymentPolicy.Postpaid
        });
        db.SaveChanges();

        var handler = new OtcDispensationHandler(
            orders,
            inventory,
            settings,
            audit,
            uow,
            scope,
            NullLogger<OtcDispensationHandler>.Instance);

        return new Fixture
        {
            Db = db,
            Scope = scope,
            Handler = handler,
            Orders = orders,
            Inventory = inventory
        };
    }

    private static InteropMessageContext Ctx(Guid correlationId) =>
        new(InteropEnvelope.Create(InteropTypes.PharmacyOtcDispensed, ClinicParty, PharmacyParty, correlationId, new object()));

    [Fact]
    public async Task OtcDispensationHandler_AllocatesFefoAndDecrementsStock()
    {
        var f = CreateFixture();

        var item = new PharmacyInventoryItem
        {
            TenantId = PharmacyTenant,
            PharmacyId = PharmacyGuid.ToString(),
            Sku = "MED-PARACET-500",
            GenericName = "Paracetamol",
            BrandName = "Biogesic",
            Strength = "500mg",
            DosageForm = "Tablet",
            CurrentStock = 100,
            UnitPrice = 5m
        };

        var batchEarlier = new InventoryBatch
        {
            Id = Guid.NewGuid(),
            BatchNumber = "BATCH-EARLIER",
            ExpiryDate = DateTime.UtcNow.AddMonths(3),
            QuantityReceived = 50,
            QuantityRemaining = 50,
            Status = BatchStatus.Active,
            ReceivedDate = DateTime.UtcNow.AddDays(-10)
        };

        var batchLater = new InventoryBatch
        {
            Id = Guid.NewGuid(),
            BatchNumber = "BATCH-LATER",
            ExpiryDate = DateTime.UtcNow.AddMonths(12),
            QuantityReceived = 50,
            QuantityRemaining = 50,
            Status = BatchStatus.Active,
            ReceivedDate = DateTime.UtcNow.AddDays(-5)
        };

        item.Batches.Add(batchEarlier);
        item.Batches.Add(batchLater);

        f.Db.InventoryItems.Add(item);
        await f.Db.SaveChangesAsync();

        var invoiceId = Guid.NewGuid();
        var payload = new PharmacyOtcDispensedPayload(
            Guid.NewGuid(),
            invoiceId,
            "INV-OTC-001",
            ClinicGuid,
            DateTime.UtcNow,
            new List<OtcDispensedItemDto>
            {
                new(null, "MED-PARACET-500", "Paracetamol 500mg", "Medicine", 30, 5m, 150m)
            }
        );

        await f.Handler.HandleAsync(payload, Ctx(invoiceId), CancellationToken.None);

        // Verify batch deduction follows FEFO (earlier expiry decremented first)
        var updatedItem = await f.Db.InventoryItems.Include(i => i.Batches).SingleAsync(i => i.Id == item.Id);
        var updatedBatchEarlier = updatedItem.Batches.Single(b => b.BatchNumber == "BATCH-EARLIER");
        var updatedBatchLater = updatedItem.Batches.Single(b => b.BatchNumber == "BATCH-LATER");

        updatedBatchEarlier.QuantityRemaining.Should().Be(20); // 50 - 30 = 20
        updatedBatchLater.QuantityRemaining.Should().Be(50);   // untouched
        updatedItem.CurrentStock.Should().Be(70);              // 100 - 30 = 70

        // Verify prescription order and audit record created
        var orders = await f.Db.PrescriptionOrders.ToListAsync();
        orders.Should().HaveCount(1);
        orders[0].ExternalPrescriptionId.Should().Be(invoiceId);
        orders[0].Status.Should().Be(PrescriptionStatus.Dispensed);

        var audit = await f.Db.DispenseAuditRecords.ToListAsync();
        audit.Should().HaveCount(1);
        audit[0].PrescriptionOrderId.Should().Be(orders[0].Id);
    }

    [Fact]
    public async Task OtcDispensationHandler_IsIdempotent_WhenSameInvoiceArrivesTwice()
    {
        var f = CreateFixture();

        var item = new PharmacyInventoryItem
        {
            TenantId = PharmacyTenant,
            PharmacyId = PharmacyGuid.ToString(),
            Sku = "MED-IBUPROFEN",
            GenericName = "Ibuprofen",
            BrandName = "Advil",
            Strength = "200mg",
            DosageForm = "Capsule",
            CurrentStock = 50,
            UnitPrice = 8m
        };

        var batch = new InventoryBatch
        {
            Id = Guid.NewGuid(),
            BatchNumber = "BATCH-IBU",
            ExpiryDate = DateTime.UtcNow.AddMonths(6),
            QuantityReceived = 50,
            QuantityRemaining = 50,
            Status = BatchStatus.Active,
            ReceivedDate = DateTime.UtcNow.AddDays(-5)
        };

        item.Batches.Add(batch);
        f.Db.InventoryItems.Add(item);
        await f.Db.SaveChangesAsync();

        var invoiceId = Guid.NewGuid();
        var payload = new PharmacyOtcDispensedPayload(
            Guid.NewGuid(),
            invoiceId,
            "INV-OTC-002",
            ClinicGuid,
            DateTime.UtcNow,
            new List<OtcDispensedItemDto>
            {
                new(null, "MED-IBUPROFEN", "Ibuprofen 200mg", "Medicine", 10, 8m, 80m)
            }
        );

        // First execution
        await f.Handler.HandleAsync(payload, Ctx(invoiceId), CancellationToken.None);

        var updatedItem1 = await f.Db.InventoryItems.SingleAsync(i => i.Id == item.Id);
        updatedItem1.CurrentStock.Should().Be(40);

        // Duplicate arrival (at-least-once message delivery)
        await f.Handler.HandleAsync(payload, Ctx(invoiceId), CancellationToken.None);

        var updatedItem2 = await f.Db.InventoryItems.SingleAsync(i => i.Id == item.Id);
        updatedItem2.CurrentStock.Should().Be(40); // Stock NOT deducted twice!

        var orders = await f.Db.PrescriptionOrders.ToListAsync();
        orders.Should().HaveCount(1); // Only 1 order created
    }

    [Fact]
    public async Task OtcDispensationHandler_AllocatesAcrossMultipleBatches_DepletingEarliestFirst()
    {
        var f = CreateFixture();

        var item = new PharmacyInventoryItem
        {
            TenantId = PharmacyTenant,
            PharmacyId = PharmacyGuid.ToString(),
            Sku = "MED-AMOX-500",
            GenericName = "Amoxicillin",
            BrandName = "Amoxil",
            Strength = "500mg",
            DosageForm = "Capsule",
            CurrentStock = 35,
            UnitPrice = 12m
        };

        var batch1 = new InventoryBatch
        {
            Id = Guid.NewGuid(),
            BatchNumber = "BATCH-AMOX-01",
            ExpiryDate = DateTime.UtcNow.AddMonths(2),
            QuantityReceived = 15,
            QuantityRemaining = 15,
            Status = BatchStatus.Active,
            ReceivedDate = DateTime.UtcNow.AddDays(-30)
        };

        var batch2 = new InventoryBatch
        {
            Id = Guid.NewGuid(),
            BatchNumber = "BATCH-AMOX-02",
            ExpiryDate = DateTime.UtcNow.AddMonths(6),
            QuantityReceived = 20,
            QuantityRemaining = 20,
            Status = BatchStatus.Active,
            ReceivedDate = DateTime.UtcNow.AddDays(-10)
        };

        item.Batches.Add(batch1);
        item.Batches.Add(batch2);
        f.Db.InventoryItems.Add(item);
        await f.Db.SaveChangesAsync();

        var invoiceId = Guid.NewGuid();
        var payload = new PharmacyOtcDispensedPayload(
            Guid.NewGuid(),
            invoiceId,
            "INV-OTC-MULTI-BATCH",
            ClinicGuid,
            DateTime.UtcNow,
            new List<OtcDispensedItemDto>
            {
                new(null, "MED-AMOX-500", "Amoxicillin 500mg", "Medicine", 25, 12m, 300m)
            }
        );

        await f.Handler.HandleAsync(payload, Ctx(invoiceId), CancellationToken.None);

        var updatedItem = await f.Db.InventoryItems.Include(i => i.Batches).SingleAsync(i => i.Id == item.Id);
        var b1 = updatedItem.Batches.Single(b => b.BatchNumber == "BATCH-AMOX-01");
        var b2 = updatedItem.Batches.Single(b => b.BatchNumber == "BATCH-AMOX-02");

        // Earliest batch should be completely depleted
        b1.QuantityRemaining.Should().Be(0);
        b1.Status.Should().Be(BatchStatus.Depleted);

        // Later batch should cover the remaining 10
        b2.QuantityRemaining.Should().Be(10);
        b2.Status.Should().Be(BatchStatus.Active);

        // Total stock remaining = 10
        updatedItem.CurrentStock.Should().Be(10);

        var orders = await f.Db.PrescriptionOrders.Include(o => o.Items).ToListAsync();
        orders.Should().HaveCount(1);
        var orderItem = orders[0].Items.Single();
        orderItem.AllocatedBatchNumber.Should().Contain("BATCH-AMOX-01 (Qty: 15)");
        orderItem.AllocatedBatchNumber.Should().Contain("BATCH-AMOX-02 (Qty: 10)");
    }

    [Fact]
    public async Task OtcDispensationHandler_OutOfStock_PartialFulfillment_DoesNotCrashOrMakeStockNegative()
    {
        var f = CreateFixture();

        var item = new PharmacyInventoryItem
        {
            TenantId = PharmacyTenant,
            PharmacyId = PharmacyGuid.ToString(),
            Sku = "MED-VIT-C",
            GenericName = "Ascorbic Acid",
            BrandName = "Cecon",
            Strength = "500mg",
            DosageForm = "Tablet",
            CurrentStock = 4,
            UnitPrice = 3m
        };

        var batch = new InventoryBatch
        {
            Id = Guid.NewGuid(),
            BatchNumber = "BATCH-VITC-LAST",
            ExpiryDate = DateTime.UtcNow.AddMonths(4),
            QuantityReceived = 10,
            QuantityRemaining = 4,
            Status = BatchStatus.Active,
            ReceivedDate = DateTime.UtcNow.AddDays(-15)
        };

        item.Batches.Add(batch);
        f.Db.InventoryItems.Add(item);
        await f.Db.SaveChangesAsync();

        var invoiceId = Guid.NewGuid();
        // Request 10 units when only 4 exist
        var payload = new PharmacyOtcDispensedPayload(
            Guid.NewGuid(),
            invoiceId,
            "INV-OTC-SHORTAGE",
            ClinicGuid,
            DateTime.UtcNow,
            new List<OtcDispensedItemDto>
            {
                new(null, "MED-VIT-C", "Ascorbic Acid 500mg", "Medicine", 10, 3m, 30m)
            }
        );

        // Should complete without throwing unhandled exception
        var act = async () => await f.Handler.HandleAsync(payload, Ctx(invoiceId), CancellationToken.None);
        await act.Should().NotThrowAsync();

        var updatedItem = await f.Db.InventoryItems.Include(i => i.Batches).SingleAsync(i => i.Id == item.Id);
        var b = updatedItem.Batches.Single();

        // Batch depleted and stock 0 (never negative)
        b.QuantityRemaining.Should().Be(0);
        b.Status.Should().Be(BatchStatus.Depleted);
        updatedItem.CurrentStock.Should().Be(0);

        var orders = await f.Db.PrescriptionOrders.ToListAsync();
        orders.Should().HaveCount(1);
    }

    [Fact]
    public async Task OtcDispensationHandler_CompletelyOutOfStock_DoesNotCrash()
    {
        var f = CreateFixture();

        var item = new PharmacyInventoryItem
        {
            TenantId = PharmacyTenant,
            PharmacyId = PharmacyGuid.ToString(),
            Sku = "MED-ZERO-STOCK",
            GenericName = "Cetirizine",
            BrandName = "Virlix",
            Strength = "10mg",
            DosageForm = "Tablet",
            CurrentStock = 0,
            UnitPrice = 15m
        };
        // No active batches at all
        f.Db.InventoryItems.Add(item);
        await f.Db.SaveChangesAsync();

        var invoiceId = Guid.NewGuid();
        var payload = new PharmacyOtcDispensedPayload(
            Guid.NewGuid(),
            invoiceId,
            "INV-OTC-ZERO-STOCK",
            ClinicGuid,
            DateTime.UtcNow,
            new List<OtcDispensedItemDto>
            {
                new(null, "MED-ZERO-STOCK", "Cetirizine 10mg", "Medicine", 5, 15m, 75m)
            }
        );

        var act = async () => await f.Handler.HandleAsync(payload, Ctx(invoiceId), CancellationToken.None);
        await act.Should().NotThrowAsync();

        var updatedItem = await f.Db.InventoryItems.SingleAsync(i => i.Id == item.Id);
        updatedItem.CurrentStock.Should().Be(0);

        var orders = await f.Db.PrescriptionOrders.ToListAsync();
        orders.Should().HaveCount(1);
    }

    [Fact]
    public async Task OtcDispensationHandler_IgnoresExpiredBatches()
    {
        var f = CreateFixture();

        var item = new PharmacyInventoryItem
        {
            TenantId = PharmacyTenant,
            PharmacyId = PharmacyGuid.ToString(),
            Sku = "MED-EXPIRE-TEST",
            GenericName = "Salbutamol",
            BrandName = "Ventolin",
            Strength = "2mg",
            DosageForm = "Tablet",
            CurrentStock = 100,
            UnitPrice = 2m
        };

        var expiredBatch = new InventoryBatch
        {
            Id = Guid.NewGuid(),
            BatchNumber = "BATCH-EXPIRED",
            ExpiryDate = DateTime.UtcNow.AddDays(-10), // EXPIRED!
            QuantityReceived = 50,
            QuantityRemaining = 50,
            Status = BatchStatus.Active,
            ReceivedDate = DateTime.UtcNow.AddDays(-100)
        };

        var validBatch = new InventoryBatch
        {
            Id = Guid.NewGuid(),
            BatchNumber = "BATCH-VALID",
            ExpiryDate = DateTime.UtcNow.AddMonths(12),
            QuantityReceived = 50,
            QuantityRemaining = 50,
            Status = BatchStatus.Active,
            ReceivedDate = DateTime.UtcNow.AddDays(-5)
        };

        item.Batches.Add(expiredBatch);
        item.Batches.Add(validBatch);
        f.Db.InventoryItems.Add(item);
        await f.Db.SaveChangesAsync();

        var invoiceId = Guid.NewGuid();
        var payload = new PharmacyOtcDispensedPayload(
            Guid.NewGuid(),
            invoiceId,
            "INV-OTC-EXPIRE",
            ClinicGuid,
            DateTime.UtcNow,
            new List<OtcDispensedItemDto>
            {
                new(null, "MED-EXPIRE-TEST", "Salbutamol 2mg", "Medicine", 20, 2m, 40m)
            }
        );

        await f.Handler.HandleAsync(payload, Ctx(invoiceId), CancellationToken.None);

        var updatedItem = await f.Db.InventoryItems.Include(i => i.Batches).SingleAsync(i => i.Id == item.Id);
        var bExpired = updatedItem.Batches.Single(b => b.BatchNumber == "BATCH-EXPIRED");
        var bValid = updatedItem.Batches.Single(b => b.BatchNumber == "BATCH-VALID");

        // Expired batch must NEVER be deducted
        bExpired.QuantityRemaining.Should().Be(50);

        // Valid batch should be deducted
        bValid.QuantityRemaining.Should().Be(30);

        // Current stock excludes expired
        updatedItem.CurrentStock.Should().Be(30);
    }

    [Fact]
    public async Task OtcDispensationHandler_CatalogItemNotFound_CreatesOrderGracefully()
    {
        var f = CreateFixture();

        var invoiceId = Guid.NewGuid();
        var payload = new PharmacyOtcDispensedPayload(
            Guid.NewGuid(),
            invoiceId,
            "INV-OTC-NOT-FOUND",
            ClinicGuid,
            DateTime.UtcNow,
            new List<OtcDispensedItemDto>
            {
                new(null, "UNKNOWN-SKU-999", "Custom Non-Catalog Item", "Supply", 3, 20m, 60m)
            }
        );

        var act = async () => await f.Handler.HandleAsync(payload, Ctx(invoiceId), CancellationToken.None);
        await act.Should().NotThrowAsync();

        var orders = await f.Db.PrescriptionOrders.Include(o => o.Items).ToListAsync();
        orders.Should().HaveCount(1);
        orders[0].Items.Single().GenericName.Should().Be("Custom Non-Catalog Item");
    }

    [Fact]
    public async Task OtcDispensationHandler_ZeroOrNegativeQuantity_SkippedGracefully()
    {
        var f = CreateFixture();

        var item = new PharmacyInventoryItem
        {
            TenantId = PharmacyTenant,
            PharmacyId = PharmacyGuid.ToString(),
            Sku = "MED-ZERO-QTY",
            GenericName = "Mefenamic Acid",
            BrandName = "Ponstan",
            Strength = "500mg",
            DosageForm = "Capsule",
            CurrentStock = 50,
            UnitPrice = 10m
        };

        var batch = new InventoryBatch
        {
            Id = Guid.NewGuid(),
            BatchNumber = "BATCH-MEF",
            ExpiryDate = DateTime.UtcNow.AddMonths(10),
            QuantityReceived = 50,
            QuantityRemaining = 50,
            Status = BatchStatus.Active,
            ReceivedDate = DateTime.UtcNow.AddDays(-5)
        };
        item.Batches.Add(batch);
        f.Db.InventoryItems.Add(item);
        await f.Db.SaveChangesAsync();

        var invoiceId = Guid.NewGuid();
        var payload = new PharmacyOtcDispensedPayload(
            Guid.NewGuid(),
            invoiceId,
            "INV-OTC-ZERO-QTY",
            ClinicGuid,
            DateTime.UtcNow,
            new List<OtcDispensedItemDto>
            {
                new(null, "MED-ZERO-QTY", "Mefenamic Acid 500mg", "Medicine", 0, 10m, 0m),
                new(null, "MED-ZERO-QTY", "Mefenamic Acid 500mg", "Medicine", -5, 10m, -50m)
            }
        );

        await f.Handler.HandleAsync(payload, Ctx(invoiceId), CancellationToken.None);

        var updatedItem = await f.Db.InventoryItems.SingleAsync(i => i.Id == item.Id);
        updatedItem.CurrentStock.Should().Be(50); // Untouched
    }

    [Fact]
    public async Task OtcDispensationHandler_NonPharmacyRecipient_IgnoredGracefully()
    {
        var f = CreateFixture();

        var invoiceId = Guid.NewGuid();
        var payload = new PharmacyOtcDispensedPayload(
            Guid.NewGuid(),
            invoiceId,
            "INV-OTC-NON-PHARMACY",
            ClinicGuid,
            DateTime.UtcNow,
            new List<OtcDispensedItemDto>
            {
                new(null, "MED-TEST", "Test Item", "Medicine", 1, 10m, 10m)
            }
        );

        var clinicToClinicCtx = new InteropMessageContext(
            InteropEnvelope.Create(InteropTypes.PharmacyOtcDispensed, ClinicParty, ClinicParty, invoiceId, new object()));

        var act = async () => await f.Handler.HandleAsync(payload, clinicToClinicCtx, CancellationToken.None);
        await act.Should().NotThrowAsync();

        var orders = await f.Db.PrescriptionOrders.ToListAsync();
        orders.Should().BeEmpty();
    }
}
