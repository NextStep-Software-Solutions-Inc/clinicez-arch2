using ClinicEz.Pharmacy.Application.Common;
using ClinicEz.Pharmacy.Application.Common.Interfaces;
using ClinicEz.Pharmacy.Application.Interop;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Pharmacy.Infrastructure.Context;
using ClinicEz.Pharmacy.Infrastructure.Persistence;
using ClinicEz.Pharmacy.Infrastructure.Persistence.Repositories;
using ClinicEz.Pharmacy.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Sieve.Services;

namespace ClinicEz.Pharmacy.Application.Tests;

/// <summary><c>billing.invoice.voided</c>: a voided or refunded invoice reopens payment on undispensed orders and is only recorded on dispensed ones.</summary>
public class PharmacyBillingVoidTests
{
    private const string PharmacyTenant = "tenant-pharmacy";
    private static readonly Guid PharmacyGuid = new("aaaaaaaa-0000-0000-0000-000000000001");
    private static readonly DateTime PaidAt = new(2026, 10, 9, 8, 30, 0, DateTimeKind.Utc);
    private static readonly DateTime VoidedAt = new(2026, 10, 9, 9, 15, 0, DateTimeKind.Utc);

    private static Party PharmacyParty => Party.ForFacility(PharmacyTenant, PharmacyGuid.ToString(), FacilityType.Pharmacy);
    private static Party BillingParty => Party.ForFacility(PharmacyTenant, PharmacyGuid.ToString(), FacilityType.Pharmacy, InteropServices.Billing);

    private sealed class Fixture
    {
        public required ApplicationDbContext Db { get; init; }
        public required BillingInvoiceVoidedHandler Handler { get; init; }
    }

    private static async Task<Fixture> CreateFixtureAsync(bool provisioned = true)
    {
        var scope = new TestPharmacyScope(string.Empty, Guid.Empty);
        var db = PharmacyTestDbHelper.CreateContext($"Pharmacy_VoidDb_{Guid.NewGuid()}", scope);
        var sieve = Substitute.For<ISieveProcessor>();
        var uow = new UnitOfWork(db, sieve, Substitute.For<IProductRepository>());

        if (provisioned)
        {
            db.PharmacySettings.Add(new PharmacySettings
            {
                Id = Guid.NewGuid(),
                TenantId = PharmacyTenant,
                PharmacyId = PharmacyGuid,
                PharmacyName = "Rizal Community Pharmacy",
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "test"
            });
            await db.SaveChangesAsync();
        }

        return new Fixture
        {
            Db = db,
            Handler = new BillingInvoiceVoidedHandler(
                new Repository<PrescriptionOrder>(db, sieve),
                new Repository<PharmacySettings>(db, sieve),
                new PharmacyBillingPublisher(new InteropPublisher(db), NullLogger<PharmacyBillingPublisher>.Instance),
                uow,
                scope,
                NullLogger<BillingInvoiceVoidedHandler>.Instance)
        };
    }

    private static async Task<PrescriptionOrder> SeedAsync(
        Fixture f,
        PrescriptionStatus status = PrescriptionStatus.Accepted,
        PharmacyPaymentPolicy policy = PharmacyPaymentPolicy.Prepaid,
        PrescriptionPaymentStatus payment = PrescriptionPaymentStatus.Paid)
    {
        var order = new PrescriptionOrder
        {
            Id = Guid.NewGuid(),
            TenantId = PharmacyTenant,
            PharmacyId = PharmacyGuid.ToString(),
            PharmacyName = "Rizal Community Pharmacy",
            PrescriptionNumber = "RX-VOID-001",
            PatientName = "Juan Dela Cruz",
            Status = status,
            PaymentPolicy = policy,
            PaymentStatus = payment,
            QuotedAmount = 255m,
            PaidAmount = payment == PrescriptionPaymentStatus.Paid ? 255m : null,
            PaidAt = payment == PrescriptionPaymentStatus.Paid ? PaidAt : null,
            PaymentReceiptNumber = payment == PrescriptionPaymentStatus.Paid ? "OR-0001" : null,
            Items =
            {
                new PrescriptionOrderItem { GenericName = "Amlodipine", Dosage = "5mg", Sig = "OD", QuantityPrescribed = 30, UnitPrice = 8.5m, Status = ItemDispenseStatus.Pending },
                new PrescriptionOrderItem { GenericName = "Aspirin", Dosage = "80mg", Sig = "OD", QuantityPrescribed = 10, UnitPrice = 3m, Status = ItemDispenseStatus.Rejected }
            }
        };
        f.Db.PrescriptionOrders.Add(order);
        await f.Db.SaveChangesAsync();
        return order;
    }

