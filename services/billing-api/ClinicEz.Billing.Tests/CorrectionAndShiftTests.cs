using ClinicEz.Billing.Application.Dtos;
using ClinicEz.Billing.Application.Services;
using ClinicEz.Billing.Domain.Entities;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Billing.Tests.TestSupport;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using static ClinicEz.Billing.Tests.PaymentTests;

namespace ClinicEz.Billing.Tests;

public class VoidAndRefundTests
{
    private static Task<InvoiceDto> VoidAsync(BillingHost host, Guid invoiceId, string reason) =>
        host.With<CorrectionService, InvoiceDto>(c => c.VoidAsync(invoiceId, new VoidRequest(reason), default));

    private static Task<RefundDto> RefundAsync(BillingHost host, Guid invoiceId, string reason, PaymentMethod? method = null) =>
        host.With<CorrectionService, RefundDto>(c => c.RefundAsync(invoiceId, new RefundRequest(reason, method), default));

    [Fact]
    public async Task Voiding_an_unpaid_invoice_removes_it_from_the_visit_audits_it_and_tells_only_the_requesting_facility()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        var supervisor = host.As(BillingHost.TenantA, BillingHost.Clinic, StaffRole.Supervisor, "Sup Visor");

        var voided = await VoidAsync(host, visit.Pharmacy.Id, "Wrong patient");

        voided.Status.Should().Be(InvoiceStatus.Void);
        (await host.With<VisitBillService, VisitBillDto>(s => s.GetAsync(visit.Clinic.Id, default))).Total.Should().Be(1750.50m);

        var audit = (await host.AuditAsync()).Single(a => a.Action == "invoice.voided");
        audit.ActorName.Should().Be("Sup Visor");
        audit.ActorUserId.Should().Be(supervisor.UserId);
        audit.EntityId.Should().Be(visit.Pharmacy.Id);
        audit.Details.Should().Contain("Wrong patient");

