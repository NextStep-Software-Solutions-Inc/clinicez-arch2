using ClinicEz.Billing.Application.Dtos;
using ClinicEz.Billing.Application.Services;
using ClinicEz.Billing.Domain.Entities;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Billing.Tests.TestSupport;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using static ClinicEz.Billing.Tests.PaymentTests;

namespace ClinicEz.Billing.Tests;

public class PartialRefundTests
{
    private static readonly DateOnly Mar10 = new(2026, 3, 10);

    private static Task<RefundDto> RefundAsync(
        BillingHost host, Guid invoiceId, decimal? amount = null, Guid? paymentId = null, PaymentMethod? method = null, string reason = "Customer request") =>
        host.With<CorrectionService, RefundDto>(c => c.RefundAsync(invoiceId, new RefundRequest(reason, amount, paymentId, method), default));

    /// <summary>The visit is received, the clinic cashier takes <paramref name="amount"/> on the clinic invoice, and a supervisor of the same counter is signed in with an open drawer.</summary>
    private static async Task<(Visit Visit, ShiftDto SupervisorShift)> PaidClinicAsync(BillingHost host, decimal amount = 500m, PaymentMethod method = PaymentMethod.Cash, string? reference = null)
    {
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();
        await host.PayAsync(visit.Clinic.Id, amount, method, reference: reference);
        host.As(BillingHost.TenantA, BillingHost.Clinic, StaffRole.Supervisor, "Sup Visor");
        return (visit, await host.OpenShiftAsync(2000m));
    }

    [Fact]
    public async Task A_partial_refund_keeps_the_invoice_settled_and_locked_and_numbers_the_refund()
    {
        using var host = new BillingHost();
        var (visit, _) = await PaidClinicAsync(host);

        var refund = await RefundAsync(host, visit.Clinic.Id, 120m);

        refund.Should().Match<RefundDto>(r =>
            r.Number == "RF-000001" && r.Amount == 120m && r.IsPartial && r.InvoiceStatus == InvoiceStatus.PartiallyRefunded
            && r.InvoiceRefundedTotal == 120m && r.InvoiceNetPaid == 380m);
        var invoice = await host.InvoiceAsync(visit.Clinic.Id);
        invoice.Status.Should().Be(InvoiceStatus.PartiallyRefunded);
        invoice.PaidTotal.Should().Be(500m);
        invoice.RefundedTotal.Should().Be(120m);
        invoice.NetPaid.Should().Be(380m);
        invoice.Balance.Should().Be(0m, "a partial refund does not make the settled invoice collectable again");
        invoice.IsLocked.Should().BeTrue();
        (await host.Db(db => db.PaymentAllocations.IgnoreQueryFilters().SingleAsync())).RefundedAmount.Should().Be(120m);

        await FluentActions.Awaiting(() => host.With<CorrectionService, InvoiceDto>(c => c.VoidAsync(visit.Clinic.Id, new VoidRequest("Mistake"), default)))
            .Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task A_refund_cannot_exceed_what_is_still_held_and_the_rest_closes_the_invoice_as_refunded()
    {
        using var host = new BillingHost();
        var (visit, _) = await PaidClinicAsync(host);
        await RefundAsync(host, visit.Clinic.Id, 120m);

        await FluentActions.Awaiting(() => RefundAsync(host, visit.Clinic.Id, 380.01m)).Should().ThrowAsync<BadRequestException>();
        await FluentActions.Awaiting(() => RefundAsync(host, visit.Clinic.Id, 0m)).Should().ThrowAsync<BadRequestException>();
        await FluentActions.Awaiting(() => RefundAsync(host, visit.Clinic.Id, 10.005m)).Should().ThrowAsync<BadRequestException>();
        (await host.InvoiceAsync(visit.Clinic.Id)).RefundedTotal.Should().Be(120m);

        var rest = await RefundAsync(host, visit.Clinic.Id);

        rest.Should().Match<RefundDto>(r => r.Number == "RF-000002" && r.Amount == 380m && !r.IsPartial && r.InvoiceStatus == InvoiceStatus.Refunded);
        var invoice = await host.InvoiceAsync(visit.Clinic.Id);
        invoice.RefundedTotal.Should().Be(500m);
        invoice.NetPaid.Should().Be(0m);
        await FluentActions.Awaiting(() => RefundAsync(host, visit.Clinic.Id, 1m)).Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task A_partly_paid_invoice_can_only_be_refunded_in_full()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic, StaffRole.Supervisor);
        await host.OpenShiftAsync();
        await host.PayAsync(visit.Clinic.Id, 700m);

        await FluentActions.Awaiting(() => RefundAsync(host, visit.Lab.Id, 50m)).Should().ThrowAsync<ConflictException>();
        (await host.InvoiceAsync(visit.Lab.Id)).Status.Should().Be(InvoiceStatus.PartiallyPaid);

        var full = await RefundAsync(host, visit.Lab.Id);

        full.Amount.Should().Be(200m);
        full.IsPartial.Should().BeFalse();
        full.InvoiceStatus.Should().Be(InvoiceStatus.Refunded);
    }

