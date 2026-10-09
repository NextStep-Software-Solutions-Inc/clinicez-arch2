using ClinicEz.Billing.Domain;
using ClinicEz.Billing.Domain.Entities;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Billing.Domain.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;

namespace ClinicEz.Billing.Tests;

public class MoneyTests
{
    [Theory]
    [InlineData(0.005, 0.01)]
    [InlineData(2.675, 2.68)]
    [InlineData(2.674, 2.67)]
    [InlineData(-0.005, -0.01)]
    public void Round_goes_to_two_decimals_half_away_from_zero(double input, double expected) =>
        Money.Round((decimal)input).Should().Be((decimal)expected);

    [Fact]
    public void Distribute_always_adds_up_and_puts_the_left_over_cents_on_the_last_share()
    {
        var shares = Money.Distribute(100m, new[] { 1m, 1m, 1m });

        shares.Should().Equal(33.33m, 33.33m, 33.34m);
        shares.Sum().Should().Be(100m);
    }

    [Fact]
    public void Distribute_skips_zero_weights_and_follows_the_weights()
    {
        var shares = Money.Distribute(10m, new[] { 300m, 0m, 700m });

        shares.Should().Equal(3m, 0m, 7m);
    }

    [Fact]
    public void Distribute_of_nothing_gives_nothing() =>
        Money.Distribute(10m, new[] { 0m, 0m }).Should().OnlyContain(s => s == 0m);
}

public class InvoiceRulesTests
{
    private static readonly DateTime Now = new(2026, 3, 10, 2, 0, 0, DateTimeKind.Utc);
    private static readonly Guid Actor = Guid.NewGuid();
    private static readonly Guid Supervisor = Guid.NewGuid();

    private static Invoice NewInvoice(params (decimal Price, int Qty)[] lines) =>
        Invoice.Create(
            "tenant-a", "clinic-1", FacilityType.Clinic, "branch-1", InvoiceOrigin.Requested, Guid.NewGuid(), "Consultation", Guid.NewGuid(), null,
            "Juan Dela Cruz", "visit-1", "PHP", lines.Select((l, i) => new InvoiceLineInput($"C{i}", $"Item {i}", l.Qty, l.Price)), "test", Now);

    private static void Senior(Invoice invoice, string? id = "SC-123") =>
        invoice.ApplyDiscount(DiscountKind.Senior, null, null, null, id, Actor, "Cashier", null, null, Now);

    [Fact]
    public void Line_totals_are_rounded_once_per_line_and_summed()
    {
        var invoice = NewInvoice((0.335m, 3), (10.005m, 1));

        invoice.Lines.Select(l => l.LineTotal).Should().Equal(1.02m, 10.01m);
        invoice.Subtotal.Should().Be(11.03m);
        invoice.Total.Should().Be(11.03m);
    }

    [Fact]
    public void Statutory_senior_discount_is_a_fixed_twenty_percent_of_the_subtotal()
    {
        var invoice = NewInvoice((1000m, 1));

        Senior(invoice);

        invoice.DiscountTotal.Should().Be(200m);
        invoice.Total.Should().Be(800m);
        invoice.Discounts.Single().IdNumber.Should().Be("SC-123");
    }

    [Fact]
    public void Statutory_discount_needs_an_id_number_and_a_fixed_rate()
    {
        var invoice = NewInvoice((1000m, 1));

        FluentActions.Invoking(() => Senior(invoice, " ")).Should().Throw<BadRequestException>();
        FluentActions.Invoking(() => invoice.ApplyDiscount(DiscountKind.Senior, DiscountMode.Percentage, 30m, null, "SC-1", Actor, "C", null, null, Now))
            .Should().Throw<BadRequestException>();
        invoice.Discounts.Should().BeEmpty();
    }

    [Fact]
    public void Senior_and_pwd_discounts_cannot_be_combined()
    {
        var invoice = NewInvoice((1000m, 1));
        Senior(invoice);

        FluentActions.Invoking(() => invoice.ApplyDiscount(DiscountKind.Pwd, null, null, null, "PWD-1", Actor, "C", null, null, Now))
            .Should().Throw<ConflictException>();
    }