    private static async Task<List<InteropEnvelope>> InvoiceRequestsAsync(ApplicationDbContext db) =>
        (await db.InteropOutbox.AsNoTracking().Where(m => m.Type == InteropTypes.BillingInvoiceRequested).ToListAsync())
        .Select(m => InteropEnvelope.FromJson(m.EnvelopeJson))
        .ToList();

    private static BillingInvoiceVoidedPayload Voided(
        Guid orderId,
        BillingCorrectionKind kind = BillingCorrectionKind.Refund,
        DateTime? at = null,
        string sourceType = "Prescription") => new()
    {
        TenantId = PharmacyTenant,
        FacilityId = PharmacyGuid.ToString(),
        FacilityType = FacilityType.Pharmacy,
        InvoiceId = Guid.NewGuid(),
        InvoiceRequestId = orderId,
        SourceType = sourceType,
        SourceId = orderId,
        Kind = kind,
        Total = 255m,
        AmountReversed = kind == BillingCorrectionKind.Refund ? 255m : 0m,
        WasFullyPaid = kind == BillingCorrectionKind.Refund,
        CorrectedAtUtc = at ?? VoidedAt
    };

    private static Task VoidAsync(Fixture f, BillingInvoiceVoidedPayload payload, Party? from = null, Party? to = null) =>
        f.Handler.HandleAsync(
            payload,
            new InteropMessageContext(InteropEnvelope.Create(
                InteropTypes.BillingInvoiceVoided, from ?? BillingParty, to ?? PharmacyParty, Guid.NewGuid(), new object())),
            CancellationToken.None);

    private static Task<PrescriptionOrder> ReadAsync(Fixture f) =>
        f.Db.PrescriptionOrders.IgnoreQueryFilters().AsNoTracking().SingleAsync();

    [Fact]
    public async Task Refund_OfAnUndispensedPrepaidOrder_ReopensPayment_AndBlocksDispensing()
    {
        var f = await CreateFixtureAsync();
        var order = await SeedAsync(f);
        PrescriptionDispenseGate.BlockedReason(order).Should().BeNull("it was paid");

        await VoidAsync(f, Voided(order.Id));

        var saved = await ReadAsync(f);
        saved.PaymentStatus.Should().Be(PrescriptionPaymentStatus.AwaitingPayment);
        saved.PaidAmount.Should().BeNull();
        saved.PaidAt.Should().BeNull();
        saved.PaymentReceiptNumber.Should().BeNull();
        saved.PaymentCorrectedAt.Should().Be(VoidedAt);
        saved.PaymentReversedAmount.Should().Be(255m);
        saved.Status.Should().Be(PrescriptionStatus.Accepted);
        PrescriptionDispenseGate.BlockedReason(saved).Should().Be(PharmacyErrorCodes.PaymentRequired);
    }

    [Fact]
    public async Task Correction_OfAnUndispensedOrder_ReRequestsTheInvoice_WithTheSameRequestId_AndAcceptedItemsOnly()
    {
        var f = await CreateFixtureAsync();
        var order = await SeedAsync(f);

        await VoidAsync(f, Voided(order.Id));

        var envelope = (await InvoiceRequestsAsync(f.Db)).Should().ContainSingle().Subject;
        envelope.From.Should().Be(PharmacyParty);
        envelope.To.Should().Be(BillingParty);
        envelope.CorrelationId.Should().Be(order.Id);
        var request = envelope.GetPayload<BillingInvoiceRequestedPayload>();
        request.InvoiceRequestId.Should().Be(order.Id);
        request.SourceType.Should().Be("Prescription");
        request.SourceId.Should().Be(order.Id);
        request.Lines.Should().ContainSingle().Which.Should().BeEquivalentTo(new
        {
            Description = "Amlodipine 5mg Tablet",
            Quantity = 30,
            UnitPrice = 8.5m
        });
    }

