using ClinicEz.Billing.Application.Dtos;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Billing.Tests.TestSupport;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Billing.Tests;

public class InvoiceRequestedHandlerTests
{
    private static async Task<int> SequenceCountAsync(BillingHost host) => await host.Db(db => db.DocumentSequences.IgnoreQueryFilters().CountAsync());

    [Fact]
    public async Task A_request_creates_a_numbered_invoice_registers_the_facility_and_audits_it()
    {
        using var host = new BillingHost();
        var payload = BillingHost.Request(
            BillingHost.TenantA, BillingHost.Lab, FacilityType.Laboratory, lines: new[] { BillingHost.Line("CBC", "Complete blood count", 2, 250.50m), BillingHost.Line("UA", "Urinalysis", 1, 100m) });

        var invoice = await host.ReceiveAsync(payload);

        invoice.InvoiceNumber.Should().Be("INV-000001");
        invoice.Origin.Should().Be(InvoiceOrigin.Requested);
        invoice.Status.Should().Be(InvoiceStatus.Open);
        invoice.Total.Should().Be(601m);
        invoice.Lines.Should().HaveCount(2);
        invoice.FacilityType.Should().Be(FacilityType.Laboratory);
        (await host.Db(db => db.BillingFacilities.IgnoreQueryFilters().ToListAsync())).Should().ContainSingle(f => f.FacilityId == BillingHost.Lab && f.FacilityType == FacilityType.Laboratory);
        (await host.AuditAsync()).Should().ContainSingle(a => a.Action == "invoice.requested" && a.EntityId == invoice.Id && a.ActorName == "system:interop");
        (await host.OutboxAsync()).Should().BeEmpty("an unpaid invoice has nothing to confirm yet");
    }

    [Fact]
    public async Task The_same_message_delivered_twice_creates_one_invoice_and_burns_one_number()
    {
        using var host = new BillingHost();
        var envelope = BillingHost.Envelope(BillingHost.Request(BillingHost.TenantA, BillingHost.Clinic, FacilityType.Clinic));

        (await host.Dispatcher.DispatchAsync(envelope, default)).Outcome.Should().Be(DispatchOutcome.Handled);
        (await host.Dispatcher.DispatchAsync(envelope, default)).Outcome.Should().Be(DispatchOutcome.Duplicate);

        (await host.InvoicesAsync()).Should().ContainSingle();
        (await host.Db(db => db.DocumentSequences.IgnoreQueryFilters().SingleAsync())).LastValue.Should().Be(1);
    }

    [Fact]
    public async Task The_same_request_resent_under_a_new_message_id_replaces_the_lines_but_keeps_the_invoice_and_its_number()
    {
        using var host = new BillingHost();
        var requestId = Guid.NewGuid();
        var first = await host.ReceiveAsync(BillingHost.Request(BillingHost.TenantA, BillingHost.Lab, FacilityType.Laboratory, requestId, lines: new[] { BillingHost.Line("CBC", "CBC", 1, 250m) }));

        var resent = await host.ReceiveAsync(BillingHost.Request(
            BillingHost.TenantA, BillingHost.Lab, FacilityType.Laboratory, requestId, lines: new[] { BillingHost.Line("CBC", "CBC", 1, 250m), BillingHost.Line("UA", "Urinalysis", 1, 100m) }));

        resent.Id.Should().Be(first.Id);
        resent.InvoiceNumber.Should().Be(first.InvoiceNumber);
        resent.Total.Should().Be(350m);
        resent.Lines.Should().HaveCount(2);
        (await host.InvoicesAsync()).Should().ContainSingle();
        (await host.AuditAsync()).Select(a => a.Action).Should().Equal("invoice.requested", "invoice.updated");
    }

    [Fact]
    public async Task A_resent_request_after_a_payment_is_ignored_and_never_rewrites_the_ledger()
    {
        using var host = new BillingHost();
        var requestId = Guid.NewGuid();
        var invoice = await host.ReceiveAsync(BillingHost.Request(BillingHost.TenantA, BillingHost.Clinic, FacilityType.Clinic, requestId, lines: new[] { BillingHost.Line("C", "Consult", 1, 500m) }));
        host.As(BillingHost.TenantA, BillingHost.Clinic);
        await host.OpenShiftAsync();
        await host.PayAsync(invoice.Id, 100m);

        await host.ReceiveAsync(BillingHost.Request(BillingHost.TenantA, BillingHost.Clinic, FacilityType.Clinic, requestId, lines: new[] { BillingHost.Line("C", "Consult", 1, 9999m) }));

        var after = await host.InvoiceAsync(invoice.Id);
        after.Total.Should().Be(500m);
        after.PaidTotal.Should().Be(100m);
        after.Lines.Should().ContainSingle(l => l.UnitPrice == 500m);
    }