    [Fact]
    public void Promo_discount_needs_a_supervisor_and_a_reason()
    {
        var invoice = NewInvoice((1000m, 1));

        FluentActions.Invoking(() => invoice.ApplyDiscount(DiscountKind.Promo, DiscountMode.Fixed, 50m, "Promo", null, Actor, "C", null, null, Now))
            .Should().Throw<ForbiddenException>();
        FluentActions.Invoking(() => invoice.ApplyDiscount(DiscountKind.Promo, DiscountMode.Fixed, 50m, " ", null, Actor, "C", Supervisor, "Sup", Now))
            .Should().Throw<BadRequestException>();

        invoice.ApplyDiscount(DiscountKind.Promo, DiscountMode.Fixed, 50m, "Opening promo", null, Actor, "C", Supervisor, "Sup", Now);
        invoice.Total.Should().Be(950m);
        invoice.Discounts.Single().ApprovedByName.Should().Be("Sup");
    }

    [Fact]
    public void Discounts_are_each_computed_on_the_gross_subtotal_and_never_compound()
    {
        var invoice = NewInvoice((1000m, 1));
        Senior(invoice);

        invoice.ApplyDiscount(DiscountKind.Promo, DiscountMode.Fixed, 100m, "Promo", null, Actor, "C", Supervisor, "Sup", Now);

        invoice.DiscountTotal.Should().Be(300m);
        invoice.Total.Should().Be(700m);
    }

    [Fact]
    public void A_discount_that_would_cover_the_whole_invoice_is_refused()
    {
        var invoice = NewInvoice((1000m, 1));

        FluentActions.Invoking(() => invoice.ApplyDiscount(DiscountKind.Promo, DiscountMode.Percentage, 100m, "Free", null, Actor, "C", Supervisor, "Sup", Now))
            .Should().Throw<BadRequestException>();

        invoice.Discounts.Should().BeEmpty();
        invoice.Total.Should().Be(1000m);
    }

    [Fact]
    public void Discounts_are_locked_once_anything_is_paid()
    {
        var invoice = NewInvoice((1000m, 1));
        invoice.AssignNumber("INV-000001");
        invoice.RegisterPayment(100m, Now);

        FluentActions.Invoking(() => Senior(invoice)).Should().Throw<ConflictException>();
    }

    [Fact]
    public void Payments_move_the_invoice_from_open_to_partially_paid_to_paid()
    {
        var invoice = NewInvoice((300m, 1));
        invoice.AssignNumber("INV-000001");

        invoice.RegisterPayment(100m, Now);
        invoice.Status.Should().Be(InvoiceStatus.PartiallyPaid);
        invoice.Balance.Should().Be(200m);

        invoice.RegisterPayment(200m, Now);
        invoice.Status.Should().Be(InvoiceStatus.Paid);
        invoice.Balance.Should().Be(0m);
        invoice.PaidAtUtc.Should().Be(Now);
    }

    [Fact]
    public void A_payment_above_the_balance_or_with_fractions_of_a_centavo_is_refused()
    {
        var invoice = NewInvoice((300m, 1));
        invoice.AssignNumber("INV-000001");

        FluentActions.Invoking(() => invoice.RegisterPayment(300.01m, Now)).Should().Throw<BadRequestException>();
        FluentActions.Invoking(() => invoice.RegisterPayment(10.001m, Now)).Should().Throw<BadRequestException>();
        invoice.PaidTotal.Should().Be(0m);
    }

    [Fact]
    public void An_invoice_with_payments_can_be_refunded_but_not_voided()
    {
        var invoice = NewInvoice((300m, 1));
        invoice.AssignNumber("INV-000001");
        invoice.RegisterPayment(300m, Now);

        FluentActions.Invoking(() => invoice.Void("mistake", Now)).Should().Throw<ConflictException>();

        invoice.Refund("customer request", Now).Should().Be(300m);
        invoice.Status.Should().Be(InvoiceStatus.Refunded);
        invoice.NetPaid.Should().Be(0m);
        invoice.Balance.Should().Be(0m);
    }

    [Fact]
    public void Void_and_refund_need_a_reason()
    {
        var invoice = NewInvoice((300m, 1));
        invoice.AssignNumber("INV-000001");

        FluentActions.Invoking(() => invoice.Void(" ", Now)).Should().Throw<BadRequestException>();
        FluentActions.Invoking(() => invoice.Refund("because", Now)).Should().Throw<ConflictException>();
    }

