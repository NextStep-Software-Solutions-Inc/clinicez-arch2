using ClinicEz.Billing.Application.Dtos;
using ClinicEz.Billing.Application.Services;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Billing.Tests.TestSupport;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using static ClinicEz.Billing.Tests.PaymentTests;

namespace ClinicEz.Billing.Tests;

public class TenantAndFacilityIsolationTests
{
    private static async Task<(Visit A, Visit B)> TwoTenantsSameVisitKeyAsync(BillingHost host)
    {
        var a = await ReceiveVisitAsync(host, BillingHost.TenantA);
        var b = await ReceiveVisitAsync(host, BillingHost.TenantB);
        return (a, b);
    }

    [Fact]
    public async Task The_same_visit_key_and_patient_in_two_tenants_never_merge_into_one_bill()
    {
        using var host = new BillingHost();
        var (a, b) = await TwoTenantsSameVisitKeyAsync(host);

        host.As(BillingHost.TenantA, BillingHost.Clinic);
        var billA = await host.With<VisitBillService, VisitBillDto>(s => s.GetAsync(a.Lab.Id, default));
        host.As(BillingHost.TenantB, BillingHost.Clinic);
        var billB = await host.With<VisitBillService, VisitBillDto>(s => s.GetAsync(b.Lab.Id, default));

        billA.Invoices.Select(i => i.Id).Should().BeEquivalentTo(new[] { a.Clinic.Id, a.Lab.Id, a.Pharmacy.Id });
        billB.Invoices.Select(i => i.Id).Should().BeEquivalentTo(new[] { b.Clinic.Id, b.Lab.Id, b.Pharmacy.Id });
        billA.Total.Should().Be(2100.25m);
        billB.Total.Should().Be(2100.25m);
        billA.AnchorInvoiceId.Should().NotBe(billB.AnchorInvoiceId);

        var searchA = await host.With<VisitBillService, IReadOnlyList<VisitBillSummaryDto>>(s => s.SearchAsync(null, "visit-1", null, null, default));
        searchA.Should().ContainSingle().Which.InvoiceCount.Should().Be(3);
    }

    [Fact]
    public async Task A_cashier_of_one_tenant_cannot_read_pay_discount_void_or_refund_another_tenants_invoice()
    {
        using var host = new BillingHost();
        var (_, b) = await TwoTenantsSameVisitKeyAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic, StaffRole.Supervisor);
        await host.OpenShiftAsync();

        await FluentActions.Awaiting(() => host.With<InvoiceService, InvoiceDto>(s => s.GetAsync(b.Clinic.Id, default))).Should().ThrowAsync<NotFoundException>();
        await FluentActions.Awaiting(() => host.With<VisitBillService, VisitBillDto>(s => s.GetAsync(b.Clinic.Id, default))).Should().ThrowAsync<NotFoundException>();
        await FluentActions.Awaiting(() => host.PayAsync(b.Clinic.Id, 100m)).Should().ThrowAsync<NotFoundException>();
        await FluentActions.Awaiting(() => host.With<DiscountService, InvoiceDto>(s => s.ApplyToInvoiceAsync(
            b.Clinic.Id, new ApplyDiscountRequest(DiscountKind.Senior, null, null, "Senior", "SC-1"), default))).Should().ThrowAsync<NotFoundException>();
        await FluentActions.Awaiting(() => host.With<CorrectionService, InvoiceDto>(s => s.VoidAsync(b.Clinic.Id, new VoidRequest("x"), default))).Should().ThrowAsync<NotFoundException>();
        await FluentActions.Awaiting(() => host.With<CorrectionService, RefundDto>(s => s.RefundAsync(b.Clinic.Id, new RefundRequest("x", null), default))).Should().ThrowAsync<NotFoundException>();