    [Fact]
    public async Task The_same_request_id_from_two_facilities_of_one_tenant_makes_two_separate_invoices()
    {
        using var host = new BillingHost();
        var requestId = Guid.NewGuid();

        await host.ReceiveAsync(BillingHost.Request(BillingHost.TenantA, BillingHost.Clinic, FacilityType.Clinic, requestId));
        await host.ReceiveAsync(BillingHost.Request(BillingHost.TenantA, BillingHost.Lab, FacilityType.Laboratory, requestId));

        (await host.InvoicesAsync()).Select(i => i.FacilityId).Should().BeEquivalentTo(BillingHost.Clinic, BillingHost.Lab);
    }

    [Fact]
    public async Task A_message_whose_sender_is_not_the_facility_in_the_payload_is_ignored_without_leaving_state_behind()
    {
        using var host = new BillingHost();
        var payload = BillingHost.Request(BillingHost.TenantA, BillingHost.Lab, FacilityType.Laboratory);
        var spoofed = InteropEnvelope.Create(
            InteropTypes.BillingInvoiceRequested,
            Party.ForFacility(BillingHost.TenantA, BillingHost.Clinic, FacilityType.Clinic),
            Party.ForFacility(BillingHost.TenantA, BillingHost.Lab, FacilityType.Laboratory, InteropServices.Billing),
            payload.InvoiceRequestId, payload);

        (await host.Dispatcher.DispatchAsync(spoofed, default)).ShouldAck.Should().BeTrue();

        (await host.InvoicesAsync()).Should().BeEmpty();
        (await SequenceCountAsync(host)).Should().Be(0);
    }

    [Fact]
    public async Task A_sender_claiming_another_tenant_in_the_payload_is_ignored()
    {
        using var host = new BillingHost();
        var payload = BillingHost.Request(BillingHost.TenantB, BillingHost.Clinic, FacilityType.Clinic);
        var envelope = InteropEnvelope.Create(
            InteropTypes.BillingInvoiceRequested,
            Party.ForFacility(BillingHost.TenantA, BillingHost.Clinic, FacilityType.Clinic),
            Party.ForFacility(BillingHost.TenantA, BillingHost.Clinic, FacilityType.Clinic, InteropServices.Billing),
            payload.InvoiceRequestId, payload);

        (await host.Dispatcher.DispatchAsync(envelope, default)).ShouldAck.Should().BeTrue();

        (await host.InvoicesAsync()).Should().BeEmpty();
    }

    [Fact]
    public async Task A_message_not_addressed_to_the_senders_own_billing_mailbox_is_ignored()
    {
        using var host = new BillingHost();
        var payload = BillingHost.Request(BillingHost.TenantA, BillingHost.Clinic, FacilityType.Clinic);
        var misaddressed = InteropEnvelope.Create(
            InteropTypes.BillingInvoiceRequested,
            Party.ForFacility(BillingHost.TenantA, BillingHost.Clinic, FacilityType.Clinic),
            Party.ForFacility(BillingHost.TenantA, BillingHost.Clinic, FacilityType.Clinic),
            payload.InvoiceRequestId, payload);
        var otherTenant = InteropEnvelope.Create(
            InteropTypes.BillingInvoiceRequested,
            Party.ForFacility(BillingHost.TenantA, BillingHost.Clinic, FacilityType.Clinic),
            Party.ForFacility(BillingHost.TenantB, BillingHost.Clinic, FacilityType.Clinic, InteropServices.Billing),
            payload.InvoiceRequestId, payload);

        (await host.Dispatcher.DispatchAsync(misaddressed, default)).ShouldAck.Should().BeTrue();
        (await host.Dispatcher.DispatchAsync(otherTenant, default)).ShouldAck.Should().BeTrue();

        (await host.InvoicesAsync()).Should().BeEmpty();
    }