    [Fact]
    public async Task Void_OfAnUnpaidInvoice_KeepsTheOrderAwaitingPayment_AndRecordsTheCorrection()
    {
        var f = await CreateFixtureAsync();
        var order = await SeedAsync(f, payment: PrescriptionPaymentStatus.AwaitingPayment);

        await VoidAsync(f, Voided(order.Id, BillingCorrectionKind.Void));

        var saved = await ReadAsync(f);
        saved.PaymentStatus.Should().Be(PrescriptionPaymentStatus.AwaitingPayment);
        saved.PaymentCorrectedAt.Should().Be(VoidedAt);
        saved.PaymentReversedAmount.Should().Be(0m);
        PrescriptionDispenseGate.BlockedReason(saved).Should().Be(PharmacyErrorCodes.PaymentRequired);
        (await InvoiceRequestsAsync(f.Db)).Should().ContainSingle();
    }

    [Theory]
    [InlineData(BillingCorrectionKind.Refund, PrescriptionPaymentStatus.Refunded)]
    [InlineData(BillingCorrectionKind.Void, PrescriptionPaymentStatus.Voided)]
    public async Task Correction_OfADispensedOrder_IsOnlyRecorded(BillingCorrectionKind kind, PrescriptionPaymentStatus expected)
    {
        var f = await CreateFixtureAsync();
        var order = await SeedAsync(f, status: PrescriptionStatus.Dispensed);

        await VoidAsync(f, Voided(order.Id, kind));

        var saved = await ReadAsync(f);
        saved.Status.Should().Be(PrescriptionStatus.Dispensed);
        saved.PaymentStatus.Should().Be(expected);
        saved.PaidAmount.Should().Be(255m, "the original payment stays on record");
        saved.PaymentCorrectedAt.Should().Be(VoidedAt);
        PrescriptionDispenseGate.BlockedReason(saved).Should().BeNull();
        (await InvoiceRequestsAsync(f.Db)).Should().BeEmpty("nothing is reopened for a dispensed order");
    }

    [Fact]
    public async Task Correction_OnAPostpaidOrder_ReturnsItToAwaitingPayment_WithoutBlockingDispense()
    {
        var f = await CreateFixtureAsync();
        var order = await SeedAsync(f, policy: PharmacyPaymentPolicy.Postpaid);

        await VoidAsync(f, Voided(order.Id));

        var saved = await ReadAsync(f);
        saved.PaymentStatus.Should().Be(PrescriptionPaymentStatus.AwaitingPayment);
        PrescriptionDispenseGate.BlockedReason(saved).Should().BeNull();
        (await InvoiceRequestsAsync(f.Db)).Should().ContainSingle();
    }

    [Theory]
    [InlineData(PrescriptionStatus.Accepted)]
    [InlineData(PrescriptionStatus.Dispensed)]
    public async Task PartialRefund_KeepsTheOrderPaid_RecordsTheCumulativeTotal_AndReopensNothing(PrescriptionStatus status)
    {
        var f = await CreateFixtureAsync();
        var order = await SeedAsync(f, status: status);

        await VoidAsync(f, Voided(order.Id) with { IsPartial = true, AmountReversed = 50m, RefundedTotal = 50m });

        var saved = await ReadAsync(f);
        saved.PaymentStatus.Should().Be(PrescriptionPaymentStatus.Paid);
        saved.PaidAmount.Should().Be(255m);
        saved.PaidAt.Should().Be(PaidAt);
        saved.PaymentReceiptNumber.Should().Be("OR-0001");
        saved.PaymentCorrectedAt.Should().Be(VoidedAt);
        saved.PaymentReversedAmount.Should().Be(50m);
        saved.Status.Should().Be(status);
        PrescriptionDispenseGate.BlockedReason(saved).Should().BeNull("a partial refund does not unpay the order");
        (await InvoiceRequestsAsync(f.Db)).Should().BeEmpty("the invoice stays settled, so nothing is re-requested");
    }

