using ClinicEz.Billing.Application.Dtos;
using ClinicEz.Billing.Application.Services;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Billing.Tests.TestSupport;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using static ClinicEz.Billing.Tests.PaymentTests;

namespace ClinicEz.Billing.Tests;

public class ReportTests
{
    private const int ManilaOffset = 8 * 60;
    private static readonly DateOnly Mar10 = new(2026, 3, 10);
    private static readonly DateOnly Mar11 = new(2026, 3, 11);

    private static Task<DailyCollectionReport> ReportAsync(BillingHost host, DateOnly from, DateOnly to, int offset = ManilaOffset, string? facilityId = null, string? branchId = null) =>
        host.With<ReportService, DailyCollectionReport>(r => r.DailyCollectionAsync(new DailyCollectionQuery(from, to, offset, string.Empty, facilityId, branchId, null), default));

    /// <summary>Clinic cashier takes 100.00 cash (10:02 local, 10 Mar); the lab cashier takes 200.00 GCash at 01:00 local on 11 Mar.</summary>
    private static async Task<Visit> TakeTwoPaymentsAsync(BillingHost host)
    {
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic, StaffRole.Cashier, "Cora Clinic");
        await host.OpenShiftAsync();
        await host.PayAsync(visit.Clinic.Id, 100m);