    [Fact]
    public void Invalid_lines_are_rejected_before_any_state_exists()
    {
        FluentActions.Invoking(() => NewInvoice((10m, 0))).Should().Throw<BadRequestException>();
        FluentActions.Invoking(() => NewInvoice((-1m, 1))).Should().Throw<BadRequestException>();
        FluentActions.Invoking(() => NewInvoice()).Should().Throw<BadRequestException>();
    }
}

public class CashierShiftRulesTests
{
    private static readonly DateTime Now = new(2026, 3, 10, 2, 0, 0, DateTimeKind.Utc);

    private static CashierShift Open(decimal openingFloat = 1000m) =>
        CashierShift.Open("tenant-a", "clinic-1", Guid.NewGuid(), "Cashier", openingFloat, Now);

    [Fact]
    public void Exact_count_closes_with_zero_variance_and_no_notes()
    {
        var shift = Open();

        shift.Close(1750m, cashCollected: 800m, cashRefunded: 50m, nonCashCollected: 300m, externalSettled: 100m, null, Now);

        shift.ExpectedCash.Should().Be(1750m);
        shift.Variance.Should().Be(0m);
        shift.Status.Should().Be(ShiftStatus.Closed);
        shift.NonCashCollected.Should().Be(300m);
        shift.ExternalSettled.Should().Be(100m);
    }

    [Theory]
    [InlineData(1740, -10)]
    [InlineData(1760, 10)]
    public void A_shortage_or_overage_must_be_explained(double counted, double variance)
    {
        var shift = Open();

        FluentActions.Invoking(() => shift.Close((decimal)counted, 800m, 50m, 0m, 0m, " ", Now)).Should().Throw<BadRequestException>();
        shift.Status.Should().Be(ShiftStatus.Open);

        shift.Close((decimal)counted, 800m, 50m, 0m, 0m, "Counted twice", Now);
        shift.Variance.Should().Be((decimal)variance);
        shift.CloseNotes.Should().Be("Counted twice");
    }

    [Fact]
    public void A_closed_shift_cannot_be_closed_again_and_a_negative_float_is_refused()
    {
        var shift = Open();
        shift.Close(1000m, 0m, 0m, 0m, 0m, null, Now);

        FluentActions.Invoking(() => shift.Close(1000m, 0m, 0m, 0m, 0m, null, Now)).Should().Throw<ConflictException>();
        FluentActions.Invoking(() => Open(-1m)).Should().Throw<BadRequestException>();
    }
}

public class VisitBillingMathTests
{
    private static readonly Guid Patient = Guid.NewGuid();
    private static DateTime _clock = new(2026, 3, 10, 2, 0, 0, DateTimeKind.Utc);

    private static Invoice NewInvoice(string facility, FacilityType type, decimal total, string? visit = "v-1", string? branch = "b-1", Guid? patientId = null, string name = "Juan")
    {
        _clock = _clock.AddMinutes(1);
        var invoice = Invoice.Create(
            "tenant-a", facility, type, branch, InvoiceOrigin.Requested, Guid.NewGuid(), "Svc", Guid.NewGuid(), patientId, name, visit, "PHP",
            new[] { new InvoiceLineInput("S", "Service", 1, total) }, "test", _clock);
        invoice.AssignNumber($"INV-{facility}");
        return invoice;
    }

    [Fact]
    public void Invoices_of_one_visit_from_three_facilities_form_one_bill_oldest_first()
    {
        var clinic = NewInvoice("clinic-1", FacilityType.Clinic, 500m, patientId: Patient);
        var lab = NewInvoice("lab-1", FacilityType.Laboratory, 1250.50m, patientId: Patient);
        var pharmacy = NewInvoice("pharmacy-1", FacilityType.Pharmacy, 349.75m, patientId: Patient);

        var groups = VisitBillGrouper.Group(new[] { pharmacy, clinic, lab });

        groups.Should().ContainSingle();
        groups[0].Should().Equal(clinic, lab, pharmacy);
    }

