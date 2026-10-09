using ClinicEz.Billing.Application.Dtos;
using ClinicEz.Billing.Application.Services;
using ClinicEz.Billing.Domain.Entities;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Billing.Tests.TestSupport;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Persistence;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Billing.Tests;

public class PaymentTests
{
    private static readonly Guid Patient = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001");

    internal sealed record Visit(Invoice Clinic, Invoice Lab, Invoice Pharmacy)
    {
        public decimal Total => Clinic.Total + Lab.Total + Pharmacy.Total;
    }

    /// <summary>One patient visit billed by a clinic (500.00), a laboratory (1,250.50) and a pharmacy (349.75): 2,100.25 in all.</summary>
    internal static async Task<Visit> ReceiveVisitAsync(BillingHost host, string tenantId = BillingHost.TenantA, string visitKey = "visit-1")
    {
        var clinic = await host.ReceiveAsync(tenantId, BillingHost.Clinic, FacilityType.Clinic, visitKey, 500m, Patient);
        host.Clock.Advance(TimeSpan.FromMinutes(1));
        var lab = await host.ReceiveAsync(tenantId, BillingHost.Lab, FacilityType.Laboratory, visitKey, 1250.50m, Patient);
        host.Clock.Advance(TimeSpan.FromMinutes(1));
        var pharmacy = await host.ReceiveAsync(tenantId, BillingHost.Pharmacy, FacilityType.Pharmacy, visitKey, 349.75m, Patient);
        return new Visit(clinic, lab, pharmacy);
    }

    internal static T Payload<T>(InteropOutboxMessage message) => InteropEnvelope.FromJson(message.EnvelopeJson).GetPayload<T>();

    internal static InteropEnvelope Envelope(InteropOutboxMessage message) => InteropEnvelope.FromJson(message.EnvelopeJson);

    private static Task<TResult> Billing<TResult>(BillingHost host, Func<VisitBillService, Task<TResult>> action) => host.With(action);