        var outbox = await host.OutboxAsync();
        var message = outbox.Should().ContainSingle(o => o.Type == InteropTypes.BillingInvoiceVoided, "an unpaid invoice never reached the portal rollup").Subject;
        var envelope = Envelope(message);
        envelope.To.FacilityId.Should().Be(BillingHost.Pharmacy);
        envelope.CorrelationId.Should().Be(visit.Pharmacy.InvoiceRequestId!.Value);
        var payload = Payload<BillingInvoiceVoidedPayload>(message);
        payload.Kind.Should().Be(BillingCorrectionKind.Void);
        payload.WasFullyPaid.Should().BeFalse();
        payload.AmountReversed.Should().Be(0m);
    }

    [Fact]
    public async Task A_void_needs_a_reason_and_is_refused_once_money_was_taken()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic, StaffRole.Supervisor);
        await host.OpenShiftAsync();
        await host.PayAsync(visit.Clinic.Id, 100m);

        await FluentActions.Awaiting(() => VoidAsync(host, visit.Pharmacy.Id, " ")).Should().ThrowAsync<BadRequestException>();
        await FluentActions.Awaiting(() => VoidAsync(host, visit.Clinic.Id, "Changed my mind")).Should().ThrowAsync<ConflictException>();
        (await host.AuditAsync()).Should().NotContain(a => a.Action == "invoice.voided");
    }

    [Fact]
    public async Task Refunding_a_fully_paid_invoice_reverses_it_from_the_supervisors_drawer_and_corrects_the_portal()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();
        await host.PayAsync(visit.Clinic.Id, 500m);

        var supervisor = host.As(BillingHost.TenantA, BillingHost.Clinic, StaffRole.Supervisor, "Sup Visor");
        var shift = await host.OpenShiftAsync(2000m);
        var refund = await RefundAsync(host, visit.Clinic.Id, "Service not rendered");

        refund.Amount.Should().Be(500m);
        refund.Method.Should().Be(PaymentMethod.Cash);
        refund.ApprovedByName.Should().Be("Sup Visor");
        var invoice = await host.InvoiceAsync(visit.Clinic.Id);
        invoice.Status.Should().Be(InvoiceStatus.Refunded);
        invoice.RefundedTotal.Should().Be(500m);
        (await host.Db(db => db.Refunds.IgnoreQueryFilters().SingleAsync())).Should().Match<Refund>(r => r.ShiftId == shift.Id && r.ApprovedByUserId == supervisor.UserId);

        var voidedMessages = (await host.OutboxAsync()).Where(o => o.Type == InteropTypes.BillingInvoiceVoided).ToList();
        voidedMessages.Should().HaveCount(2);
        voidedMessages.Select(m => Envelope(m).To).Should().Contain(to => to.Kind == PartyKind.ControlPlane && to.Service == InteropServices.Portal)
            .And.Contain(to => to.FacilityId == BillingHost.Clinic);
        voidedMessages.Select(Payload<BillingInvoiceVoidedPayload>).Should().OnlyContain(p => p.Kind == BillingCorrectionKind.Refund && p.WasFullyPaid && p.AmountReversed == 500m);
        (await host.AuditAsync()).Should().ContainSingle(a => a.Action == "invoice.refunded" && a.ActorName == "Sup Visor" && a.Details.Contains("Service not rendered"));

        var closed = await host.With<ShiftService, ShiftDto>(s => s.CloseAsync(shift.Id, new CloseShiftRequest(1500m, null), default));
        closed.ExpectedCash.Should().Be(1500m, "the refunded cash left the drawer");
        closed.Variance.Should().Be(0m);
        closed.CashRefunded.Should().Be(500m);
    }

    [Fact]
    public async Task Refunding_a_partly_paid_invoice_tells_the_facility_but_not_the_portal()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic, StaffRole.Supervisor);
        await host.OpenShiftAsync();
        await host.PayAsync(visit.Clinic.Id, 700m);

        var refund = await RefundAsync(host, visit.Lab.Id, "Test cancelled");

        refund.Amount.Should().Be(200m);
        var voided = (await host.OutboxAsync()).Where(o => o.Type == InteropTypes.BillingInvoiceVoided).ToList();
        voided.Should().ContainSingle();
        Envelope(voided[0]).To.FacilityId.Should().Be(BillingHost.Lab);
        Payload<BillingInvoiceVoidedPayload>(voided[0]).WasFullyPaid.Should().BeFalse();
    }

    [Fact]
    public async Task A_cash_refund_needs_an_open_shift_but_a_cashless_refund_returns_by_the_original_method()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();
        await host.PayAsync(visit.Clinic.Id, 500m);
        await host.PayAsync(visit.Lab.Id, 100m, PaymentMethod.GCash, reference: "GC-77");

        var noShift = host.As(BillingHost.TenantA, BillingHost.Clinic, StaffRole.Supervisor);
        noShift.Role.Should().Be(StaffRole.Supervisor);

        await FluentActions.Awaiting(() => RefundAsync(host, visit.Clinic.Id, "Duplicate charge")).Should().ThrowAsync<ConflictException>();
        (await host.InvoiceAsync(visit.Clinic.Id)).Status.Should().Be(InvoiceStatus.Paid);

        var gcash = await RefundAsync(host, visit.Lab.Id, "Duplicate charge");
        gcash.Method.Should().Be(PaymentMethod.GCash);
    }

    [Fact]
    public async Task A_refund_needs_a_reason_and_a_payment_to_give_back()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic, StaffRole.Supervisor);
        await host.OpenShiftAsync();
        await host.PayAsync(visit.Clinic.Id, 100m);

        await FluentActions.Awaiting(() => RefundAsync(host, visit.Pharmacy.Id, "Nothing paid")).Should().ThrowAsync<ConflictException>();
        await FluentActions.Awaiting(() => RefundAsync(host, visit.Clinic.Id, "")).Should().ThrowAsync<BadRequestException>();
        (await host.Db(db => db.Refunds.IgnoreQueryFilters().CountAsync())).Should().Be(0);
    }

    [Fact]
    public async Task The_audit_trail_of_an_invoice_lists_who_did_what_newest_first()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic, StaffRole.Supervisor);
        await host.OpenShiftAsync();
        host.Clock.Advance(TimeSpan.FromMinutes(5));
        await host.PayAsync(visit.Clinic.Id, 500m);
        host.Clock.Advance(TimeSpan.FromMinutes(5));
        await RefundAsync(host, visit.Clinic.Id, "Wrong bill", PaymentMethod.Cash);

        var trail = await host.With<ReportService, IReadOnlyList<AuditEntryDto>>(r => r.AuditAsync(nameof(Invoice), visit.Clinic.Id, 50, default));

        trail.Select(a => a.Action).Should().Equal("invoice.refunded", "invoice.requested");
    }
}

public class AuditImmutabilityTests
{
    private static AuditEntry NewEntry() => new()
    {
        Id = Guid.NewGuid(), TenantId = BillingHost.TenantA, AtUtc = DateTime.UtcNow, ActorName = "x", Action = "test", EntityType = "Invoice", EntityId = Guid.NewGuid(), Details = "{}"
    };

    [Fact]
    public async Task An_audit_entry_can_be_appended_but_never_changed_or_deleted()
    {
        using var host = new BillingHost();
        var entry = NewEntry();
        await host.Db(async db =>
        {
            db.AuditEntries.Add(entry);
            return await db.SaveChangesAsync();
        });

        await FluentActions.Awaiting(() => host.Db(async db =>
        {
            var stored = await db.AuditEntries.IgnoreQueryFilters().SingleAsync();
            stored.Details = "tampered";
            return await db.SaveChangesAsync();
        })).Should().ThrowAsync<InvalidOperationException>();

        await FluentActions.Awaiting(() => host.Db(async db =>
        {
            db.AuditEntries.Remove(await db.AuditEntries.IgnoreQueryFilters().SingleAsync());
            return await db.SaveChangesAsync();
        })).Should().ThrowAsync<InvalidOperationException>();

        (await host.AuditAsync()).Should().ContainSingle().Which.Details.Should().Be("{}");
    }
}