        host.Clock.Set(new DateTimeOffset(2026, 3, 10, 17, 0, 0, TimeSpan.Zero));
        host.As(BillingHost.TenantA, BillingHost.Lab, StaffRole.Cashier, "Lenny Lab");
        await host.OpenShiftAsync();
        await host.PayAsync(visit.Clinic.Id, 200m, PaymentMethod.GCash, reference: "GC-1");
        return visit;
    }

    [Fact]
    public async Task Collections_are_split_into_days_by_the_requested_utc_offset()
    {
        using var host = new BillingHost();
        await TakeTwoPaymentsAsync(host);

        var local = await ReportAsync(host, Mar10, Mar11);
        local.Days.Select(d => (d.Date, d.Collected, d.Count)).Should().Equal((Mar10, 100m, 1), (Mar11, 200m, 1));

        var utc = await ReportAsync(host, Mar10, Mar11, offset: 0);
        utc.Days.Select(d => (d.Date, d.Collected)).Should().Equal((Mar10, 300m), (Mar11, 0m));
        local.Collected.Should().Be(300m);
        local.Net.Should().Be(300m);
        local.ReceiptCount.Should().Be(2);
    }

    [Fact]
    public async Task Collections_are_broken_down_by_method_cashier_branch_and_facility()
    {
        using var host = new BillingHost();
        await TakeTwoPaymentsAsync(host);

        var report = await ReportAsync(host, Mar10, Mar11);

        report.ByMethod.Select(b => (b.Key, b.Amount)).Should().Equal((nameof(PaymentMethod.GCash), 200m), (nameof(PaymentMethod.Cash), 100m));
        report.ByCashier.Select(b => (b.Key, b.Amount)).Should().Equal(("Lenny Lab", 200m), ("Cora Clinic", 100m));
        report.ByBranch.Should().ContainSingle().Which.Should().Match<CollectionBucket>(b => b.Key == "branch-1" && b.Amount == 300m && b.Count == 2);
        report.ByFacility.Select(b => (b.Key, b.Amount)).Should().Equal((BillingHost.Lab, 200m), (BillingHost.Clinic, 100m));

        var onlyLab = await ReportAsync(host, Mar10, Mar11, facilityId: BillingHost.Lab);
        onlyLab.Collected.Should().Be(200m);
        (await ReportAsync(host, Mar10, Mar11, branchId: "branch-9")).Collected.Should().Be(0m);
    }

    [Fact]
    public async Task Insurer_settlements_are_reported_apart_from_counter_collections()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();
        await host.PayAsync(visit.Clinic.Id, 100m);
        await host.PayAsync(visit.Clinic.Id, 400m, PaymentMethod.Insurance, reference: "PH-77");

        var report = await ReportAsync(host, Mar10, Mar10);

        report.Collected.Should().Be(100m);
        report.ExternalSettled.Should().Be(400m);
        report.ByMethod.Single(b => b.Key == nameof(PaymentMethod.Insurance)).ExternalAmount.Should().Be(400m);
    }

    [Fact]
    public async Task Refunds_are_subtracted_from_the_net()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();
        await host.PayAsync(visit.Clinic.Id, 500m);

        host.As(BillingHost.TenantA, BillingHost.Clinic, StaffRole.Supervisor);
        await host.OpenShiftAsync();
        await host.With<CorrectionService, RefundDto>(c => c.RefundAsync(visit.Clinic.Id, new RefundRequest("Duplicate charge", null), default));

        var report = await ReportAsync(host, Mar10, Mar10);

        report.Collected.Should().Be(500m);
        report.Refunded.Should().Be(500m);
        report.Net.Should().Be(0m);
        report.Days.Single().Net.Should().Be(0m);
    }

    [Fact]
    public async Task Days_without_activity_are_still_listed()
    {
        using var host = new BillingHost();
        await TakeTwoPaymentsAsync(host);

        var report = await ReportAsync(host, new DateOnly(2026, 3, 8), new DateOnly(2026, 3, 12));

        report.Days.Should().HaveCount(5);
        report.Days.Where(d => d.Count == 0).Select(d => d.Date.Day).Should().Equal(8, 9, 12);
    }

    [Fact]
    public async Task Another_tenants_collections_never_appear()
    {
        using var host = new BillingHost();
        await TakeTwoPaymentsAsync(host);
        var other = await ReceiveVisitAsync(host, BillingHost.TenantB);
        host.As(BillingHost.TenantB, BillingHost.Clinic);
        await host.OpenShiftAsync();
        await host.PayAsync(other.Clinic.Id, 500m);

        var report = await ReportAsync(host, Mar10, Mar11);

        report.Collected.Should().Be(500m);
        report.ByCashier.Should().OnlyContain(b => b.Key != "Lenny Lab");
    }

    [Fact]
    public async Task Invalid_ranges_and_offsets_are_rejected()
    {
        using var host = new BillingHost();
        host.As(BillingHost.TenantA, BillingHost.Clinic);

        await FluentActions.Awaiting(() => ReportAsync(host, Mar11, Mar10)).Should().ThrowAsync<BadRequestException>();
        await FluentActions.Awaiting(() => ReportAsync(host, Mar10, Mar10.AddDays(366))).Should().ThrowAsync<BadRequestException>();
        await FluentActions.Awaiting(() => ReportAsync(host, Mar10, Mar10, offset: 15 * 60)).Should().ThrowAsync<BadRequestException>();
        (await ReportAsync(host, Mar10, Mar10.AddDays(365))).Days.Should().HaveCount(366);
    }

    [Fact]
    public async Task Reports_and_the_audit_trail_need_a_signed_in_staff_member()
    {
        using var host = new BillingHost();
        host.SignOut();

        await FluentActions.Awaiting(() => ReportAsync(host, Mar10, Mar10)).Should().ThrowAsync<ForbiddenException>();
        await FluentActions.Awaiting(() => host.With<ReportService, IReadOnlyList<AuditEntryDto>>(r => r.AuditAsync(null, null, 50, default))).Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task The_audit_trail_lists_newest_first_filters_by_entity_and_stays_inside_the_tenant()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        var other = await ReceiveVisitAsync(host, BillingHost.TenantB);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();
        host.Clock.Advance(TimeSpan.FromMinutes(5));
        await host.PayAsync(visit.Clinic.Id, 100m);
        host.As(BillingHost.TenantB, BillingHost.Clinic);
        await host.OpenShiftAsync();
        await host.PayAsync(other.Clinic.Id, 100m);

        host.As(BillingHost.TenantA, BillingHost.Clinic, StaffRole.Supervisor);
        var all = await host.With<ReportService, IReadOnlyList<AuditEntryDto>>(r => r.AuditAsync(null, null, 100, default));
        var paymentsOnly = await host.With<ReportService, IReadOnlyList<AuditEntryDto>>(r => r.AuditAsync("Payment", null, 100, default));

        all.Should().NotBeEmpty();
        all.Select(a => a.AtUtc).Should().BeInDescendingOrder();
        all.Should().NotContain(a => a.EntityId == other.Clinic.Id);
        paymentsOnly.Should().ContainSingle().Which.Action.Should().Be("payment.taken");
    }
}