    [Fact]
    public void Different_visits_branches_patients_or_no_visit_key_are_never_merged()
    {
        var a = NewInvoice("clinic-1", FacilityType.Clinic, 100m, patientId: Patient);
        var otherVisit = NewInvoice("lab-1", FacilityType.Laboratory, 100m, visit: "v-2", patientId: Patient);
        var otherBranch = NewInvoice("lab-1", FacilityType.Laboratory, 100m, branch: "b-2", patientId: Patient);
        var otherPatient = NewInvoice("lab-1", FacilityType.Laboratory, 100m, patientId: Guid.NewGuid());
        var noVisitA = NewInvoice("lab-1", FacilityType.Laboratory, 100m, visit: null, patientId: Patient);
        var noVisitB = NewInvoice("pharmacy-1", FacilityType.Pharmacy, 100m, visit: null, patientId: Patient);

        VisitBillGrouper.Group(new[] { a, otherVisit, otherBranch, otherPatient, noVisitA, noVisitB }).Should().HaveCount(6);
    }

    [Fact]
    public void An_invoice_without_a_patient_id_joins_the_visit_by_name_but_never_guesses_between_two_patients()
    {
        var withId = NewInvoice("clinic-1", FacilityType.Clinic, 100m, patientId: Patient, name: "Maria Clara");
        var byName = NewInvoice("lab-1", FacilityType.Laboratory, 100m, name: "maria clara");
        VisitBillGrouper.Group(new[] { withId, byName }).Should().ContainSingle();

        var twinA = NewInvoice("clinic-1", FacilityType.Clinic, 100m, patientId: Guid.NewGuid(), name: "Jose Rizal");
        var twinB = NewInvoice("clinic-1", FacilityType.Clinic, 100m, patientId: Guid.NewGuid(), name: "Jose Rizal");
        var unknown = NewInvoice("lab-1", FacilityType.Laboratory, 100m, name: "Jose Rizal");
        VisitBillGrouper.Group(new[] { twinA, twinB, unknown }).Should().HaveCount(3);
    }

    [Fact]
    public void Oldest_first_allocation_fills_the_oldest_invoice_then_spills_over_with_a_partial_share()
    {
        var oldest = NewInvoice("clinic-1", FacilityType.Clinic, 300m, patientId: Patient);
        var middle = NewInvoice("lab-1", FacilityType.Laboratory, 500m, patientId: Patient);
        var newest = NewInvoice("pharmacy-1", FacilityType.Pharmacy, 200m, patientId: Patient);

        var allocation = PaymentAllocator.AllocateOldestFirst(new[] { newest, middle, oldest }, 600m);

        allocation.Select(a => (a.Invoice, a.Amount)).Should().Equal((oldest, 300m), (middle, 300m));
    }

    [Fact]
    public void Allocation_above_the_visit_balance_or_off_the_centavo_is_refused()
    {
        var invoice = NewInvoice("clinic-1", FacilityType.Clinic, 300m, patientId: Patient);

        FluentActions.Invoking(() => PaymentAllocator.AllocateOldestFirst(new[] { invoice }, 300.01m)).Should().Throw<BadRequestException>();
        FluentActions.Invoking(() => PaymentAllocator.AllocateOldestFirst(new[] { invoice }, 0.001m)).Should().Throw<BadRequestException>();
    }

    [Fact]
    public void Explicit_allocation_must_add_up_stay_within_balances_and_not_repeat_an_invoice()
    {
        var a = NewInvoice("clinic-1", FacilityType.Clinic, 300m, patientId: Patient);
        var b = NewInvoice("lab-1", FacilityType.Laboratory, 500m, patientId: Patient);
        var byId = new Dictionary<Guid, Invoice> { [a.Id] = a, [b.Id] = b };

        PaymentAllocator.AllocateExplicit(byId, new[] { (a.Id, 100m), (b.Id, 50m) }, 150m).Should().HaveCount(2);

        FluentActions.Invoking(() => PaymentAllocator.AllocateExplicit(byId, new[] { (a.Id, 100m) }, 150m)).Should().Throw<BadRequestException>();
        FluentActions.Invoking(() => PaymentAllocator.AllocateExplicit(byId, new[] { (a.Id, 301m) }, 301m)).Should().Throw<BadRequestException>();
        FluentActions.Invoking(() => PaymentAllocator.AllocateExplicit(byId, new[] { (a.Id, 10m), (a.Id, 10m) }, 20m)).Should().Throw<BadRequestException>();
        FluentActions.Invoking(() => PaymentAllocator.AllocateExplicit(byId, new[] { (Guid.NewGuid(), 10m) }, 10m)).Should().Throw<NotFoundException>();
    }
}