    [Fact]
    public async Task Three_facilities_one_visit_form_one_consolidated_bill()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);

        var bill = await Billing(host, s => s.GetAsync(visit.Lab.Id, default));

        bill.AnchorInvoiceId.Should().Be(visit.Clinic.Id, "the oldest invoice anchors the bill");
        bill.Total.Should().Be(2100.25m);
        bill.Balance.Should().Be(2100.25m);
        bill.Invoices.Should().HaveCount(3);
        bill.Facilities.Select(f => f.FacilityId).Should().BeEquivalentTo(BillingHost.Clinic, BillingHost.Lab, BillingHost.Pharmacy);
        bill.Facilities.Single(f => f.FacilityId == BillingHost.Lab).Total.Should().Be(1250.50m);
    }

    [Fact]
    public async Task Searching_by_patient_or_by_one_facility_still_shows_the_whole_visit()
    {
        using var host = new BillingHost();
        await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);

        var byName = await Billing(host, s => s.SearchAsync("juan", null, null, null, default));
        var byLabOnly = await Billing(host, s => s.SearchAsync(null, "visit-1", null, BillingHost.Lab, default));

        byName.Should().ContainSingle().Which.Should().Match<VisitBillSummaryDto>(b => b.InvoiceCount == 3 && b.Total == 2100.25m && b.FacilityTypes.Count == 3);
        byLabOnly.Should().ContainSingle().Which.InvoiceCount.Should().Be(3);
    }

    [Fact]
    public async Task Full_payment_settles_the_visit_with_one_receipt_and_tells_each_facility_and_the_portal()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();

        var payment = await host.PayAsync(visit.Lab.Id, 2100.25m, tendered: 2200m);

        payment.ReceiptNumber.Should().Be("OR-000001");
        payment.Change.Should().Be(99.75m);
        payment.Allocations.Should().HaveCount(3);
        payment.Allocations.Sum(a => a.Amount).Should().Be(2100.25m);
        payment.Allocations.Should().OnlyContain(a => a.InvoiceStatus == InvoiceStatus.Paid && a.InvoiceBalance == 0m);
        (await host.InvoicesAsync()).Should().OnlyContain(i => i.Status == InvoiceStatus.Paid);

        var sent = await host.RelayAsync();
        var confirmations = sent.Where(e => e.Type == InteropTypes.BillingPaymentConfirmed).ToList();
        confirmations.Should().HaveCount(3);
        confirmations.Select(e => e.To.FacilityId).Should().BeEquivalentTo(BillingHost.Clinic, BillingHost.Lab, BillingHost.Pharmacy);
        confirmations.Should().OnlyContain(e => e.From.Service == InteropServices.Billing && e.From.FacilityId == e.To.FacilityId && e.To.TenantId == BillingHost.TenantA);
        confirmations.Should().OnlyContain(e => e.GetPayload<BillingPaymentConfirmedPayload>().FullyPaid && e.GetPayload<BillingPaymentConfirmedPayload>().ReceiptNumber == "OR-000001");

        var labConfirmation = confirmations.Single(e => e.To.FacilityId == BillingHost.Lab);
        labConfirmation.GetPayload<BillingPaymentConfirmedPayload>().InvoiceId.Should().Be(visit.Lab.Id);
        labConfirmation.CorrelationId.Should().Be(visit.Lab.InvoiceRequestId!.Value);

        var rollups = sent.Where(e => e.Type == InteropTypes.BillingInvoicePaid).ToList();
        rollups.Should().HaveCount(3);
        rollups.Should().OnlyContain(e => e.To.Kind == PartyKind.ControlPlane && e.To.Service == InteropServices.Portal);
        rollups.Sum(e => e.GetPayload<BillingInvoicePaidPayload>().Total).Should().Be(2100.25m);
        rollups.Select(e => e.ToJson()).Should().OnlyContain(json => !json.Contains("Juan") && !json.Contains(Patient.ToString()), "the finance rollup carries no patient data");
    }

    [Fact]
    public async Task A_partial_payment_is_applied_oldest_first_and_only_completed_invoices_reach_the_portal()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();

        var first = await host.PayAsync(visit.Clinic.Id, 700m);

        first.Allocations.Select(a => (a.FacilityId, a.Amount)).Should().Equal((BillingHost.Clinic, 500m), (BillingHost.Lab, 200m));
        var invoices = await host.InvoicesAsync();
        invoices.Single(i => i.Id == visit.Clinic.Id).Status.Should().Be(InvoiceStatus.Paid);
        invoices.Single(i => i.Id == visit.Lab.Id).Should().Match<Invoice>(i => i.Status == InvoiceStatus.PartiallyPaid && i.PaidTotal == 200m && i.Balance == 1050.50m);
        invoices.Single(i => i.Id == visit.Pharmacy.Id).Status.Should().Be(InvoiceStatus.Open);

        var outbox = await host.OutboxAsync();
        var confirmations = outbox.Where(o => o.Type == InteropTypes.BillingPaymentConfirmed).Select(Payload<BillingPaymentConfirmedPayload>).ToList();
        confirmations.Should().HaveCount(2);
        confirmations.Single(c => c.InvoiceId == visit.Clinic.Id).Should().Match<BillingPaymentConfirmedPayload>(c => c.FullyPaid && c.AmountPaid == 500m);
        confirmations.Single(c => c.InvoiceId == visit.Lab.Id).Should().Match<BillingPaymentConfirmedPayload>(c => !c.FullyPaid && c.AmountPaid == 200m && c.AmountDue == 1250.50m);
        outbox.Where(o => o.Type == InteropTypes.BillingInvoicePaid).Select(Payload<BillingInvoicePaidPayload>).Should().ContainSingle().Which.InvoiceId.Should().Be(visit.Clinic.Id);

        var second = await host.PayAsync(visit.Clinic.Id, 1400.25m);

        second.ReceiptNumber.Should().Be("OR-000002");
        second.Allocations.Select(a => (a.FacilityId, a.Amount)).Should().Equal((BillingHost.Lab, 1050.50m), (BillingHost.Pharmacy, 349.75m));
        (await host.InvoicesAsync()).Should().OnlyContain(i => i.Status == InvoiceStatus.Paid);
        (await host.OutboxAsync()).Count(o => o.Type == InteropTypes.BillingInvoicePaid).Should().Be(3);
        (await Billing(host, s => s.SearchAsync(null, null, null, null, default))).Should().BeEmpty("a settled visit has nothing left to collect");
    }

    [Fact]
    public async Task An_explicit_split_pays_only_the_named_invoices()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Pharmacy);
        await host.OpenShiftAsync();

        var payment = await host.With<PaymentService, PaymentDto>(p => p.TakeAsync(
            new TakePaymentRequest(PaymentMethod.Cash, 100m, null, null, null, null, new[] { new AllocationRequest(visit.Pharmacy.Id, 100m) }), "split-1", default));

        payment.Allocations.Should().ContainSingle().Which.FacilityId.Should().Be(BillingHost.Pharmacy);
        var invoices = await host.InvoicesAsync();
        invoices.Single(i => i.Id == visit.Pharmacy.Id).PaidTotal.Should().Be(100m);
        invoices.Where(i => i.Id != visit.Pharmacy.Id).Should().OnlyContain(i => i.PaidTotal == 0m);
    }

    [Fact]
    public async Task Explicit_allocations_must_stay_within_the_visit_bill()
    {
        using var host = new BillingHost();
        await ReceiveVisitAsync(host);
        var stranger = await host.ReceiveAsync(BillingHost.TenantA, BillingHost.Clinic, FacilityType.Clinic, "another-visit", 100m);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();
        var visitBill = (await Billing(host, s => s.SearchAsync(null, "visit-1", null, null, default))).Single();

        var mixed = new[] { new AllocationRequest(visitBill.AnchorInvoiceId, 10m), new AllocationRequest(stranger.Id, 10m) };
        await FluentActions.Awaiting(() => host.With<PaymentService, PaymentDto>(p => p.TakeAsync(
                new TakePaymentRequest(PaymentMethod.Cash, 20m, null, null, null, null, mixed), "mix-1", default)))
            .Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task Overpaying_the_visit_is_refused_and_leaves_no_trace()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();

        await FluentActions.Awaiting(() => host.PayAsync(visit.Clinic.Id, 2100.26m)).Should().ThrowAsync<BadRequestException>();

        (await host.Db(db => db.Payments.IgnoreQueryFilters().CountAsync())).Should().Be(0);
        (await host.Db(db => db.Receipts.IgnoreQueryFilters().CountAsync())).Should().Be(0);
        (await host.OutboxAsync()).Should().BeEmpty();
        (await host.InvoicesAsync()).Should().OnlyContain(i => i.PaidTotal == 0m && i.Status == InvoiceStatus.Open);
    }

    [Fact]
    public async Task A_payment_needs_an_open_shift_of_the_cashier_at_their_counter()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);

        await FluentActions.Awaiting(() => host.PayAsync(visit.Clinic.Id, 100m)).Should().ThrowAsync<ConflictException>();

        var shift = await host.OpenShiftAsync();
        await host.PayAsync(visit.Clinic.Id, 100m);
        await host.With<ShiftService, ShiftDto>(s => s.CloseAsync(shift.Id, new CloseShiftRequest(1100m, null), default));
        await FluentActions.Awaiting(() => host.PayAsync(visit.Clinic.Id, 100m)).Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task A_retry_with_the_same_idempotency_key_returns_the_original_payment_and_charges_nothing_twice()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();

        var first = await host.PayAsync(visit.Clinic.Id, 300m, key: "retry-1");
        var outboxBefore = (await host.OutboxAsync()).Count;
        var replay = await host.PayAsync(visit.Clinic.Id, 300m, key: "retry-1");

        first.IsReplay.Should().BeFalse();
        replay.IsReplay.Should().BeTrue();
        replay.Id.Should().Be(first.Id);
        replay.ReceiptNumber.Should().Be(first.ReceiptNumber);
        (await host.Db(db => db.Payments.IgnoreQueryFilters().CountAsync())).Should().Be(1);
        (await host.Db(db => db.Receipts.IgnoreQueryFilters().CountAsync())).Should().Be(1);
        (await host.InvoiceAsync(visit.Clinic.Id)).PaidTotal.Should().Be(300m);
        (await host.OutboxAsync()).Should().HaveCount(outboxBefore);
    }

    [Fact]
    public async Task The_same_idempotency_key_with_a_different_request_is_a_conflict_and_the_key_is_mandatory()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();
        await host.PayAsync(visit.Clinic.Id, 300m, key: "reuse-1");

        await FluentActions.Awaiting(() => host.PayAsync(visit.Clinic.Id, 301m, key: "reuse-1")).Should().ThrowAsync<ConflictException>();
        await FluentActions.Awaiting(() => host.With<PaymentService, PaymentDto>(p => p.TakeAsync(
                new TakePaymentRequest(PaymentMethod.Cash, 10m, null, null, null, visit.Clinic.Id, null), " ", default)))
            .Should().ThrowAsync<BadRequestException>();
        (await host.InvoiceAsync(visit.Clinic.Id)).PaidTotal.Should().Be(300m);
    }

    [Fact]
    public async Task Cashless_payments_need_a_reference_and_cash_rules_are_enforced()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();

        await FluentActions.Awaiting(() => host.PayAsync(visit.Clinic.Id, 100m, PaymentMethod.Card)).Should().ThrowAsync<BadRequestException>();
        await FluentActions.Awaiting(() => host.PayAsync(visit.Clinic.Id, 100m, PaymentMethod.GCash, reference: " ")).Should().ThrowAsync<BadRequestException>();
        await FluentActions.Awaiting(() => host.PayAsync(visit.Clinic.Id, 100m, PaymentMethod.Cash, tendered: 99m)).Should().ThrowAsync<BadRequestException>();
        await FluentActions.Awaiting(() => host.PayAsync(visit.Clinic.Id, 100m, PaymentMethod.Card, reference: "APP-1", tendered: 100m)).Should().ThrowAsync<BadRequestException>();
        await FluentActions.Awaiting(() => host.PayAsync(visit.Clinic.Id, 100.005m)).Should().ThrowAsync<BadRequestException>();
        await FluentActions.Awaiting(() => host.With<PaymentService, PaymentDto>(p => p.TakeAsync(
                new TakePaymentRequest(PaymentMethod.Insurance, 100m, "CLAIM-1", null, null, visit.Clinic.Id, null), "ins-1", default)))
            .Should().ThrowAsync<BadRequestException>();

        var card = await host.PayAsync(visit.Clinic.Id, 100m, PaymentMethod.Card, reference: "APP-1");
        card.IsExternal.Should().BeFalse();
        card.Change.Should().Be(0m);
        card.Reference.Should().Be("APP-1");
    }

    [Fact]
    public async Task Insurance_clears_invoices_as_an_external_settlement_that_never_touches_the_drawer()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        var shift = await host.OpenShiftAsync(1000m);

        var claim = await host.PayAsync(visit.Clinic.Id, 500m, PaymentMethod.Insurance, reference: "PH-CLAIM-1");
        await host.PayAsync(visit.Clinic.Id, 100m, PaymentMethod.GCash, reference: "GC-1");
        await host.PayAsync(visit.Clinic.Id, 50m, PaymentMethod.Cash);

        claim.IsExternal.Should().BeTrue();
        claim.InsurerKind.Should().Be(InsurerKind.PhilHealth);
        var current = await host.With<ShiftService, ShiftDto?>(s => s.CurrentAsync(default));
        current.Should().Match<ShiftDto?>(s => s!.Id == shift.Id && s.CashCollected == 50m && s.NonCashCollected == 100m && s.ExternalSettled == 500m && s.ExpectedCash == 1050m);
    }

    [Fact]
    public async Task Receipt_books_are_numbered_per_counter_and_a_counter_can_collect_for_another_facility()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        var clinicCashier = host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();
        var first = await host.PayAsync(visit.Lab.Id, 100m);
        var second = await host.PayAsync(visit.Lab.Id, 100m);

        var labCashier = host.As(BillingHost.TenantA, BillingHost.Lab);
        await host.OpenShiftAsync();
        var third = await host.PayAsync(visit.Lab.Id, 100m);

        first.ReceiptNumber.Should().Be("OR-000001");
        second.ReceiptNumber.Should().Be("OR-000002");
        third.ReceiptNumber.Should().Be("OR-000001", "each counter keeps its own receipt book");
        clinicCashier.FacilityId.Should().NotBe(labCashier.FacilityId);

        var receipt = await host.With<PaymentService, ReceiptDto>(p => p.GetReceiptAsync(first.ReceiptId, default));
        receipt.CounterFacilityId.Should().Be(BillingHost.Clinic);
        receipt.Invoices.Select(i => i.FacilityId).Should().Equal(BillingHost.Clinic);
        receipt.Amount.Should().Be(100m);
        receipt.PatientName.Should().Be("Juan Dela Cruz");
        receipt.BalanceRemaining.Should().Be(500m - 3 * 100m);
    }

    [Fact]
    public async Task A_failed_save_leaves_no_payment_receipt_or_outbox_row_and_the_retry_succeeds()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();

        host.Interceptor.Fail = true;
        await FluentActions.Awaiting(() => host.PayAsync(visit.Clinic.Id, 2100.25m, key: "atomic-1")).Should().ThrowAsync<DbUpdateException>();
        host.Interceptor.Fail = false;

        (await host.Db(db => db.Payments.IgnoreQueryFilters().CountAsync())).Should().Be(0);
        (await host.Db(db => db.Receipts.IgnoreQueryFilters().CountAsync())).Should().Be(0);
        (await host.OutboxAsync()).Should().BeEmpty();
        (await host.Db(db => db.AuditEntries.IgnoreQueryFilters().CountAsync(a => a.Action == "payment.taken"))).Should().Be(0);
        (await host.InvoicesAsync()).Should().OnlyContain(i => i.Status == InvoiceStatus.Open && i.PaidTotal == 0m);

        var retry = await host.PayAsync(visit.Clinic.Id, 2100.25m, key: "atomic-1");

        retry.IsReplay.Should().BeFalse();
        retry.ReceiptNumber.Should().Be("OR-000001", "the failed attempt burned no receipt number");
        (await host.OutboxAsync()).Should().HaveCount(6);
    }

    [Fact]
    public async Task A_payment_and_its_messages_commit_together()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();

        await host.PayAsync(visit.Clinic.Id, 600m);

        var outbox = await host.OutboxAsync();
        outbox.Should().OnlyContain(o => o.DispatchedAtUtc == null && o.DeadLetteredAtUtc == null);
        outbox.Select(o => o.Type).Should().BeEquivalentTo(
            InteropTypes.BillingPaymentConfirmed, InteropTypes.BillingPaymentConfirmed, InteropTypes.BillingInvoicePaid);

        await host.RelayAsync();

        (await host.OutboxAsync()).Should().OnlyContain(o => o.DispatchedAtUtc != null);
        host.Hub.Sent.Should().HaveCount(3);
    }

    [Fact]
    public async Task A_failing_handler_leaves_neither_an_invoice_nor_an_outbox_row_and_the_redelivery_succeeds()
    {
        using var host = new BillingHost();
        var payload = BillingHost.Request(BillingHost.TenantA, BillingHost.Clinic, FacilityType.Clinic, lines: new[] { BillingHost.Line("FU", "Free follow-up", 1, 0m) });
        var envelope = BillingHost.Envelope(payload);

        host.Interceptor.Fail = true;
        (await host.Dispatcher.DispatchAsync(envelope, default)).Outcome.Should().Be(DispatchOutcome.Failed);
        host.Interceptor.Fail = false;

        (await host.InvoicesAsync()).Should().BeEmpty();
        (await host.OutboxAsync()).Should().BeEmpty();
        (await host.Db(db => db.InteropInbox.CountAsync())).Should().Be(0);

        (await host.Dispatcher.DispatchAsync(envelope, default)).Outcome.Should().Be(DispatchOutcome.Handled);
        (await host.InvoicesAsync()).Should().ContainSingle().Which.Status.Should().Be(InvoiceStatus.Paid);
        (await host.OutboxAsync()).Should().ContainSingle();
    }

    [Fact]
    public async Task A_walk_in_invoice_is_paid_at_the_counter_and_only_the_portal_hears_about_it()
    {
        using var host = new BillingHost();
        await host.ReceiveAsync(BillingHost.TenantA, BillingHost.Clinic, FacilityType.Clinic, "visit-9", 100m);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();

        var walkIn = await host.With<InvoiceService, InvoiceDto>(s => s.CreateWalkInAsync(
            new CreateInvoiceRequest("branch-1", null, "Walk In Wally", "visit-w", null, null, new[] { new LineRequest(null, "Dressing", 2, 75m) }), default));
        var payment = await host.PayAsync(walkIn.Id, 150m);

        walkIn.Origin.Should().Be(InvoiceOrigin.WalkIn);
        walkIn.InvoiceNumber.Should().Be("INV-000002");
        walkIn.FacilityId.Should().Be(BillingHost.Clinic);
        payment.Allocations.Should().ContainSingle().Which.InvoiceStatus.Should().Be(InvoiceStatus.Paid);
        (await host.OutboxAsync()).Should().ContainSingle().Which.Type.Should().Be(InteropTypes.BillingInvoicePaid);
    }

    [Fact]
    public async Task A_walk_in_invoice_needs_a_registered_counter_and_something_to_pay()
    {
        using var host = new BillingHost();
        host.As(BillingHost.TenantA, BillingHost.Clinic);

        await FluentActions.Awaiting(() => host.With<InvoiceService, InvoiceDto>(s => s.CreateWalkInAsync(
                new CreateInvoiceRequest(null, null, "Walk In", null, null, null, new[] { new LineRequest(null, "Item", 1, 10m) }), default)))
            .Should().ThrowAsync<BadRequestException>();

        await host.ReceiveAsync(BillingHost.TenantA, BillingHost.Clinic, FacilityType.Clinic, "v", 10m);
        await FluentActions.Awaiting(() => host.With<InvoiceService, InvoiceDto>(s => s.CreateWalkInAsync(
                new CreateInvoiceRequest(null, null, "Walk In", null, null, null, new[] { new LineRequest(null, "Free", 1, 0m) }), default)))
            .Should().ThrowAsync<BadRequestException>();
    }
}