    [Fact]
    public async Task A_refund_is_split_over_the_payments_it_came_from_newest_first_each_in_its_own_method()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();
        var cash = await host.PayAsync(visit.Clinic.Id, 300m);
        host.Clock.Advance(TimeSpan.FromMinutes(1));
        var gcash = await host.PayAsync(visit.Clinic.Id, 200m, PaymentMethod.GCash, reference: "GC-1");
        host.As(BillingHost.TenantA, BillingHost.Clinic, StaffRole.Supervisor);
        var shift = await host.OpenShiftAsync(2000m);

        var refund = await RefundAsync(host, visit.Clinic.Id, 250m);

        refund.Lines.Select(l => (l.PaymentId, l.Method, l.Amount)).Should().Equal((gcash.Id, PaymentMethod.GCash, 200m), (cash.Id, PaymentMethod.Cash, 50m));
        refund.Lines.Select(l => l.ReceiptNumber).Should().Equal(gcash.ReceiptNumber, cash.ReceiptNumber);
        refund.Amount.Should().Be(refund.Lines.Sum(l => l.Amount));
        var allocations = await host.Db(db => db.PaymentAllocations.IgnoreQueryFilters().ToListAsync());
        allocations.Single(a => a.PaymentId == gcash.Id).RefundedAmount.Should().Be(200m);
        allocations.Single(a => a.PaymentId == cash.Id).RefundedAmount.Should().Be(50m);