    [Fact]
    public async Task A_payload_whose_facility_type_contradicts_the_sender_is_ignored()
    {
        using var host = new BillingHost();
        var payload = BillingHost.Request(BillingHost.TenantA, BillingHost.Clinic, FacilityType.Pharmacy);
        var envelope = InteropEnvelope.Create(
            InteropTypes.BillingInvoiceRequested,
            Party.ForFacility(BillingHost.TenantA, BillingHost.Clinic, FacilityType.Clinic),
            Party.ForFacility(BillingHost.TenantA, BillingHost.Clinic, FacilityType.Clinic, InteropServices.Billing),
            payload.InvoiceRequestId, payload);

        (await host.Dispatcher.DispatchAsync(envelope, default)).ShouldAck.Should().BeTrue();

        (await host.InvoicesAsync()).Should().BeEmpty();
    }

    [Fact]
    public async Task A_request_without_an_invoice_request_id_is_ignored()
    {
        using var host = new BillingHost();
        var payload = BillingHost.Request(BillingHost.TenantA, BillingHost.Clinic, FacilityType.Clinic) with { InvoiceRequestId = Guid.Empty };

        (await host.Dispatcher.DispatchAsync(BillingHost.Envelope(payload), default)).ShouldAck.Should().BeTrue();

        (await host.InvoicesAsync()).Should().BeEmpty();
    }

    [Fact]
    public async Task Malformed_lines_are_acknowledged_not_redelivered_and_burn_no_number()
    {
        using var host = new BillingHost();
        var payload = BillingHost.Request(BillingHost.TenantA, BillingHost.Clinic, FacilityType.Clinic, lines: new[] { BillingHost.Line("X", "Broken", 0, 10m) });

        var result = await host.Dispatcher.DispatchAsync(BillingHost.Envelope(payload), default);

        result.Outcome.Should().Be(DispatchOutcome.Handled);
        (await host.InvoicesAsync()).Should().BeEmpty();
        (await SequenceCountAsync(host)).Should().Be(0);
    }

    [Fact]
    public async Task An_invoice_with_nothing_to_collect_is_settled_on_arrival_and_the_facility_is_told()
    {
        using var host = new BillingHost();
        var payload = BillingHost.Request(BillingHost.TenantA, BillingHost.Clinic, FacilityType.Clinic, sourceType: "FollowUp", lines: new[] { BillingHost.Line("FU", "Free follow-up", 1, 0m) });

        var invoice = await host.ReceiveAsync(payload);

        invoice.Status.Should().Be(InvoiceStatus.Paid);
        var outbox = await host.OutboxAsync();
        var message = outbox.Should().ContainSingle().Subject;
        message.Type.Should().Be(InteropTypes.BillingPaymentConfirmed);
        message.CorrelationId.Should().Be(payload.InvoiceRequestId);
        var confirmed = InteropEnvelope.FromJson(message.EnvelopeJson).GetPayload<BillingPaymentConfirmedPayload>();
        confirmed.FullyPaid.Should().BeTrue();
        confirmed.AmountDue.Should().Be(0m);
    }

    [Fact]
    public async Task Different_facilities_have_independent_invoice_number_books()
    {
        using var host = new BillingHost();

        var clinic = await host.ReceiveAsync(BillingHost.TenantA, BillingHost.Clinic, FacilityType.Clinic, "v", 100m);
        var lab = await host.ReceiveAsync(BillingHost.TenantA, BillingHost.Lab, FacilityType.Laboratory, "v", 100m);
        var clinic2 = await host.ReceiveAsync(BillingHost.TenantA, BillingHost.Clinic, FacilityType.Clinic, "v2", 100m);

        clinic.InvoiceNumber.Should().Be("INV-000001");
        lab.InvoiceNumber.Should().Be("INV-000001");
        clinic2.InvoiceNumber.Should().Be("INV-000002");
    }

    [Fact]
    public void The_handler_is_registered_for_exactly_the_requested_message_type()
    {
        using var host = new BillingHost();

        host.Provider.GetService(typeof(InteropHandlerRegistry)).Should().BeOfType<InteropHandlerRegistry>()
            .Which.RegisteredTypes.Should().Contain(InteropTypes.BillingInvoiceRequested);
    }
}
