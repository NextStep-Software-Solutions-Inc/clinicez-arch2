using ClinicEz.Pharmacy.Application.Common;
using ClinicEz.Pharmacy.Application.Common.Interfaces;
using ClinicEz.Pharmacy.Application.Features.Prescriptions.Commands;
using ClinicEz.Pharmacy.Application.Features.Settings;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Pharmacy.Infrastructure.Persistence;
using ClinicEz.Pharmacy.Infrastructure.Persistence.Repositories;
using ClinicEz.Pharmacy.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Sieve.Services;

namespace ClinicEz.Pharmacy.Application.Tests;

public class PharmacyReviewAndPaymentGateTests
{
    private const string OrderingTenant = "tenant-clinic";
    private const string OrderingFacility = "cccccccc-0000-0000-0000-000000000001";
    private const string PharmacyName = "Rizal Community Pharmacy";

    private static Party PharmacyParty => Party.ForFacility(PharmacyTestDbHelper.TenantId, PharmacyTestDbHelper.PharmacyKey, FacilityType.Pharmacy);
    private static Party BillingParty => Party.ForFacility(PharmacyTestDbHelper.TenantId, PharmacyTestDbHelper.PharmacyKey, FacilityType.Pharmacy, InteropServices.Billing);
    private static Party ClinicParty => Party.ForFacility(OrderingTenant, OrderingFacility, FacilityType.Clinic);

    private sealed class World
    {
        public required string DbName { get; init; }
        public required ApplicationDbContext Db { get; init; }
        public required PrescriptionReviewCommandHandler Review { get; init; }
        public required DispensePrescriptionCommandHandler Dispense { get; init; }
        public required PrescriptionOrder Order { get; init; }
        public required PharmacyInventoryItem Amoxicillin { get; init; }
        public required PharmacyInventoryItem Paracetamol { get; init; }

        public Guid AmoxicillinLine => Order.Items.Single(i => i.GenericName == "Amoxicillin").Id;
        public Guid ParacetamolLine => Order.Items.Single(i => i.GenericName == "Paracetamol").Id;
    }