        var closed = await host.With<ShiftService, ShiftDto>(s => s.CloseAsync(shift.Id, new CloseShiftRequest(1950m, null), default));
        closed.CashRefunded.Should().Be(50m, "only the cash line left the drawer");
        closed.ExpectedCash.Should().Be(1950m);
    }

    [Fact]
    public async Task A_refund_can_be_limited_to_one_payment_or_one_method_and_never_takes_more_than_that_holds()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();
        var cash = await host.PayAsync(visit.Clinic.Id, 300m);
        host.Clock.Advance(TimeSpan.FromMinutes(1));
        await host.PayAsync(visit.Clinic.Id, 200m, PaymentMethod.GCash, reference: "GC-1");
        host.As(BillingHost.TenantA, BillingHost.Clinic, StaffRole.Supervisor);
        await host.OpenShiftAsync(2000m);

        await FluentActions.Awaiting(() => RefundAsync(host, visit.Clinic.Id, 300.01m, method: PaymentMethod.Cash)).Should().ThrowAsync<BadRequestException>();
        await FluentActions.Awaiting(() => RefundAsync(host, visit.Clinic.Id, 10m, paymentId: Guid.NewGuid())).Should().ThrowAsync<BadRequestException>();
        (await host.InvoiceAsync(visit.Clinic.Id)).RefundedTotal.Should().Be(0m);

        var byMethod = await RefundAsync(host, visit.Clinic.Id, 100m, method: PaymentMethod.Cash);
        var byPayment = await RefundAsync(host, visit.Clinic.Id, 50m, paymentId: cash.Id);

        byMethod.Lines.Should().ContainSingle().Which.Should().Match<RefundLineDto>(l => l.Method == PaymentMethod.Cash && l.Amount == 100m);
        byPayment.Lines.Should().ContainSingle().Which.PaymentId.Should().Be(cash.Id);
        (await host.Db(db => db.PaymentAllocations.IgnoreQueryFilters().SingleAsync(a => a.PaymentId == cash.Id))).RefundedAmount.Should().Be(150m);
    }

    [Fact]
    public async Task Refunding_cash_needs_an_open_shift_but_a_cashless_line_does_not()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();
        await host.PayAsync(visit.Clinic.Id, 300m);
        host.Clock.Advance(TimeSpan.FromMinutes(1));
        await host.PayAsync(visit.Clinic.Id, 200m, PaymentMethod.GCash, reference: "GC-1");
        host.As(BillingHost.TenantA, BillingHost.Clinic, StaffRole.Supervisor);

        await FluentActions.Awaiting(() => RefundAsync(host, visit.Clinic.Id, 250m)).Should().ThrowAsync<ConflictException>();
        (await host.InvoiceAsync(visit.Clinic.Id)).Status.Should().Be(InvoiceStatus.Paid);
        (await host.Db(db => db.RefundLines.IgnoreQueryFilters().CountAsync())).Should().Be(0);

        var cashless = await RefundAsync(host, visit.Clinic.Id, 150m);

        cashless.Lines.Should().ContainSingle().Which.Method.Should().Be(PaymentMethod.GCash);
        (await host.Db(db => db.Refunds.IgnoreQueryFilters().SingleAsync())).ShiftId.Should().BeNull();
    }

    [Fact]
    public async Task A_partial_refund_tells_the_facility_and_the_portal_with_the_running_total_and_the_last_one_closes_it()
    {
        using var host = new BillingHost();
        var (visit, _) = await PaidClinicAsync(host);

        await RefundAsync(host, visit.Clinic.Id, 120m);

        var first = (await host.OutboxAsync()).Where(o => o.Type == InteropTypes.BillingInvoiceVoided).ToList();
        first.Should().HaveCount(2);
        first.Select(m => Envelope(m).To).Should().Contain(to => to.Kind == PartyKind.ControlPlane && to.Service == InteropServices.Portal)
            .And.Contain(to => to.FacilityId == BillingHost.Clinic);
        first.Select(Payload<BillingInvoiceVoidedPayload>).Should().OnlyContain(p =>
            p.Kind == BillingCorrectionKind.Refund && p.IsPartial && p.WasFullyPaid && p.AmountReversed == 120m && p.RefundedTotal == 120m && p.Total == 500m);

        await RefundAsync(host, visit.Clinic.Id);

        var all = (await host.OutboxAsync()).Where(o => o.Type == InteropTypes.BillingInvoiceVoided).Select(Payload<BillingInvoiceVoidedPayload>).ToList();
        all.Should().HaveCount(4);
        all.Where(p => !p.IsPartial).Should().HaveCount(2).And.OnlyContain(p => p.AmountReversed == 380m && p.RefundedTotal == 500m && p.WasFullyPaid);
    }

    [Fact]
    public async Task The_visit_bill_and_the_receipt_show_what_was_refunded()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();
        var payment = await host.PayAsync(visit.Clinic.Id, 500m);
        host.As(BillingHost.TenantA, BillingHost.Clinic, StaffRole.Supervisor);
        await host.OpenShiftAsync(2000m);

        await RefundAsync(host, visit.Clinic.Id, 120m);

        var bill = await host.With<VisitBillService, VisitBillDto>(s => s.GetAsync(visit.Clinic.Id, default));
        bill.Should().Match<VisitBillDto>(b => b.Total == 2100.25m && b.Paid == 380m && b.Refunded == 120m && b.Balance == 1600.25m);
        bill.Invoices.Should().HaveCount(3, "a partially refunded invoice stays part of the visit");
        bill.Invoices.Single(i => i.Id == visit.Clinic.Id).Status.Should().Be(InvoiceStatus.PartiallyRefunded);

        var receipt = await host.With<PaymentService, ReceiptDto>(p => p.GetReceiptForPaymentAsync(payment.Id, default));
        receipt.Amount.Should().Be(500m);
        receipt.RefundedAmount.Should().Be(120m);
        receipt.Invoices.Single().Should().Match<ReceiptInvoiceDto>(i => i.AppliedByThisPayment == 500m && i.RefundedFromThisPayment == 120m && i.BalanceNow == 0m);

        var next = await host.With<VisitBillService, IReadOnlyList<VisitBillSummaryDto>>(s => s.SearchAsync(null, "visit-1", null, null, default));
        next.Should().ContainSingle().Which.Balance.Should().Be(1600.25m);
    }

    [Fact]
    public async Task Reports_and_shift_totals_count_each_refund_line_by_its_method_and_insurer_money_comes_off_the_external_total()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();
        await host.PayAsync(visit.Clinic.Id, 100m);
        host.Clock.Advance(TimeSpan.FromMinutes(1));
        await host.PayAsync(visit.Clinic.Id, 400m, PaymentMethod.Insurance, reference: "PH-77");
        host.As(BillingHost.TenantA, BillingHost.Clinic, StaffRole.Supervisor);
        var shift = await host.OpenShiftAsync(2000m);

        await RefundAsync(host, visit.Clinic.Id, 450m);

        var report = await host.With<ReportService, DailyCollectionReport>(r => r.DailyCollectionAsync(new DailyCollectionQuery(Mar10, Mar10, 0, "PHP", null, null, null), default));
        report.Collected.Should().Be(100m);
        report.Refunded.Should().Be(50m, "only the cash line was counter money");
        report.Net.Should().Be(50m);
        report.ExternalSettled.Should().Be(0m, "the whole insurer payment was returned");
        report.ByMethod.Single(b => b.Key == nameof(PaymentMethod.Cash)).Refunded.Should().Be(50m);
        report.ByMethod.Single(b => b.Key == nameof(PaymentMethod.Insurance)).ExternalAmount.Should().Be(0m);

        var closed = await host.With<ShiftService, ShiftDto>(s => s.CloseAsync(shift.Id, new CloseShiftRequest(1950m, null), default));
        closed.CashRefunded.Should().Be(50m);
    }

    [Fact]
    public async Task Each_refund_is_audited_with_its_number_and_reason()
    {
        using var host = new BillingHost();
        var (visit, _) = await PaidClinicAsync(host);
        await RefundAsync(host, visit.Clinic.Id, 120m, reason: "Item returned");
        await RefundAsync(host, visit.Clinic.Id);

        var audit = (await host.AuditAsync()).Where(a => a.EntityId == visit.Clinic.Id && a.Action.StartsWith("invoice.") && a.Action.Contains("refunded")).ToList();
        audit.Select(a => a.Action).Should().Equal("invoice.partially_refunded", "invoice.refunded");
        audit[0].Details.Should().Contain("Item returned").And.Contain("RF-000001");
        audit.Should().OnlyContain(a => a.ActorName == "Sup Visor");
    }

    [Fact]
    public async Task A_resent_request_for_a_partially_refunded_invoice_is_ignored()
    {
        using var host = new BillingHost();
        var (visit, _) = await PaidClinicAsync(host);
        await RefundAsync(host, visit.Clinic.Id, 120m);

        var resent = BillingHost.Request(
            BillingHost.TenantA, BillingHost.Clinic, FacilityType.Clinic, visit.Clinic.InvoiceRequestId, lines: new[] { BillingHost.Line("X", "Extra", 1, 900m) });
        var invoice = await host.ReceiveAsync(resent);

        invoice.Status.Should().Be(InvoiceStatus.PartiallyRefunded);
        invoice.Total.Should().Be(500m);
    }

    [Fact]
    public async Task Another_tenants_supervisor_cannot_refund_the_invoice()
    {
        using var host = new BillingHost();
        var (visit, _) = await PaidClinicAsync(host);
        host.As(BillingHost.TenantB, BillingHost.Clinic, StaffRole.Supervisor);

        await FluentActions.Awaiting(() => RefundAsync(host, visit.Clinic.Id, 10m)).Should().ThrowAsync<NotFoundException>();
        (await host.InvoiceAsync(visit.Clinic.Id)).RefundedTotal.Should().Be(0m);
    }
}