    [Fact]
    public async Task PartialRefund_Redelivered_OrFollowedByAnotherOne_RecordsTheLatestCumulativeTotal_Once()
    {
        var f = await CreateFixtureAsync();
        var order = await SeedAsync(f);
        var first = Voided(order.Id) with { IsPartial = true, AmountReversed = 50m, RefundedTotal = 50m };

        await VoidAsync(f, first);
        var afterFirst = await ReadAsync(f);
        await VoidAsync(f, first);
        (await ReadAsync(f)).UpdatedAt.Should().Be(afterFirst.UpdatedAt, "the same correction applied twice changes nothing");

        await VoidAsync(f, first with { AmountReversed = 30m, RefundedTotal = 80m, CorrectedAtUtc = VoidedAt.AddMinutes(10) });

        var saved = await ReadAsync(f);
        saved.PaymentStatus.Should().Be(PrescriptionPaymentStatus.Paid);
        saved.PaymentReversedAmount.Should().Be(80m);
        saved.PaymentCorrectedAt.Should().Be(VoidedAt.AddMinutes(10));
    }

    [Fact]
    public async Task Correction_Redelivered_OrOlderThanTheRecordedOne_ChangesNothing()
    {
        var f = await CreateFixtureAsync();
        var order = await SeedAsync(f);
        await VoidAsync(f, Voided(order.Id));
        var first = await ReadAsync(f);

        await VoidAsync(f, Voided(order.Id));
        await VoidAsync(f, Voided(order.Id, at: VoidedAt.AddMinutes(-5)));

        (await ReadAsync(f)).UpdatedAt.Should().Be(first.UpdatedAt);
        (await InvoiceRequestsAsync(f.Db)).Should().ContainSingle("a repeated correction must not re-request the invoice again");
    }

    [Fact]
    public async Task Correction_ThatPredatesALaterPayment_IsIgnored()
    {
        var f = await CreateFixtureAsync();
        var order = await SeedAsync(f);

        await VoidAsync(f, Voided(order.Id, at: PaidAt.AddMinutes(-10)));

        var saved = await ReadAsync(f);
        saved.PaymentStatus.Should().Be(PrescriptionPaymentStatus.Paid);
        saved.PaymentCorrectedAt.Should().BeNull();
        (await InvoiceRequestsAsync(f.Db)).Should().BeEmpty();
    }

    [Fact]
    public async Task Correction_ForOrdersWithNoLiveInvoice_IsIgnored()
    {
        var f = await CreateFixtureAsync();
        var notRequired = await SeedAsync(f, policy: PharmacyPaymentPolicy.None, payment: PrescriptionPaymentStatus.NotRequired);

        await VoidAsync(f, Voided(notRequired.Id));

        var saved = await ReadAsync(f);
        saved.PaymentStatus.Should().Be(PrescriptionPaymentStatus.NotRequired);
        saved.PaymentCorrectedAt.Should().BeNull();
        (await InvoiceRequestsAsync(f.Db)).Should().BeEmpty();
    }

    [Fact]
    public async Task Correction_IsIgnored_ForAnythingButThisPharmacysBillingService()
    {
        var f = await CreateFixtureAsync();
        var order = await SeedAsync(f);
        var otherFacilityBilling = Party.ForFacility(PharmacyTenant, Guid.NewGuid().ToString(), FacilityType.Pharmacy, InteropServices.Billing);
        var otherTenantBilling = Party.ForFacility("tenant-other", PharmacyGuid.ToString(), FacilityType.Pharmacy, InteropServices.Billing);
        var clinic = Party.ForFacility("tenant-clinic", Guid.NewGuid().ToString(), FacilityType.Clinic);

        await VoidAsync(f, Voided(order.Id), from: PharmacyParty);
        await VoidAsync(f, Voided(order.Id), from: clinic);
        await VoidAsync(f, Voided(order.Id), from: Party.Portal);
        await VoidAsync(f, Voided(order.Id), from: otherFacilityBilling);
        await VoidAsync(f, Voided(order.Id), from: otherTenantBilling);
        await VoidAsync(f, Voided(order.Id), to: Party.Portal);
        await VoidAsync(f, Voided(order.Id), to: clinic);
        await VoidAsync(f, Voided(order.Id, sourceType: "LabOrder"));
        await VoidAsync(f, Voided(order.Id) with { InvoiceRequestId = null });

        var saved = await ReadAsync(f);
        saved.PaymentStatus.Should().Be(PrescriptionPaymentStatus.Paid);
        saved.PaymentCorrectedAt.Should().BeNull();
        (await InvoiceRequestsAsync(f.Db)).Should().BeEmpty();
    }

