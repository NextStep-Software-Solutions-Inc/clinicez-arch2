using ClinicEz.Billing.Application.Dtos;
using ClinicEz.Billing.Application.Services;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Billing.Tests.TestSupport;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using static ClinicEz.Billing.Tests.PaymentTests;

namespace ClinicEz.Billing.Tests;

public class DiscountTests
{
    private static ApplyDiscountRequest Senior(string? idNumber = "SC-2026-001") => new(DiscountKind.Senior, null, null, "Senior citizen", idNumber);

    private static Task<InvoiceDto> ApplyAsync(BillingHost host, Guid invoiceId, ApplyDiscountRequest request) =>
        host.With<DiscountService, InvoiceDto>(s => s.ApplyToInvoiceAsync(invoiceId, request, default));

    private static Task<VisitDiscountResult> ApplyVisitAsync(BillingHost host, Guid anchorId, ApplyDiscountRequest request) =>
        host.With<DiscountService, VisitDiscountResult>(s => s.ApplyToVisitAsync(anchorId, request, default));

    [Fact]
    public async Task A_cashier_applies_a_senior_discount_of_twenty_percent_with_the_id_number()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);

        var invoice = await ApplyAsync(host, visit.Clinic.Id, Senior());

        invoice.DiscountTotal.Should().Be(100m);
        invoice.Total.Should().Be(400m);
        invoice.Discounts.Should().ContainSingle().Which.Should().Match<DiscountDto>(d => d.Kind == DiscountKind.Senior && d.IdNumber == "SC-2026-001" && d.ApprovedByName == null);
        (await host.AuditAsync()).Should().Contain(a => a.Action == "discount.applied" && a.EntityId == visit.Clinic.Id);
    }

    [Fact]
    public async Task A_statutory_discount_needs_an_id_number_and_cannot_be_applied_twice()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);

        await FluentActions.Awaiting(() => ApplyAsync(host, visit.Clinic.Id, Senior(null))).Should().ThrowAsync<BadRequestException>();
        await ApplyAsync(host, visit.Clinic.Id, Senior());
        await FluentActions.Awaiting(() => ApplyAsync(host, visit.Clinic.Id, Senior("SC-2"))).Should().ThrowAsync<ConflictException>();
        await FluentActions.Awaiting(() => ApplyAsync(host, visit.Clinic.Id, new ApplyDiscountRequest(DiscountKind.Pwd, null, null, "PWD", "PWD-1"))).Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task A_promo_discount_is_refused_for_a_cashier_and_records_the_supervisor_as_approver()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        var promo = new ApplyDiscountRequest(DiscountKind.Promo, DiscountMode.Percentage, 10m, "Anniversary promo", null);

        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await FluentActions.Awaiting(() => ApplyAsync(host, visit.Clinic.Id, promo)).Should().ThrowAsync<ForbiddenException>();

        host.As(BillingHost.TenantA, BillingHost.Clinic, StaffRole.Supervisor, "Sup Visor");
        var invoice = await ApplyAsync(host, visit.Clinic.Id, promo);

        invoice.DiscountTotal.Should().Be(50m);
        invoice.Discounts.Single().ApprovedByName.Should().Be("Sup Visor");
    }

    [Fact]
    public async Task A_promo_needs_a_reason()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic, StaffRole.Supervisor);

        await FluentActions.Awaiting(() => ApplyAsync(host, visit.Clinic.Id, new ApplyDiscountRequest(DiscountKind.Promo, DiscountMode.Fixed, 50m, " ", null)))
            .Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task A_visit_wide_senior_discount_goes_on_every_facility_invoice()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);

        var result = await ApplyVisitAsync(host, visit.Lab.Id, Senior());

        result.AppliedInvoiceIds.Should().BeEquivalentTo(new[] { visit.Clinic.Id, visit.Lab.Id, visit.Pharmacy.Id });
        result.SkippedInvoiceIds.Should().BeEmpty();
        result.Bill.Total.Should().Be(1680.20m);
        result.Bill.DiscountTotal.Should().Be(420.05m);
    }

    [Fact]
    public async Task A_visit_wide_fixed_discount_is_shared_in_proportion_and_adds_up_to_the_cent()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic, StaffRole.Supervisor);

        var result = await ApplyVisitAsync(host, visit.Clinic.Id, new ApplyDiscountRequest(DiscountKind.Promo, DiscountMode.Fixed, 100m, "Goodwill", null));

        result.Bill.DiscountTotal.Should().Be(100m);
        result.Bill.Invoices.Select(i => (i.FacilityId, i.DiscountTotal)).Should().BeEquivalentTo(new[]
        {
            (BillingHost.Clinic, 23.80m), (BillingHost.Lab, 59.54m), (BillingHost.Pharmacy, 16.66m)
        });
    }

    [Fact]
    public async Task A_visit_wide_discount_skips_invoices_that_already_took_a_payment()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();
        await host.PayAsync(visit.Clinic.Id, 100m);

        var result = await ApplyVisitAsync(host, visit.Clinic.Id, Senior());

        result.SkippedInvoiceIds.Should().BeEquivalentTo(new[] { visit.Clinic.Id });
        result.AppliedInvoiceIds.Should().BeEquivalentTo(new[] { visit.Lab.Id, visit.Pharmacy.Id });
        result.Bill.Invoices.Single(i => i.Id == visit.Clinic.Id).DiscountTotal.Should().Be(0m);
    }

    [Fact]
    public async Task A_visit_wide_discount_is_refused_when_nothing_can_take_it_any_more()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();
        await host.PayAsync(visit.Clinic.Id, 2100.25m);

        await FluentActions.Awaiting(() => ApplyVisitAsync(host, visit.Clinic.Id, Senior())).Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task A_discount_after_payment_is_refused_and_a_discounted_invoice_is_paid_at_its_new_total()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();

        await ApplyAsync(host, visit.Clinic.Id, Senior());
        var payment = await host.PayAsync(visit.Clinic.Id, 400m);

        payment.Allocations.Should().ContainSingle().Which.Should().Match<PaymentAllocationDto>(a => a.InvoiceStatus == InvoiceStatus.Paid && a.Amount == 400m);
        await FluentActions.Awaiting(() => ApplyAsync(host, visit.Clinic.Id, new ApplyDiscountRequest(DiscountKind.Pwd, null, null, "PWD", "PWD-9"))).Should().ThrowAsync<ConflictException>();
    }
}