public class PartialRefundRulesTests
{
    private static readonly DateTime Now = new(2026, 3, 10, 2, 0, 0, DateTimeKind.Utc);

    private static Invoice Paid(decimal total, decimal paid)
    {
        var invoice = Invoice.Create(
            "tenant-a", "clinic-1", FacilityType.Clinic, "branch-1", InvoiceOrigin.Requested, Guid.NewGuid(), "Consultation", Guid.NewGuid(), null,
            "Juan Dela Cruz", "visit-1", "PHP", new[] { new InvoiceLineInput("C", "Item", 1, total) }, "test", Now);
        invoice.AssignNumber("INV-000001");
        invoice.RegisterPayment(paid, Now);
        return invoice;
    }

    [Fact]
    public void A_partial_refund_leaves_the_invoice_partially_refunded_with_no_balance()
    {
        var invoice = Paid(300m, 300m);

        invoice.Refund(100m, "Returned", Now).Should().Be(100m);

        invoice.Status.Should().Be(InvoiceStatus.PartiallyRefunded);
        invoice.NetPaid.Should().Be(200m);
        invoice.Balance.Should().Be(0m);
        invoice.IsLocked.Should().BeTrue();
        invoice.VoidedAtUtc.Should().BeNull();
        FluentActions.Invoking(() => invoice.RegisterPayment(1m, Now)).Should().Throw<ConflictException>();
    }