    [Fact]
    public async Task Correction_ForAnUnknownOrder_OrAnUnprovisionedPharmacy_IsIgnored()
    {
        var unprovisioned = await CreateFixtureAsync(provisioned: false);
        await VoidAsync(unprovisioned, Voided(Guid.NewGuid()));

        var f = await CreateFixtureAsync();
        await VoidAsync(f, Voided(Guid.NewGuid()));

        (await f.Db.PrescriptionOrders.IgnoreQueryFilters().AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task Dispatcher_RoutesTheCorrection_ToTheHandler_AndAbsorbsRedelivery()
    {
        var dbName = $"Pharmacy_VoidE2E_{Guid.NewGuid()}";
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Messaging:Transport"] = "InProcess",
            ["Messaging:Service"] = InteropServices.Pharmacy,
            ["Messaging:Enabled"] = "false",
            ["DbSchema"] = "public"
        }).Build();

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(config);
        services.AddHttpContextAccessor();
        services.AddScoped<PharmacyContext>();
        services.AddScoped<IPharmacyContext>(sp => sp.GetRequiredService<PharmacyContext>());
        services.AddScoped<IPharmacyScopeSetter>(sp => sp.GetRequiredService<PharmacyContext>());
        services.AddDbContext<ApplicationDbContext>(o => o.UseInMemoryDatabase(dbName));
        services.AddSingleton(Substitute.For<ISieveProcessor>());
        services.AddScoped(_ => Substitute.For<IProductRepository>());
        services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddScoped<IPharmacyBillingPublisher, PharmacyBillingPublisher>();
        services.AddInterop<ApplicationDbContext>(config, h => h
            .Handle<BillingInvoiceVoidedPayload, BillingInvoiceVoidedHandler>(InteropTypes.BillingInvoiceVoided));
        await using var provider = services.BuildServiceProvider();

        var orderId = Guid.NewGuid();
        using (var seedScope = provider.CreateScope())
        {
            var seedDb = seedScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            seedDb.PharmacySettings.Add(new PharmacySettings
            {
                Id = Guid.NewGuid(),
                TenantId = PharmacyTenant,
                PharmacyId = PharmacyGuid,
                PharmacyName = "Rizal Community Pharmacy",
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "test"
            });
            seedDb.PrescriptionOrders.Add(new PrescriptionOrder
            {
                Id = orderId,
                TenantId = PharmacyTenant,
                PharmacyId = PharmacyGuid.ToString(),
                PharmacyName = "Rizal Community Pharmacy",
                PrescriptionNumber = "RX-E2E-VOID",
                PatientName = "Juan Dela Cruz",
                Status = PrescriptionStatus.Accepted,
                PaymentPolicy = PharmacyPaymentPolicy.Prepaid,
                PaymentStatus = PrescriptionPaymentStatus.Paid,
                PaidAmount = 255m,
                PaidAt = PaidAt
            });
            await seedDb.SaveChangesAsync();
        }

        var dispatcher = provider.GetRequiredService<InteropDispatcher>();
        var envelope = InteropEnvelope.Create(InteropTypes.BillingInvoiceVoided, BillingParty, PharmacyParty, orderId, Voided(orderId));
        (await dispatcher.DispatchAsync(envelope, CancellationToken.None)).Outcome.Should().Be(DispatchOutcome.Handled);
        (await dispatcher.DispatchAsync(envelope, CancellationToken.None)).Outcome.Should().Be(DispatchOutcome.Duplicate);

        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        (await db.PrescriptionOrders.IgnoreQueryFilters().SingleAsync()).PaymentStatus.Should().Be(PrescriptionPaymentStatus.AwaitingPayment);
        (await InvoiceRequestsAsync(db)).Should().ContainSingle().Which.CorrelationId.Should().Be(orderId);
    }
}