public class ShiftTests
{
    [Fact]
    public async Task Only_one_shift_can_be_open_per_cashier_and_current_is_empty_without_one()
    {
        using var host = new BillingHost();
        host.As(BillingHost.TenantA, BillingHost.Clinic);

        (await host.With<ShiftService, ShiftDto?>(s => s.CurrentAsync(default))).Should().BeNull();
        var shift = await host.OpenShiftAsync(500m);
        await FluentActions.Awaiting(() => host.OpenShiftAsync()).Should().ThrowAsync<ConflictException>();

        (await host.With<ShiftService, ShiftDto?>(s => s.CurrentAsync(default)))!.Id.Should().Be(shift.Id);
        (await host.AuditAsync()).Should().ContainSingle(a => a.Action == "shift.opened");
    }

    [Fact]
    public async Task Closing_with_a_shortage_needs_an_explanation_and_stores_the_variance()
    {
        using var host = new BillingHost();
        var visit = await ReceiveVisitAsync(host);
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        var shift = await host.OpenShiftAsync(1000m);
        await host.PayAsync(visit.Clinic.Id, 400m);
        await host.PayAsync(visit.Clinic.Id, 100m, PaymentMethod.Card, reference: "CARD-1");

        await FluentActions.Awaiting(() => host.With<ShiftService, ShiftDto>(s => s.CloseAsync(shift.Id, new CloseShiftRequest(1350m, null), default)))
            .Should().ThrowAsync<BadRequestException>();
        (await host.With<ShiftService, ShiftDto?>(s => s.CurrentAsync(default)))!.Status.Should().Be(ShiftStatus.Open);

        var closed = await host.With<ShiftService, ShiftDto>(s => s.CloseAsync(shift.Id, new CloseShiftRequest(1350m, "Gave 50 change twice"), default));

        closed.Status.Should().Be(ShiftStatus.Closed);
        closed.CashCollected.Should().Be(400m);
        closed.NonCashCollected.Should().Be(100m);
        closed.ExpectedCash.Should().Be(1400m);
        closed.CountedCash.Should().Be(1350m);
        closed.Variance.Should().Be(-50m);
        closed.CloseNotes.Should().Be("Gave 50 change twice");
        (await host.AuditAsync()).Should().ContainSingle(a => a.Action == "shift.closed" && a.Details.Contains("-50"));
        await FluentActions.Awaiting(() => host.With<ShiftService, ShiftDto>(s => s.CloseAsync(shift.Id, new CloseShiftRequest(1350m, "again"), default)))
            .Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task A_matching_count_closes_with_zero_variance()
    {
        using var host = new BillingHost();
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        var shift = await host.OpenShiftAsync(750m);

        var closed = await host.With<ShiftService, ShiftDto>(s => s.CloseAsync(shift.Id, new CloseShiftRequest(750m, null), default));

        closed.Variance.Should().Be(0m);
    }

    [Fact]
    public async Task A_drawer_is_closed_by_its_cashier_or_a_supervisor_of_the_same_counter_only()
    {
        using var host = new BillingHost();
        host.As(BillingHost.TenantA, BillingHost.Clinic, StaffRole.Cashier, "Owner");
        var shift = await host.OpenShiftAsync();
        Task<ShiftDto> Close() => host.With<ShiftService, ShiftDto>(s => s.CloseAsync(shift.Id, new CloseShiftRequest(1000m, null), default));

        host.As(BillingHost.TenantA, BillingHost.Clinic, StaffRole.Cashier, "Colleague");
        await FluentActions.Awaiting(Close).Should().ThrowAsync<ForbiddenException>();

        host.As(BillingHost.TenantA, BillingHost.Lab, StaffRole.Supervisor, "Other counter supervisor");
        await FluentActions.Awaiting(Close).Should().ThrowAsync<NotFoundException>();

        host.As(BillingHost.TenantB, BillingHost.Clinic, StaffRole.Supervisor, "Other tenant supervisor");
        await FluentActions.Awaiting(Close).Should().ThrowAsync<NotFoundException>();

        host.As(BillingHost.TenantA, BillingHost.Clinic, StaffRole.Supervisor, "Counter supervisor");
        (await Close()).Status.Should().Be(ShiftStatus.Closed);
    }

    [Fact]
    public async Task Shift_lists_only_show_the_counter_of_the_caller()
    {
        using var host = new BillingHost();
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();
        host.As(BillingHost.TenantA, BillingHost.Lab);
        await host.OpenShiftAsync();

        var labShifts = await host.With<ShiftService, IReadOnlyList<ShiftDto>>(s => s.ListAsync(default));

        labShifts.Should().ContainSingle().Which.FacilityId.Should().Be(BillingHost.Lab);
    }
}