        (await host.InvoicesAsync()).Where(i => i.TenantId == BillingHost.TenantB).Should().OnlyContain(i => i.Status == InvoiceStatus.Open && i.PaidTotal == 0m && i.Discounts.Count == 0);
    }

    [Fact]
    public async Task Query_filters_scope_every_read_to_the_callers_tenant_and_fail_closed_without_one()
    {
        using var host = new BillingHost();
        await TwoTenantsSameVisitKeyAsync(host);

        host.As(BillingHost.TenantA, BillingHost.Clinic);
        (await host.Db(db => db.Invoices.CountAsync())).Should().Be(3);
        (await host.Db(db => db.BillingFacilities.CountAsync())).Should().Be(3);

        host.As(BillingHost.TenantB, BillingHost.Clinic);
        (await host.Db(db => db.Invoices.CountAsync())).Should().Be(3);

        host.As(string.Empty, BillingHost.Clinic);
        (await host.Db(db => db.Invoices.CountAsync())).Should().Be(0, "a principal without a tenant sees nothing");

        host.SignOut();
        (await host.Db(db => db.Invoices.CountAsync())).Should().Be(6, "background work (the interop handler) runs without a caller");
    }

    [Fact]
    public async Task Payment_confirmations_stay_inside_the_payers_tenant_and_facility()
    {
        using var host = new BillingHost();
        var (a, _) = await TwoTenantsSameVisitKeyAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();

        await host.PayAsync(a.Clinic.Id, 2100.25m);
        var sent = await host.RelayAsync();

        var confirmations = sent.Where(e => e.Type == InteropTypes.BillingPaymentConfirmed).ToList();
        confirmations.Should().HaveCount(3);
        confirmations.Should().OnlyContain(e => e.To.TenantId == BillingHost.TenantA && e.From.TenantId == BillingHost.TenantA);
        confirmations.Select(e => e.GetPayload<BillingPaymentConfirmedPayload>().InvoiceId)
            .Should().BeEquivalentTo(new[] { a.Clinic.Id, a.Lab.Id, a.Pharmacy.Id });
        (await host.InvoicesAsync()).Where(i => i.TenantId == BillingHost.TenantB).Should().OnlyContain(i => i.Status == InvoiceStatus.Open);
    }

    [Fact]
    public async Task Idempotency_keys_and_document_numbers_are_scoped_per_tenant()
    {
        using var host = new BillingHost();
        var (a, b) = await TwoTenantsSameVisitKeyAsync(host);

        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();
        var paidA = await host.PayAsync(a.Clinic.Id, 100m, key: "shared-key");

        host.As(BillingHost.TenantB, BillingHost.Clinic);
        await host.OpenShiftAsync();
        var paidB = await host.PayAsync(b.Clinic.Id, 100m, key: "shared-key");

        paidB.IsReplay.Should().BeFalse("the key belongs to tenant A's payment, not tenant B's");
        paidB.Id.Should().NotBe(paidA.Id);
        paidA.ReceiptNumber.Should().Be("OR-000001");
        paidB.ReceiptNumber.Should().Be("OR-000001", "each tenant counter has its own receipt book");
        (await host.Db(db => db.Payments.IgnoreQueryFilters().CountAsync())).Should().Be(2);
        a.Clinic.InvoiceNumber.Should().Be(b.Clinic.InvoiceNumber, "invoice books are per tenant and facility");
    }

    [Fact]
    public async Task A_facility_cashier_only_sees_shifts_of_their_own_counter()
    {
        using var host = new BillingHost();
        await ReceiveVisitAsync(host);

        host.As(BillingHost.TenantA, BillingHost.Clinic);
        var clinicShift = await host.OpenShiftAsync();
        host.As(BillingHost.TenantA, BillingHost.Lab);
        await host.OpenShiftAsync();
        host.As(BillingHost.TenantB, BillingHost.Clinic);
        await host.OpenShiftAsync();

        host.As(BillingHost.TenantA, BillingHost.Clinic, StaffRole.Supervisor);
        var shifts = await host.With<ShiftService, IReadOnlyList<ShiftDto>>(s => s.ListAsync(default));

        shifts.Should().OnlyContain(s => s.FacilityId == BillingHost.Clinic);
        shifts.Select(s => s.Id).Should().Contain(clinicShift.Id);
        shifts.Should().HaveCount(1);
    }
}