    private static PharmacyInventoryItem Stock(string name, decimal price) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = PharmacyTestDbHelper.TenantId,
        PharmacyId = PharmacyTestDbHelper.PharmacyKey,
        Sku = $"SKU-{name}",
        GenericName = name,
        DosageForm = "Capsule",
        Strength = "500mg",
        CurrentStock = 100,
        UnitPrice = price,
        Batches = new List<InventoryBatch>
        {
            new()
            {
                Id = Guid.NewGuid(),
                TenantId = PharmacyTestDbHelper.TenantId,
                PharmacyId = PharmacyTestDbHelper.PharmacyKey,
                BatchNumber = $"B-{name}",
                ExpiryDate = DateTime.UtcNow.AddMonths(10),
                QuantityRemaining = 100,
                Status = BatchStatus.Active
            }
        }
    };

    private static async Task<World> CreateWorldAsync(
        PharmacyPaymentPolicy policy = PharmacyPaymentPolicy.Prepaid,
        PrescriptionStatus status = PrescriptionStatus.Pending,
        PrescriptionPaymentStatus paymentStatus = PrescriptionPaymentStatus.NotRequired,
        Guid? patientId = null,
        IRxStatusPublisher? statusPublisher = null)
    {
        var dbName = $"Pharmacy_ReviewDb_{Guid.NewGuid()}";
        var scope = new TestPharmacyScope(PharmacyTestDbHelper.TenantId, PharmacyTestDbHelper.PharmacyId);
        var db = PharmacyTestDbHelper.CreateContext(dbName, scope);
        var sieve = Substitute.For<ISieveProcessor>();
        var uow = new UnitOfWork(db, sieve, Substitute.For<IProductRepository>());
        var interop = new InteropPublisher(db);

        var amoxicillin = Stock("Amoxicillin", 5.00m);
        var paracetamol = Stock("Paracetamol", 2.00m);
        db.InventoryItems.AddRange(amoxicillin, paracetamol);

        var correlationId = Guid.NewGuid();
        var order = new PrescriptionOrder
        {
            Id = Guid.NewGuid(),
            TenantId = PharmacyTestDbHelper.TenantId,
            PharmacyId = PharmacyTestDbHelper.PharmacyKey,
            PharmacyName = PharmacyName,
            OrderingTenantId = OrderingTenant,
            OrderingFacilityId = OrderingFacility,
            CorrelationId = correlationId,
            ExternalPrescriptionId = correlationId,
            PrescriptionNumber = "RX-REVIEW-001",
            VisitKey = "visit-77",
            PatientId = patientId ?? Guid.NewGuid(),
            PatientName = "Maria Clara",
            Status = status,
            PaymentPolicy = policy,
            PaymentStatus = paymentStatus,
            Items = new List<PrescriptionOrderItem>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    GenericName = "Amoxicillin",
                    Dosage = "500mg",
                    Sig = "Take 1 capsule three times daily",
                    QuantityPrescribed = 21,
                    Status = ItemDispenseStatus.Pending
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    GenericName = "Paracetamol",
                    Dosage = "500mg",
                    Sig = "Take 1 tablet as needed",
                    QuantityPrescribed = 10,
                    Status = ItemDispenseStatus.Pending
                }
            }
        };
        db.PrescriptionOrders.Add(order);
        await db.SaveChangesAsync();

        var review = new PrescriptionReviewCommandHandler(
            new Repository<PrescriptionOrder>(db, sieve),
            new Repository<PharmacyInventoryItem>(db, sieve),
            uow,
            statusPublisher ?? new RxStatusPublisher(interop, NullLogger<RxStatusPublisher>.Instance),
            new PharmacyBillingPublisher(interop, NullLogger<PharmacyBillingPublisher>.Instance),
            scope);

        var dispense = new DispensePrescriptionCommandHandler(
            new Repository<PrescriptionOrder>(db, sieve),
            new Repository<PharmacyInventoryItem>(db, sieve),
            new Repository<DispenseAuditRecord>(db, sieve),
            uow,
            new PrescriptionDispensedPublisher(interop, NullLogger<PrescriptionDispensedPublisher>.Instance));

        return new World
        {
            DbName = dbName,
            Db = db,
            Review = review,
            Dispense = dispense,
            Order = order,
            Amoxicillin = amoxicillin,
            Paracetamol = paracetamol
        };
    }

    private static async Task<List<InteropEnvelope>> OutboxAsync(ApplicationDbContext db, string type) =>
        (await db.InteropOutbox.Where(m => m.Type == type).ToListAsync())
        .Select(m => InteropEnvelope.FromJson(m.EnvelopeJson))
        .ToList();

    private static DispensePrescriptionCommand DispenseOf(Guid orderId) =>
        new(orderId, "Pharmacist Karen Reyes, RPh", "PRC-PHARM-88912", "OR-2026-0777", "Counseled");

    // ── accept ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Accept_QuotesFromInventoryPrices_AndQueuesStatusToClinicAndPatient_InTheSameCommit()
    {
        var w = await CreateWorldAsync(PharmacyPaymentPolicy.None);

        var dto = await w.Review.Handle(new AcceptPrescriptionCommand(w.Order.Id), CancellationToken.None);

        dto.Status.Should().Be(nameof(PrescriptionStatus.Accepted));
        dto.QuotedAmount.Should().Be(125.00m, "21 x 5.00 + 10 x 2.00");
        var order = await w.Db.PrescriptionOrders.Include(o => o.Items).SingleAsync();
        order.Status.Should().Be(PrescriptionStatus.Accepted);
        order.TotalAmount.Should().Be(125.00m);
        order.ReviewedAt.Should().NotBeNull();
        order.Items.Select(i => i.UnitPrice).Should().BeEquivalentTo(new[] { 5.00m, 2.00m });

        var statuses = await OutboxAsync(w.Db, InteropTypes.RxStatusChanged);
        statuses.Should().HaveCount(2);
        statuses.Select(e => e.To).Should().BeEquivalentTo(new[] { ClinicParty, Party.ForPatient(w.Order.PatientId.ToString()) });
        statuses.Should().OnlyContain(e => e.From == PharmacyParty && e.CorrelationId == w.Order.CorrelationId);
        var payload = statuses[0].GetPayload<RxStatusChangedPayload>();
        payload.Stage.Should().Be(RxStage.Accepted);
        payload.QuotedAmount.Should().Be(125.00m);
        payload.PrescriptionId.Should().Be(w.Order.ExternalPrescriptionId);
        payload.PharmacyName.Should().Be(PharmacyName);
        payload.Reason.Should().BeNull();
    }

    [Fact]
    public async Task Accept_WithoutAKnownPatient_QueuesStatusToTheClinicOnly()
    {
        var w = await CreateWorldAsync(PharmacyPaymentPolicy.None, patientId: Guid.Empty);

        await w.Review.Handle(new AcceptPrescriptionCommand(w.Order.Id), CancellationToken.None);

        var statuses = await OutboxAsync(w.Db, InteropTypes.RxStatusChanged);
        statuses.Should().ContainSingle().Which.To.Should().Be(ClinicParty);
        statuses[0].GetPayload<RxStatusChangedPayload>().PatientId.Should().BeNull();
    }

    [Theory]
    [InlineData(PharmacyPaymentPolicy.Prepaid)]
    [InlineData(PharmacyPaymentPolicy.Postpaid)]
    public async Task Accept_UnderAPaymentPolicy_RequestsAnInvoiceFromTheBillingMailbox(PharmacyPaymentPolicy policy)
    {
        var w = await CreateWorldAsync(policy);

        var dto = await w.Review.Handle(new AcceptPrescriptionCommand(w.Order.Id), CancellationToken.None);

        dto.PaymentStatus.Should().Be(nameof(PrescriptionPaymentStatus.AwaitingPayment));
        var invoices = await OutboxAsync(w.Db, InteropTypes.BillingInvoiceRequested);
        var invoice = invoices.Should().ContainSingle().Subject;
        invoice.From.Should().Be(PharmacyParty);
        invoice.To.Should().Be(BillingParty);
        invoice.CorrelationId.Should().Be(w.Order.Id);
        var payload = invoice.GetPayload<BillingInvoiceRequestedPayload>();
        payload.InvoiceRequestId.Should().Be(w.Order.Id);
        payload.SourceId.Should().Be(w.Order.Id);
        payload.SourceType.Should().Be("Prescription");
        payload.VisitKey.Should().Be("visit-77");
        payload.FacilityType.Should().Be(FacilityType.Pharmacy);
        payload.PatientId.Should().Be(w.Order.PatientId);
        payload.Lines.Should().HaveCount(2);
        payload.Lines.Sum(l => l.Quantity * l.UnitPrice).Should().Be(125.00m);
    }

    [Fact]
    public async Task Accept_UnderPolicyNone_RequestsNoInvoice_AndNoPaymentIsRequired()
    {
        var w = await CreateWorldAsync(PharmacyPaymentPolicy.None);

        var dto = await w.Review.Handle(new AcceptPrescriptionCommand(w.Order.Id), CancellationToken.None);

        dto.PaymentStatus.Should().Be(nameof(PrescriptionPaymentStatus.NotRequired));
        (await OutboxAsync(w.Db, InteropTypes.BillingInvoiceRequested)).Should().BeEmpty();
    }

    [Fact]
    public async Task Accept_Twice_IsIdempotent_AndQueuesNothingExtra()
    {
        var w = await CreateWorldAsync();

        await w.Review.Handle(new AcceptPrescriptionCommand(w.Order.Id), CancellationToken.None);
        var outboxAfterFirst = await w.Db.InteropOutbox.CountAsync();
        var second = await w.Review.Handle(new AcceptPrescriptionCommand(w.Order.Id), CancellationToken.None);

        second.Status.Should().Be(nameof(PrescriptionStatus.Accepted));
        (await w.Db.InteropOutbox.CountAsync()).Should().Be(outboxAfterFirst);
        outboxAfterFirst.Should().Be(3, "two status messages and one invoice request");
    }

    [Fact]
    public async Task Review_WhenQueueingFails_ThrowsAndCommitsNothing()
    {
        var failing = Substitute.For<IRxStatusPublisher>();
        failing.When(p => p.EnqueueStatusChanged(Arg.Any<PrescriptionOrder>(), Arg.Any<RxStage>(), Arg.Any<string?>()))
            .Do(_ => throw new InvalidOperationException("outbox unavailable"));
        var w = await CreateWorldAsync(statusPublisher: failing);

        var act = async () => await w.Review.Handle(new AcceptPrescriptionCommand(w.Order.Id), CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>().WithMessage("outbox unavailable");
        using var fresh = PharmacyTestDbHelper.CreateContext(
            w.DbName, new TestPharmacyScope(PharmacyTestDbHelper.TenantId, PharmacyTestDbHelper.PharmacyId));
        var order = await fresh.PrescriptionOrders.SingleAsync();
        order.Status.Should().Be(PrescriptionStatus.Pending);
        order.QuotedAmount.Should().BeNull();
        (await fresh.InteropOutbox.CountAsync()).Should().Be(0);
    }

    // ── partial accept ──────────────────────────────────────────────────────────────────

    [Fact]
    public async Task PartialAccept_RejectsUnselectedItems_QuotesOnlyTheAcceptedOnes_AndCarriesTheReason()
    {
        var w = await CreateWorldAsync();

        var dto = await w.Review.Handle(
            new PartiallyAcceptPrescriptionCommand(w.Order.Id, new[] { w.AmoxicillinLine }, "  Paracetamol is out of stock  "),
            CancellationToken.None);

        dto.Status.Should().Be(nameof(PrescriptionStatus.PartiallyAccepted));
        dto.StatusReason.Should().Be("Paracetamol is out of stock");
        dto.QuotedAmount.Should().Be(105.00m);
        var order = await w.Db.PrescriptionOrders.Include(o => o.Items).SingleAsync();
        order.Items.Single(i => i.Id == w.ParacetamolLine).Status.Should().Be(ItemDispenseStatus.Rejected);
        order.Items.Single(i => i.Id == w.AmoxicillinLine).Status.Should().Be(ItemDispenseStatus.Pending);

        var statuses = await OutboxAsync(w.Db, InteropTypes.RxStatusChanged);
        statuses.Should().HaveCount(2);
        var payload = statuses[0].GetPayload<RxStatusChangedPayload>();
        payload.Stage.Should().Be(RxStage.PartiallyAccepted);
        payload.Reason.Should().Be("Paracetamol is out of stock");
        payload.QuotedAmount.Should().Be(105.00m);

        var invoice = (await OutboxAsync(w.Db, InteropTypes.BillingInvoiceRequested)).Should().ContainSingle().Subject;
        invoice.GetPayload<BillingInvoiceRequestedPayload>().Lines.Should().ContainSingle("the rejected item is not billed");
    }

    [Fact]
    public async Task PartialAccept_WithInvalidSelections_IsABadRequest_AndLeavesTheOrderPending()
    {
        var w = await CreateWorldAsync();

        var all = async () => await w.Review.Handle(
            new PartiallyAcceptPrescriptionCommand(w.Order.Id, new[] { w.AmoxicillinLine, w.ParacetamolLine }, "why"), CancellationToken.None);
        var foreign = async () => await w.Review.Handle(
            new PartiallyAcceptPrescriptionCommand(w.Order.Id, new[] { Guid.NewGuid() }, "why"), CancellationToken.None);

        await all.Should().ThrowAsync<BadRequestException>();
        await foreign.Should().ThrowAsync<BadRequestException>();
        (await w.Db.PrescriptionOrders.SingleAsync()).Status.Should().Be(PrescriptionStatus.Pending);
        (await w.Db.InteropOutbox.CountAsync()).Should().Be(0);
    }

    [Fact]
    public void PartialAccept_AndReject_Validators_RequireAReason_AndPartialRequiresAnItem()
    {
        var partial = new PartiallyAcceptPrescriptionCommandValidator();
        var reject = new RejectPrescriptionCommandValidator();

        partial.Validate(new PartiallyAcceptPrescriptionCommand(Guid.NewGuid(), new[] { Guid.NewGuid() }, " ")).IsValid.Should().BeFalse();
        partial.Validate(new PartiallyAcceptPrescriptionCommand(Guid.NewGuid(), Array.Empty<Guid>(), "reason")).IsValid.Should().BeFalse();
        partial.Validate(new PartiallyAcceptPrescriptionCommand(Guid.NewGuid(), new[] { Guid.NewGuid() }, "reason")).IsValid.Should().BeTrue();
        reject.Validate(new RejectPrescriptionCommand(Guid.NewGuid(), "")).IsValid.Should().BeFalse();
        reject.Validate(new RejectPrescriptionCommand(Guid.NewGuid(), "reason")).IsValid.Should().BeTrue();
    }

    // ── reject ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Reject_MarksEverythingRejected_QueuesStatus_AndRequestsNoInvoice()
    {
        var w = await CreateWorldAsync();

        var dto = await w.Review.Handle(new RejectPrescriptionCommand(w.Order.Id, "Controlled drug we do not stock"), CancellationToken.None);

        dto.Status.Should().Be(nameof(PrescriptionStatus.Rejected));
        dto.StatusReason.Should().Be("Controlled drug we do not stock");
        var order = await w.Db.PrescriptionOrders.Include(o => o.Items).SingleAsync();
        order.Items.Should().OnlyContain(i => i.Status == ItemDispenseStatus.Rejected);
        order.PaymentStatus.Should().Be(PrescriptionPaymentStatus.NotRequired);

        var statuses = await OutboxAsync(w.Db, InteropTypes.RxStatusChanged);
        statuses.Should().HaveCount(2);
        statuses[0].GetPayload<RxStatusChangedPayload>().Stage.Should().Be(RxStage.Rejected);
        statuses[0].GetPayload<RxStatusChangedPayload>().Reason.Should().Be("Controlled drug we do not stock");
        (await OutboxAsync(w.Db, InteropTypes.BillingInvoiceRequested)).Should().BeEmpty();
    }

    [Fact]
    public async Task Reject_Twice_IsIdempotent()
    {
        var w = await CreateWorldAsync();

        await w.Review.Handle(new RejectPrescriptionCommand(w.Order.Id, "No stock"), CancellationToken.None);
        await w.Review.Handle(new RejectPrescriptionCommand(w.Order.Id, "No stock"), CancellationToken.None);

        (await w.Db.InteropOutbox.CountAsync()).Should().Be(2);
    }

    [Fact]
    public async Task ADifferentDecisionOnAnAlreadyReviewedOrder_IsAnInvalidStateConflict()
    {
        var w = await CreateWorldAsync();
        await w.Review.Handle(new AcceptPrescriptionCommand(w.Order.Id), CancellationToken.None);

        var reject = async () => await w.Review.Handle(new RejectPrescriptionCommand(w.Order.Id, "changed my mind"), CancellationToken.None);
        var partial = async () => await w.Review.Handle(
            new PartiallyAcceptPrescriptionCommand(w.Order.Id, new[] { w.AmoxicillinLine }, "changed my mind"), CancellationToken.None);

        (await reject.Should().ThrowAsync<PharmacyConflictException>()).Which.Code.Should().Be(PharmacyErrorCodes.InvalidState);
        (await partial.Should().ThrowAsync<PharmacyConflictException>()).Which.Code.Should().Be(PharmacyErrorCodes.InvalidState);
    }

    [Fact]
    public async Task Review_OfAnUnknownOrder_IsNotFound()
    {
        var w = await CreateWorldAsync();

        var act = async () => await w.Review.Handle(new AcceptPrescriptionCommand(Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    // ── dispense gate ───────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Dispense_OfAPendingPrepaidOrder_RequiresAcceptance_AndChangesNothing()
    {
        var w = await CreateWorldAsync();

        var act = async () => await w.Dispense.Handle(DispenseOf(w.Order.Id), CancellationToken.None);

        (await act.Should().ThrowAsync<PharmacyConflictException>()).Which.Code.Should().Be(PharmacyErrorCodes.AcceptanceRequired);
        (await w.Db.InteropOutbox.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Dispense_OfAnAcceptedPrepaidOrder_IsBlockedUntilPaid_ThenSucceeds()
    {
        var w = await CreateWorldAsync();
        await w.Review.Handle(new AcceptPrescriptionCommand(w.Order.Id), CancellationToken.None);

        var blocked = async () => await w.Dispense.Handle(DispenseOf(w.Order.Id), CancellationToken.None);

        (await blocked.Should().ThrowAsync<PharmacyConflictException>()).Which.Code.Should().Be(PharmacyErrorCodes.PaymentRequired);
        (await w.Db.InventoryItems.SingleAsync(i => i.Id == w.Amoxicillin.Id)).CurrentStock.Should().Be(100, "a blocked dispense deducts no stock");
        (await w.Db.PrescriptionOrders.SingleAsync()).Status.Should().Be(PrescriptionStatus.Accepted);

        var order = await w.Db.PrescriptionOrders.SingleAsync();
        order.PaymentStatus = PrescriptionPaymentStatus.Paid;
        await w.Db.SaveChangesAsync();

        var dispensed = await w.Dispense.Handle(DispenseOf(w.Order.Id), CancellationToken.None);

        dispensed.Status.Should().Be(nameof(PrescriptionStatus.Dispensed));
        (await w.Db.InventoryItems.SingleAsync(i => i.Id == w.Amoxicillin.Id)).CurrentStock.Should().Be(79);
    }

    [Fact]
    public async Task Dispense_UnderPostpaid_DoesNotWaitForPayment()
    {
        var w = await CreateWorldAsync(PharmacyPaymentPolicy.Postpaid);
        await w.Review.Handle(new AcceptPrescriptionCommand(w.Order.Id), CancellationToken.None);

        var dispensed = await w.Dispense.Handle(DispenseOf(w.Order.Id), CancellationToken.None);

        dispensed.Status.Should().Be(nameof(PrescriptionStatus.Dispensed));
    }

    [Fact]
    public async Task Dispense_UnderPolicyNone_NeverRequiresReviewOrPayment()
    {
        var w = await CreateWorldAsync(PharmacyPaymentPolicy.None);

        var dispensed = await w.Dispense.Handle(DispenseOf(w.Order.Id), CancellationToken.None);

        dispensed.Status.Should().Be(nameof(PrescriptionStatus.Dispensed));
    }

    [Fact]
    public async Task Dispense_OfARejectedOrder_IsABadRequest()
    {
        var w = await CreateWorldAsync();
        await w.Review.Handle(new RejectPrescriptionCommand(w.Order.Id, "No stock"), CancellationToken.None);

        var act = async () => await w.Dispense.Handle(DispenseOf(w.Order.Id), CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task Dispense_OfAPartiallyAcceptedOrder_DispensesOnlyTheAcceptedItems()
    {
        var w = await CreateWorldAsync(PharmacyPaymentPolicy.Postpaid);
        await w.Review.Handle(
            new PartiallyAcceptPrescriptionCommand(w.Order.Id, new[] { w.AmoxicillinLine }, "Paracetamol out of stock"), CancellationToken.None);

        var dispensed = await w.Dispense.Handle(DispenseOf(w.Order.Id), CancellationToken.None);

        dispensed.Status.Should().Be(nameof(PrescriptionStatus.Dispensed));
        (await w.Db.InventoryItems.SingleAsync(i => i.Id == w.Amoxicillin.Id)).CurrentStock.Should().Be(79);
        (await w.Db.InventoryItems.SingleAsync(i => i.Id == w.Paracetamol.Id)).CurrentStock.Should().Be(100);
        (await OutboxAsync(w.Db, InteropTypes.RxDispensed)).Single()
            .GetPayload<PrescriptionDispensedEvent>().TotalAmount.Should().Be(105.00m);
    }

    [Theory]
    [InlineData(PharmacyPaymentPolicy.None, PrescriptionStatus.Pending, PrescriptionPaymentStatus.NotRequired, null)]
    [InlineData(PharmacyPaymentPolicy.Prepaid, PrescriptionStatus.Pending, PrescriptionPaymentStatus.NotRequired, PharmacyErrorCodes.AcceptanceRequired)]
    [InlineData(PharmacyPaymentPolicy.Prepaid, PrescriptionStatus.Accepted, PrescriptionPaymentStatus.AwaitingPayment, PharmacyErrorCodes.PaymentRequired)]
    [InlineData(PharmacyPaymentPolicy.Prepaid, PrescriptionStatus.Accepted, PrescriptionPaymentStatus.Paid, null)]
    [InlineData(PharmacyPaymentPolicy.Prepaid, PrescriptionStatus.PartiallyAccepted, PrescriptionPaymentStatus.AwaitingPayment, PharmacyErrorCodes.PaymentRequired)]
    [InlineData(PharmacyPaymentPolicy.Postpaid, PrescriptionStatus.Pending, PrescriptionPaymentStatus.NotRequired, PharmacyErrorCodes.AcceptanceRequired)]
    [InlineData(PharmacyPaymentPolicy.Postpaid, PrescriptionStatus.Accepted, PrescriptionPaymentStatus.AwaitingPayment, null)]
    [InlineData(PharmacyPaymentPolicy.Prepaid, PrescriptionStatus.Rejected, PrescriptionPaymentStatus.NotRequired, null)]
    [InlineData(PharmacyPaymentPolicy.Prepaid, PrescriptionStatus.Dispensed, PrescriptionPaymentStatus.Paid, null)]
    public void BlockedReason_FollowsThePolicyStatusAndPayment(
        PharmacyPaymentPolicy policy, PrescriptionStatus status, PrescriptionPaymentStatus payment, string? expected)
    {
        var order = new PrescriptionOrder
        {
            PrescriptionNumber = "RX-GATE",
            PatientName = "Gate Patient",
            PaymentPolicy = policy,
            Status = status,
            PaymentStatus = payment
        };

        PrescriptionDispenseGate.BlockedReason(order).Should().Be(expected);
    }

    // ── dispense receipt to the patient ─────────────────────────────────────────────────

    [Fact]
    public async Task Dispense_QueuesAReceiptDocumentToThePatient_WithTheSameCorrelation_AndPharmacyName()
    {
        var w = await CreateWorldAsync(PharmacyPaymentPolicy.None);

        await w.Dispense.Handle(DispenseOf(w.Order.Id), CancellationToken.None);

        var receipt = (await OutboxAsync(w.Db, InteropTypes.PatientDocumentIssued)).Should().ContainSingle().Subject;
        receipt.To.Should().Be(Party.ForPatient(w.Order.PatientId.ToString()));
        receipt.From.Should().Be(PharmacyParty);
        receipt.CorrelationId.Should().Be(w.Order.CorrelationId);
        var payload = receipt.GetPayload<PatientDocumentIssuedPayload>();
        payload.Kind.Should().Be(PatientDocumentKind.DispenseReceipt);
        payload.Title.Should().Contain("RX-REVIEW-001");
        payload.PatientId.Should().Be(w.Order.PatientId);

        var dispensed = (await OutboxAsync(w.Db, InteropTypes.RxDispensed)).Single();
        dispensed.GetPayload<PrescriptionDispensedEvent>().PharmacyFacilityName.Should().Be(PharmacyName);
    }

    [Fact]
    public async Task Dispense_WithoutAKnownPatient_QueuesNoPatientDocument()
    {
        var w = await CreateWorldAsync(PharmacyPaymentPolicy.None, patientId: Guid.Empty);

        await w.Dispense.Handle(DispenseOf(w.Order.Id), CancellationToken.None);

        (await OutboxAsync(w.Db, InteropTypes.PatientDocumentIssued)).Should().BeEmpty();
        (await OutboxAsync(w.Db, InteropTypes.RxDispensed)).Should().ContainSingle();
    }

    // ── settings ────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Settings_AreReadAndThePaymentPolicyIsUpdated()
    {
        var (db, uow, sieve) = PharmacyTestDbHelper.CreateTestContext();
        db.PharmacySettings.Add(new PharmacySettings
        {
            Id = Guid.NewGuid(),
            TenantId = PharmacyTestDbHelper.TenantId,
            PharmacyId = PharmacyTestDbHelper.PharmacyId,
            PharmacyName = PharmacyName
        });
        await db.SaveChangesAsync();
        var handler = new PharmacySettingsHandler(new Repository<PharmacySettings>(db, sieve), uow);

        var initial = await handler.Handle(new GetPharmacySettingsQuery(), CancellationToken.None);
        var updated = await handler.Handle(new UpdatePaymentPolicyCommand(PharmacyPaymentPolicy.Postpaid), CancellationToken.None);

        initial.Should().Be(new PharmacySettingsDto(PharmacyName, nameof(PharmacyPaymentPolicy.Prepaid)));
        updated.PaymentPolicy.Should().Be(nameof(PharmacyPaymentPolicy.Postpaid));
        (await db.PharmacySettings.SingleAsync()).PaymentPolicy.Should().Be(PharmacyPaymentPolicy.Postpaid);
    }

    [Fact]
    public async Task Settings_OfAnUnprovisionedPharmacy_AreNotFound()
    {
        var (db, uow, sieve) = PharmacyTestDbHelper.CreateTestContext();
        var handler = new PharmacySettingsHandler(new Repository<PharmacySettings>(db, sieve), uow);

        var act = async () => await handler.Handle(new GetPharmacySettingsQuery(), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public void UpdatePaymentPolicyValidator_RejectsUndefinedPolicies()
    {
        var validator = new UpdatePaymentPolicyCommandValidator();

        validator.Validate(new UpdatePaymentPolicyCommand((PharmacyPaymentPolicy)42)).IsValid.Should().BeFalse();
        validator.Validate(new UpdatePaymentPolicyCommand(PharmacyPaymentPolicy.None)).IsValid.Should().BeTrue();
    }
}