    [Fact]
    public void Partial_refunds_add_up_and_refunding_the_rest_closes_the_invoice()
    {
        var invoice = Paid(300m, 300m);
        invoice.Refund(100m, "Returned", Now);
        invoice.Refund(50m, "Returned again", Now);

        invoice.RefundedTotal.Should().Be(150m);
        invoice.Status.Should().Be(InvoiceStatus.PartiallyRefunded);

        invoice.Refund(null, "Cancelled", Now).Should().Be(150m);

        invoice.Status.Should().Be(InvoiceStatus.Refunded);
        invoice.RefundedTotal.Should().Be(300m);
        invoice.VoidReason.Should().Be("Cancelled");
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    [InlineData(300.01)]
    [InlineData(10.001)]
    public void A_refund_must_be_a_positive_amount_with_at_most_two_decimals_and_within_what_is_held(double amount)
    {
        var invoice = Paid(300m, 300m);

        FluentActions.Invoking(() => invoice.Refund((decimal)amount, "Returned", Now)).Should().Throw<BadRequestException>();

        invoice.RefundedTotal.Should().Be(0m);
        invoice.Status.Should().Be(InvoiceStatus.Paid);
    }

    [Fact]
    public void A_partly_paid_invoice_is_refunded_in_full_or_not_at_all()
    {
        var invoice = Paid(300m, 100m);

        FluentActions.Invoking(() => invoice.Refund(40m, "Returned", Now)).Should().Throw<ConflictException>();

        invoice.Refund(100m, "Returned", Now);
        invoice.Status.Should().Be(InvoiceStatus.Refunded);
    }

    [Fact]
    public void A_partially_refunded_invoice_cannot_be_voided_or_reopened()
    {
        var invoice = Paid(300m, 300m);
        invoice.Refund(100m, "Returned", Now);

        FluentActions.Invoking(() => invoice.Void("Mistake", Now)).Should().Throw<ConflictException>();
        FluentActions.Invoking(() => invoice.Reopen(
                "branch-1", "Consultation", Guid.NewGuid(), null, "Juan Dela Cruz", "visit-1", "PHP", new[] { new InvoiceLineInput("C", "Item", 1, 900m) }, Now))
            .Should().Throw<ConflictException>();
    }
}
