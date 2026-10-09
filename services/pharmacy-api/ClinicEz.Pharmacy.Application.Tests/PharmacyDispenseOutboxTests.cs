using ClinicEz.Pharmacy.Application.Common.Interfaces;
using ClinicEz.Pharmacy.Application.Features.Prescriptions.Commands;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Infrastructure.Persistence;
using ClinicEz.Pharmacy.Infrastructure.Persistence.Repositories;
using ClinicEz.Pharmacy.Infrastructure.Services;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Sieve.Services;

namespace ClinicEz.Pharmacy.Application.Tests;

public class PharmacyDispenseOutboxTests
{
    private const string OrderingTenant = "tenant-clinic";
    private const string OrderingFacility = "cccccccc-0000-0000-0000-000000000001";

    private sealed class Seeded
    {
        public required string DbName { get; init; }
        public required ApplicationDbContext Db { get; init; }
        public required DispensePrescriptionCommandHandler Handler { get; init; }
        public required PrescriptionOrder Order { get; init; }
        public required PharmacyInventoryItem Item { get; init; }
    }

    private static async Task<Seeded> SeedAsync(IPrescriptionDispensedPublisherFactory publisherFactory)
    {
        var dbName = $"Pharmacy_DispenseDb_{Guid.NewGuid()}";
        var db = PharmacyTestDbHelper.CreateContext(dbName, new TestPharmacyScope(PharmacyTestDbHelper.TenantId, PharmacyTestDbHelper.PharmacyId));
        var sieve = Substitute.For<ISieveProcessor>();
        var uow = new UnitOfWork(db, sieve, Substitute.For<IProductRepository>());

        var item = new PharmacyInventoryItem
        {
            Id = Guid.NewGuid(),
            TenantId = PharmacyTestDbHelper.TenantId,
            PharmacyId = PharmacyTestDbHelper.PharmacyKey,
            Sku = "MED-AMO-001",
            GenericName = "Amoxicillin",
            DosageForm = "Capsule",
            Strength = "500mg",
            CurrentStock = 40,
            UnitPrice = 5.00m,
            Batches = new List<InventoryBatch>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    TenantId = PharmacyTestDbHelper.TenantId,
                    PharmacyId = PharmacyTestDbHelper.PharmacyKey,
                    BatchNumber = "B-AMO-1",
                    ExpiryDate = DateTime.UtcNow.AddMonths(10),
                    QuantityRemaining = 40,
                    Status = BatchStatus.Active
                }
            }
        };
        db.InventoryItems.Add(item);

        var correlationId = Guid.NewGuid();
        var order = new PrescriptionOrder
        {
            Id = Guid.NewGuid(),
            TenantId = PharmacyTestDbHelper.TenantId,
            PharmacyId = PharmacyTestDbHelper.PharmacyKey,
            OrderingTenantId = OrderingTenant,
            OrderingFacilityId = OrderingFacility,
            CorrelationId = correlationId,
            ExternalPrescriptionId = correlationId,
            PrescriptionNumber = "RX-OUTBOX-001",
            PatientId = Guid.NewGuid(),
            PatientName = "Maria Clara",
            Status = PrescriptionStatus.Pending,
            Items = new List<PrescriptionOrderItem>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    InventoryItemId = item.Id,
                    GenericName = "Amoxicillin",
                    Dosage = "500mg",
                    Sig = "Take 1 capsule three times daily",
                    QuantityPrescribed = 21,
                    UnitPrice = 5.00m,
                    Subtotal = 105.00m,
                    Status = ItemDispenseStatus.Pending
                }
            }
        };
        db.PrescriptionOrders.Add(order);
        await db.SaveChangesAsync();

        var handler = new DispensePrescriptionCommandHandler(
            new Repository<PrescriptionOrder>(db, sieve),
            new Repository<PharmacyInventoryItem>(db, sieve),
            new Repository<DispenseAuditRecord>(db, sieve),
            uow,
            publisherFactory.Create(db));

        return new Seeded { DbName = dbName, Db = db, Handler = handler, Order = order, Item = item };
    }

    private static readonly DispensePrescriptionCommand DispenseCommand = new(
        Guid.Empty, "Pharmacist Karen Reyes, RPh", "PRC-PHARM-88912", "OR-2026-0777", "Counseled");

    [Fact]
    public async Task Dispense_QueuesRxDispensedToTheOrderingClinic_InTheSameCommit()
    {
        var seeded = await SeedAsync(new RealPublisherFactory());

        await seeded.Handler.Handle(DispenseCommand with { PrescriptionId = seeded.Order.Id }, CancellationToken.None);

        var outbox = await seeded.Db.InteropOutbox.SingleAsync();
        outbox.Type.Should().Be(InteropTypes.RxDispensed);
        outbox.CorrelationId.Should().Be(seeded.Order.CorrelationId);

        var envelope = InteropEnvelope.FromJson(outbox.EnvelopeJson);
        envelope.From.Should().Be(Party.ForFacility(PharmacyTestDbHelper.TenantId, PharmacyTestDbHelper.PharmacyKey, FacilityType.Pharmacy));
        envelope.To.Should().Be(Party.ForFacility(OrderingTenant, OrderingFacility, FacilityType.Clinic));
        envelope.CorrelationId.Should().Be(seeded.Order.CorrelationId);

        var payload = envelope.GetPayload<PrescriptionDispensedEvent>();
        payload.PrescriptionNumber.Should().Be("RX-OUTBOX-001");
        payload.PrescriptionId.Should().Be(seeded.Order.ExternalPrescriptionId);
        payload.OrderingTenantId.Should().Be(OrderingTenant);
        payload.OrderingFacilityId.Should().Be(OrderingFacility);
        payload.PatientId.Should().Be(seeded.Order.PatientId);
        payload.TotalAmount.Should().Be(105.00m);
        payload.DispensedItems.Should().ContainSingle();
    }

    [Fact]
    public async Task Dispense_WhenQueueingFails_ThrowsAndCommitsNothing()
    {
        var failing = Substitute.For<IPrescriptionDispensedPublisher>();
        failing.When(p => p.Enqueue(Arg.Any<PrescriptionOrder>(), Arg.Any<PrescriptionDispensedEvent>()))
            .Do(_ => throw new InvalidOperationException("outbox unavailable"));
        var seeded = await SeedAsync(new FixedPublisherFactory(failing));

        var act = async () => await seeded.Handler.Handle(DispenseCommand with { PrescriptionId = seeded.Order.Id }, CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>().WithMessage("outbox unavailable");

        using var fresh = PharmacyTestDbHelper.CreateContext(
            seeded.DbName, new TestPharmacyScope(PharmacyTestDbHelper.TenantId, PharmacyTestDbHelper.PharmacyId));
        (await fresh.PrescriptionOrders.SingleAsync()).Status.Should().Be(PrescriptionStatus.Pending);
        (await fresh.InventoryItems.SingleAsync()).CurrentStock.Should().Be(40);
        (await fresh.InventoryBatches.SingleAsync()).QuantityRemaining.Should().Be(40);
        (await fresh.DispenseAuditRecords.CountAsync()).Should().Be(0);
        (await fresh.InteropOutbox.CountAsync()).Should().Be(0);
    }

    [Fact]
    public void Enqueue_ForAnOrderWithoutAnOrderingClinic_Throws()
    {
        var db = PharmacyTestDbHelper.CreateContext($"Pharmacy_NoOrdering_{Guid.NewGuid()}", new TestPharmacyScope(PharmacyTestDbHelper.TenantId, PharmacyTestDbHelper.PharmacyId));
        var publisher = new PrescriptionDispensedPublisher(new InteropPublisher(db), NullLogger<PrescriptionDispensedPublisher>.Instance);
        var order = new PrescriptionOrder
        {
            TenantId = PharmacyTestDbHelper.TenantId,
            PharmacyId = PharmacyTestDbHelper.PharmacyKey,
            PrescriptionNumber = "RX-LEGACY",
            PatientName = "Legacy Patient"
        };

        var act = () => publisher.Enqueue(order, new PrescriptionDispensedEvent());

        act.Should().Throw<InvalidOperationException>().WithMessage("*no ordering clinic*");
        db.InteropOutbox.Local.Should().BeEmpty();
    }

    private interface IPrescriptionDispensedPublisherFactory
    {
        IPrescriptionDispensedPublisher Create(ApplicationDbContext db);
    }

    private sealed class RealPublisherFactory : IPrescriptionDispensedPublisherFactory
    {
        public IPrescriptionDispensedPublisher Create(ApplicationDbContext db) =>
            new PrescriptionDispensedPublisher(new InteropPublisher(db), NullLogger<PrescriptionDispensedPublisher>.Instance);
    }

    private sealed class FixedPublisherFactory : IPrescriptionDispensedPublisherFactory
    {
        private readonly IPrescriptionDispensedPublisher _publisher;
        public FixedPublisherFactory(IPrescriptionDispensedPublisher publisher) => _publisher = publisher;
        public IPrescriptionDispensedPublisher Create(ApplicationDbContext db) => _publisher;
    }
}
