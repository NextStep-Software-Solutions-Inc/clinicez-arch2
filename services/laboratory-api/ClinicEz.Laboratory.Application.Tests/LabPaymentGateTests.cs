using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Common.Exceptions;
using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Laboratory.Application.Features.Analytes.Commands;
using ClinicEz.Laboratory.Application.Features.Reports.Commands;
using ClinicEz.Laboratory.Application.Features.Requisitions.Commands;
using ClinicEz.Laboratory.Application.Interop;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Laboratory.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ClinicEz.Laboratory.Application.Tests;

/// <summary>
/// The laboratory's payment gate, stage announcements, claim-by-QR and result documents, driven through the real
/// handlers, the in-process hub and an in-memory database.
/// </summary>
public class LabPaymentGateTests
{
    private static readonly Party Billing = LabInteropTestData.LabBilling;

    private static async Task SeedCatalogueAsync(LabInteropHost host) => await host.WithDbAsync(async db =>
    {
        db.Products.Add(new Product { Id = Guid.NewGuid(), Name = "Fasting Blood Sugar", Sku = "FBS", Price = 150m, TenantId = LabInteropTestData.LabTenant, LaboratoryId = LabInteropTestData.LabId });
        // Another tenant's laboratory prices the same test differently: it must never be used for this laboratory's quote.
        db.Products.Add(new Product { Id = Guid.NewGuid(), Name = "Fasting Blood Sugar", Sku = "FBS", Price = 999m, TenantId = LabInteropTestData.OtherLabTenant, LaboratoryId = LabInteropTestData.OtherLabId });
        await db.SaveChangesAsync();
        return 0;
    });

    internal static async Task<LabRequisition> OrderAsync(
        LabInteropHost host, PaymentPolicy policy, string accession = "ACC-P1", Guid? patientId = null, bool routed = true)
    {
        await host.SeedLabAsync(policy);
        await SeedCatalogueAsync(host);
        var order = LabInteropTestData.Order(
            accession, targetFacilityId: routed ? LabInteropTestData.LabId.ToString() : null, patientId: patientId);
        var result = await host.Dispatcher.DispatchAsync(LabInteropTestData.OrderEnvelope(order, LabInteropTestData.ClinicA), default);
        result.Outcome.Should().Be(DispatchOutcome.Handled);
        return (await host.RequisitionsAsync()).Single();
    }

    internal static Task<int> AccessionAsync(LabInteropHost host, Guid requisitionId) => host.InLabScopeAsync(async sp =>
    {
        var handler = new AccessionSpecimenCommandHandler(
            sp.GetRequiredService<IRepository<LabRequisition>>(),
            sp.GetRequiredService<IUnitOfWork>(),
            sp.GetRequiredService<ILabOrderLifecycle>());
        await handler.Handle(new AccessionSpecimenCommand(requisitionId, "Phlebotomist Ann", new List<SpecimenAccessionInput>()), CancellationToken.None);
        return 0;
    });

    internal static Task<int> RecordResultAsync(LabInteropHost host, Guid requisitionId) => host.InLabScopeAsync(async sp =>
    {
        var handler = new RecordAnalyteResultCommandHandler(
            sp.GetRequiredService<IRepository<LabRequisition>>(),
            sp.GetRequiredService<IUnitOfWork>(),
            sp.GetRequiredService<ILabOrderLifecycle>());
        await handler.Handle(new RecordAnalyteResultCommand(
            requisitionId, "Carlos RMT", new List<AnalyteResultInput> { new() { AnalyteCode = "FBS", Value = "5.0", Unit = "mmol/L" } }), CancellationToken.None);
        return 0;
    });

    private static Task<int> FinalizeAsync(LabInteropHost host, Guid requisitionId) => host.InLabScopeAsync(async sp =>
    {
        var handler = new VerifyAndSignReportCommandHandler(
            sp.GetRequiredService<IRepository<LabRequisition>>(),
            sp.GetRequiredService<IUnitOfWork>(),
            sp.GetRequiredService<IDiagnosticReportPublisher>(),
            new DiagnosticReportPdfGenerator(),
            new ClinicEz.Laboratory.Application.Common.LabPrintoutConfigProvider(sp.GetRequiredService<IRepository<LabSettings>>()),
            sp.GetRequiredService<ILabOrderLifecycle>());
        await handler.Handle(new VerifyAndSignReportCommand(
            requisitionId, "Dr. Pathologist", "PRC-1", "Med Tech", "PRC-2", "ok", "JVBERi0xLjQK"), CancellationToken.None);
        return 0;
    });

    internal static async Task<List<LabOrderStatusChangedPayload>> StatusesToAsync(LabInteropHost host, Party to)
    {
        await host.Relay.RunOnceAsync(default);
        return host.Hub.Sent
            .Where(m => m.Type == InteropTypes.LabOrderStatusChanged && m.To == to)
            .Select(m => m.GetPayload<LabOrderStatusChangedPayload>())
            .ToList();
    }

    private static async Task<DispatchResult> PayAsync(LabInteropHost host, Guid requisitionId) =>
        await host.Dispatcher.DispatchAsync(LabInteropTestData.PaymentConfirmedEnvelope(requisitionId), default);

    // ── prepaid ────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Prepaid_order_is_quoted_from_its_own_catalogue_invoiced_and_waits_for_payment()
    {
        using var host = new LabInteropHost();

        var requisition = await OrderAsync(host, PaymentPolicy.Prepaid);

        requisition.Stage.Should().Be(RequisitionStage.AwaitingPayment);
        requisition.PaymentPolicy.Should().Be(PaymentPolicy.Prepaid);
        requisition.QuotedAmount.Should().Be(150m, "the other tenant's price for the same SKU must not leak into this quote");
        requisition.Currency.Should().Be("PHP");
        requisition.IsPaymentBlocking.Should().BeTrue();

        await host.Relay.RunOnceAsync(default);
        var invoice = host.Hub.Sent.Single(m => m.Type == InteropTypes.BillingInvoiceRequested);
        invoice.From.Should().Be(LabInteropTestData.Lab);
        invoice.To.Should().Be(Billing);
        invoice.CorrelationId.Should().Be(requisition.Id);
        var payload = invoice.GetPayload<BillingInvoiceRequestedPayload>();
        payload.InvoiceRequestId.Should().Be(requisition.Id);
        payload.TenantId.Should().Be(LabInteropTestData.LabTenant);
        payload.FacilityId.Should().Be(LabInteropTestData.LabId.ToString());
        payload.FacilityType.Should().Be(FacilityType.Laboratory);
        payload.SourceType.Should().Be("LabOrder");
        payload.SourceId.Should().Be(requisition.CorrelationId!.Value);
        payload.PatientId.Should().Be(requisition.PatientId);
        payload.Lines.Should().ContainSingle().Which.Should().Match<BillingLineDto>(l => l.Code == "FBS" && l.UnitPrice == 150m && l.Quantity == 1);
    }

    [Fact]
    public async Task Prepaid_order_blocks_collection_and_processing_until_the_cashier_confirms_payment()
    {
        using var host = new LabInteropHost();
        var requisition = await OrderAsync(host, PaymentPolicy.Prepaid);

        Func<Task> collect = () => AccessionAsync(host, requisition.Id);
        Func<Task> process = () => RecordResultAsync(host, requisition.Id);
        (await collect.Should().ThrowAsync<PaymentRequiredException>()).Which.RequisitionId.Should().Be(requisition.Id);
        await process.Should().ThrowAsync<PaymentRequiredException>();
        var blocked = (await host.RequisitionsAsync()).Single();
        blocked.Stage.Should().Be(RequisitionStage.AwaitingPayment);
        blocked.Status.Should().Be(RequisitionStatus.PendingAccession);

        (await PayAsync(host, requisition.Id)).Outcome.Should().Be(DispatchOutcome.Handled);
        var paid = (await host.RequisitionsAsync()).Single();
        paid.Stage.Should().Be(RequisitionStage.Paid);
        paid.PaidAtUtc.Should().NotBeNull();
        paid.ReceiptNumber.Should().Be("OR-0001");
        paid.InvoiceId.Should().NotBeNull();
        paid.IsPaymentBlocking.Should().BeFalse();

        await AccessionAsync(host, requisition.Id);
        (await host.RequisitionsAsync()).Single().Stage.Should().Be(RequisitionStage.SpecimenCollected);
        await RecordResultAsync(host, requisition.Id);
        (await host.RequisitionsAsync()).Single().Stage.Should().Be(RequisitionStage.InProcess);
    }

    [Fact]
    public async Task Every_stage_is_announced_to_the_ordering_clinic_and_to_the_patient()
    {
        using var host = new LabInteropHost();
        var patientId = Guid.NewGuid();
        var requisition = await OrderAsync(host, PaymentPolicy.Prepaid, patientId: patientId);
        await PayAsync(host, requisition.Id);
        await AccessionAsync(host, requisition.Id);

        var expected = new[] { LabOrderStage.Routed, LabOrderStage.AwaitingPayment, LabOrderStage.Paid, LabOrderStage.SpecimenCollected };
        var toClinic = await StatusesToAsync(host, LabInteropTestData.ClinicA);
        var toPatient = await StatusesToAsync(host, Party.ForPatient(patientId.ToString()));

        toClinic.Select(p => p.Stage).Should().BeEquivalentTo(expected);
        toPatient.Select(p => p.Stage).Should().BeEquivalentTo(expected);
        var awaiting = toClinic.Single(p => p.Stage == LabOrderStage.AwaitingPayment);
        awaiting.PaymentRequired.Should().BeTrue();
        awaiting.QuotedAmount.Should().Be(150m);
        awaiting.RequisitionId.Should().Be(requisition.CorrelationId!.Value);
        awaiting.LaboratoryTenantId.Should().Be(LabInteropTestData.LabTenant);
        awaiting.LaboratoryFacilityId.Should().Be(LabInteropTestData.LabId.ToString());
        awaiting.LaboratoryName.Should().Be("Test Laboratory");
        toClinic.Single(p => p.Stage == LabOrderStage.Paid).PaymentRequired.Should().BeFalse();

        host.Hub.Sent.Where(m => m.Type == InteropTypes.LabOrderStatusChanged)
            .Should().OnlyContain(m => m.From == LabInteropTestData.Lab && m.CorrelationId == requisition.CorrelationId!.Value);
    }

    [Fact]
    public async Task Status_messages_are_queued_in_the_same_save_as_the_order_so_a_redelivery_adds_nothing()
    {
        using var host = new LabInteropHost();
        await host.SeedLabAsync(PaymentPolicy.Prepaid);
        var order = LabInteropTestData.Order("ACC-ATOMIC", targetFacilityId: LabInteropTestData.LabId.ToString());
        var envelope = LabInteropTestData.OrderEnvelope(order, LabInteropTestData.ClinicA);

        await host.Dispatcher.DispatchAsync(envelope, default);
        var afterFirst = (await host.OutboxAsync()).Count;
        await host.Dispatcher.DispatchAsync(envelope, default);
        // The same order under a new message id (clinic retry) is skipped by the handler: no new rows either.
        await host.Dispatcher.DispatchAsync(LabInteropTestData.OrderEnvelope(order, LabInteropTestData.ClinicA), default);

        afterFirst.Should().Be(2 * 2 + 1 + 1, "Routed + AwaitingPayment, each to the clinic and the patient, plus the invoice request, plus comms eligibility grant");
        (await host.OutboxAsync()).Should().HaveCount(afterFirst);
        (await host.RequisitionsAsync()).Should().ContainSingle();
    }

    [Fact]
    public async Task Unknown_patient_gets_no_patient_bound_messages_and_no_fabricated_id()
    {
        using var host = new LabInteropHost();
        var requisition = await OrderAsync(host, PaymentPolicy.Prepaid, patientId: Guid.Empty);

        await host.Relay.RunOnceAsync(default);

        host.Hub.Sent.Should().NotContain(m => m.To.Kind == PartyKind.Patient);
        host.Hub.Sent.Where(m => m.Type == InteropTypes.LabOrderStatusChanged).Should().OnlyContain(m => m.To == LabInteropTestData.ClinicA);
        host.Hub.Sent.Single(m => m.Type == InteropTypes.BillingInvoiceRequested)
            .GetPayload<BillingInvoiceRequestedPayload>().PatientId.Should().BeNull();
        requisition.HasClinicEzPatient.Should().BeFalse();
    }

    // ── postpaid / none ────────────────────────────────────────────────────────────

    [Fact]
    public async Task Postpaid_order_is_billed_but_never_blocked_and_late_payment_does_not_move_the_stage_back()
    {
        using var host = new LabInteropHost();
        var requisition = await OrderAsync(host, PaymentPolicy.Postpaid);

        requisition.Stage.Should().Be(RequisitionStage.AwaitingPayment);
        requisition.IsPaymentBlocking.Should().BeFalse();
        await AccessionAsync(host, requisition.Id);
        await RecordResultAsync(host, requisition.Id);
        (await host.RequisitionsAsync()).Single().Stage.Should().Be(RequisitionStage.InProcess);

        var outboxBefore = (await host.OutboxAsync()).Count;
        await PayAsync(host, requisition.Id);

        var paid = (await host.RequisitionsAsync()).Single();
        paid.PaidAtUtc.Should().NotBeNull();
        paid.Stage.Should().Be(RequisitionStage.InProcess);
        (await host.OutboxAsync()).Should().HaveCount(outboxBefore, "a payment that does not change the stage announces nothing");
        await host.Relay.RunOnceAsync(default);
        host.Hub.Sent.Should().ContainSingle(m => m.Type == InteropTypes.BillingInvoiceRequested);
    }

    [Fact]
    public async Task Laboratory_without_billing_skips_the_invoice_and_never_waits_for_payment()
    {
        using var host = new LabInteropHost();
        var requisition = await OrderAsync(host, PaymentPolicy.None);

        requisition.Stage.Should().Be(RequisitionStage.Routed);
        requisition.QuotedAmount.Should().BeNull();
        requisition.IsPaymentBlocking.Should().BeFalse();
        (await host.OutboxAsync()).Should().NotContain(o => o.Type == InteropTypes.BillingInvoiceRequested);
        await AccessionAsync(host, requisition.Id);
        (await host.RequisitionsAsync()).Single().Stage.Should().Be(RequisitionStage.SpecimenCollected);
    }

    // ── billing.payment.confirmed hygiene ──────────────────────────────────────────

    [Fact]
    public async Task Payment_confirmation_is_idempotent()
    {
        using var host = new LabInteropHost();
        var requisition = await OrderAsync(host, PaymentPolicy.Prepaid);

        await PayAsync(host, requisition.Id);
        var outboxAfterFirst = (await host.OutboxAsync()).Count;
        await PayAsync(host, requisition.Id);

        (await host.RequisitionsAsync()).Single().Stage.Should().Be(RequisitionStage.Paid);
        (await host.OutboxAsync()).Should().HaveCount(outboxAfterFirst);
    }

    [Fact]
    public async Task Partial_payment_keeps_the_order_blocked()
    {
        using var host = new LabInteropHost();
        var requisition = await OrderAsync(host, PaymentPolicy.Prepaid);

        var result = await host.Dispatcher.DispatchAsync(LabInteropTestData.PaymentConfirmedEnvelope(requisition.Id, fullyPaid: false), default);

        result.ShouldAck.Should().BeTrue();
        var unchanged = (await host.RequisitionsAsync()).Single();
        unchanged.PaidAtUtc.Should().BeNull();
        unchanged.Stage.Should().Be(RequisitionStage.AwaitingPayment);
    }

    [Fact]
    public async Task Payment_confirmation_from_anyone_but_this_laboratorys_billing_is_acknowledged_and_ignored()
    {
        using var host = new LabInteropHost();
        var requisition = await OrderAsync(host, PaymentPolicy.Prepaid);
        var otherLabBilling = Party.ForFacility(LabInteropTestData.OtherLabTenant, LabInteropTestData.OtherLabId.ToString(), FacilityType.Laboratory, InteropServices.Billing);
        var sameTenantOtherLabBilling = Party.ForFacility(LabInteropTestData.LabTenant, Guid.NewGuid().ToString(), FacilityType.Laboratory, InteropServices.Billing);
        var senders = new[] { LabInteropTestData.ClinicA, LabInteropTestData.Lab, otherLabBilling, sameTenantOtherLabBilling };

        foreach (var from in senders)
        {
            var result = await host.Dispatcher.DispatchAsync(LabInteropTestData.PaymentConfirmedEnvelope(requisition.Id, from: from), default);
            result.ShouldAck.Should().BeTrue();
        }

        (await host.RequisitionsAsync()).Single().PaidAtUtc.Should().BeNull();
    }

    [Fact]
    public async Task Payment_confirmation_addressed_to_another_tenants_laboratory_never_pays_this_laboratorys_order()
    {
        using var host = new LabInteropHost();
        var requisition = await OrderAsync(host, PaymentPolicy.Prepaid);
        await host.WithDbAsync(async db =>
        {
            await LabInteropTestData.SeedLabAsync(db, PaymentPolicy.Prepaid, LabInteropTestData.OtherLabTenant, LabInteropTestData.OtherLabId, "Other Laboratory");
            return 0;
        });
        var otherLabBilling = Party.ForFacility(LabInteropTestData.OtherLabTenant, LabInteropTestData.OtherLabId.ToString(), FacilityType.Laboratory, InteropServices.Billing);

        // Billing of ANOTHER tenant's laboratory names this laboratory's invoice request id: scope comes from To, so no match.
        var result = await host.Dispatcher.DispatchAsync(
            LabInteropTestData.PaymentConfirmedEnvelope(requisition.Id, from: otherLabBilling, to: LabInteropTestData.OtherLab), default);

        result.ShouldAck.Should().BeTrue();
        (await host.RequisitionsAsync()).Single().PaidAtUtc.Should().BeNull();
    }

    [Fact]
    public async Task Payment_confirmation_for_an_unknown_invoice_request_is_acknowledged_without_changes()
    {
        using var host = new LabInteropHost();
        await OrderAsync(host, PaymentPolicy.Prepaid);
        var outbox = (await host.OutboxAsync()).Count;

        var result = await PayAsync(host, Guid.NewGuid());

        result.ShouldAck.Should().BeTrue();
        (await host.RequisitionsAsync()).Single().PaidAtUtc.Should().BeNull();
        (await host.OutboxAsync()).Should().HaveCount(outbox);
    }

    // ── refresh ────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Refreshing_an_unpaid_order_asks_billing_again_with_the_same_request_id_and_a_paid_one_does_not()
    {
        using var host = new LabInteropHost();
        var requisition = await OrderAsync(host, PaymentPolicy.Prepaid);

        Task<int> Refresh() => host.InLabScopeAsync(async sp =>
        {
            var handler = new RefreshPaymentStatusCommandHandler(
                sp.GetRequiredService<IRepository<LabRequisition>>(), sp.GetRequiredService<IUnitOfWork>(), sp.GetRequiredService<ILabOrderBilling>());
            await handler.Handle(new RefreshPaymentStatusCommand(requisition.Id), CancellationToken.None);
            return 0;
        });

        await Refresh();
        await host.Relay.RunOnceAsync(default);
        var invoices = host.Hub.Sent.Where(m => m.Type == InteropTypes.BillingInvoiceRequested).ToList();
        invoices.Should().HaveCount(2);
        invoices.Select(m => m.GetPayload<BillingInvoiceRequestedPayload>().InvoiceRequestId).Should().OnlyContain(id => id == requisition.Id);

        await PayAsync(host, requisition.Id);
        await Refresh();
        await host.Relay.RunOnceAsync(default);
        host.Hub.Sent.Count(m => m.Type == InteropTypes.BillingInvoiceRequested).Should().Be(2);
    }

    // ── reject ─────────────────────────────────────────────────────────────────────

    private static Task<int> RejectAsync(LabInteropHost host, Guid requisitionId, string reason) => host.InLabScopeAsync(async sp =>
    {
        var handler = new RejectLabOrderCommandHandler(
            sp.GetRequiredService<IRepository<LabRequisition>>(), sp.GetRequiredService<IUnitOfWork>(), sp.GetRequiredService<ILabOrderLifecycle>());
        await handler.Handle(new RejectLabOrderCommand(requisitionId, reason), CancellationToken.None);
        return 0;
    });

    [Fact]
    public async Task Rejecting_an_order_records_the_reason_tells_the_clinic_and_blocks_further_work()
    {
        using var host = new LabInteropHost();
        var requisition = await OrderAsync(host, PaymentPolicy.Prepaid);

        await RejectAsync(host, requisition.Id, "Test is not offered here");

        var rejected = (await host.RequisitionsAsync()).Single();
        rejected.Stage.Should().Be(RequisitionStage.Rejected);
        rejected.StageReason.Should().Be("Test is not offered here");
        var toClinic = await StatusesToAsync(host, LabInteropTestData.ClinicA);
        toClinic.Single(p => p.Stage == LabOrderStage.Rejected).Reason.Should().Be("Test is not offered here");

        Func<Task> again = () => RejectAsync(host, requisition.Id, "again");
        await again.Should().ThrowAsync<ConflictException>();
        await PayAsync(host, requisition.Id);
        Func<Task> collect = () => AccessionAsync(host, requisition.Id);
        await collect.Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task Rejecting_requires_a_reason_and_an_order_of_this_laboratory()
    {
        using var host = new LabInteropHost();
        var requisition = await OrderAsync(host, PaymentPolicy.None);

        Func<Task> blank = () => RejectAsync(host, requisition.Id, "  ");
        Func<Task> unknown = () => RejectAsync(host, Guid.NewGuid(), "no such order");
        await blank.Should().ThrowAsync<BadRequestException>();
        await unknown.Should().ThrowAsync<KeyNotFoundException>();

        // The same order seen from another tenant's laboratory does not exist.
        Func<Task> otherTenant = () => host.InLabScopeAsync(async sp =>
        {
            var handler = new RejectLabOrderCommandHandler(
                sp.GetRequiredService<IRepository<LabRequisition>>(), sp.GetRequiredService<IUnitOfWork>(), sp.GetRequiredService<ILabOrderLifecycle>());
            await handler.Handle(new RejectLabOrderCommand(requisition.Id, "hostile"), CancellationToken.None);
            return 0;
        }, LabInteropTestData.OtherLabTenant, LabInteropTestData.OtherLabId);
        await otherTenant.Should().ThrowAsync<KeyNotFoundException>();
        (await host.RequisitionsAsync()).Single().Stage.Should().Be(RequisitionStage.Routed);
    }

    // ── claim by QR ────────────────────────────────────────────────────────────────

    private static Party ClaimSlipAddress => new() { Kind = PartyKind.Facility, FacilityType = FacilityType.Laboratory };

    private static Task<ClaimLabOrderResult> ClaimAsync(LabInteropHost host, string token) => host.InLabScopeAsync(sp =>
        new ClaimLabOrderCommandHandler(sp.GetRequiredService<IHubClaimsClient>(), sp.GetRequiredService<ILabContext>())
            .Handle(new ClaimLabOrderCommand(token), CancellationToken.None));

    [Fact]
    public async Task Claimed_slip_delivers_the_order_as_Claimed_and_the_result_goes_back_to_the_ordering_clinic()
    {
        using var host = new LabInteropHost();
        await host.SeedLabAsync(PaymentPolicy.None);
        var order = LabInteropTestData.Order("ACC-CLAIM");
        var slip = await host.Provider.GetRequiredService<InProcessHubClaimsClient>().CreateAsync(
            new ClaimSlipRequest(LabInteropTestData.OrderEnvelope(order, LabInteropTestData.ClinicA, ClaimSlipAddress)), default);

        var claimed = await ClaimAsync(host, slip.Token);

        claimed.CorrelationId.Should().Be(order.RequisitionId);
        var delivered = host.Hub.Sent.Single(m => m.Type == InteropTypes.LabOrderIssued);
        delivered.To.Should().Be(LabInteropTestData.Lab, "the hub rewrites To to the redeeming laboratory");
        delivered.From.Should().Be(LabInteropTestData.ClinicA);
        (await host.Dispatcher.DispatchAsync(delivered, default)).Outcome.Should().Be(DispatchOutcome.Handled);

        var requisition = (await host.RequisitionsAsync()).Single();
        requisition.Stage.Should().Be(RequisitionStage.Claimed);
        requisition.OrderingTenantId.Should().Be(LabInteropTestData.ClinicA.TenantId);
        requisition.OrderingFacilityId.Should().Be(LabInteropTestData.ClinicA.FacilityId);
        requisition.CorrelationId.Should().Be(order.RequisitionId);

        await FinalizeWithResultAsync(host, requisition.Id);
        await host.Relay.RunOnceAsync(default);
        var result = host.Hub.Sent.Single(m => m.Type == InteropTypes.LabResultFinalized);
        result.To.Should().Be(LabInteropTestData.ClinicA);
        result.CorrelationId.Should().Be(order.RequisitionId);
    }

    [Fact]
    public async Task A_slip_can_only_be_claimed_once_and_unknown_tokens_are_reported()
    {
        using var host = new LabInteropHost();
        await host.SeedLabAsync(PaymentPolicy.None);
        var slip = await host.Provider.GetRequiredService<InProcessHubClaimsClient>().CreateAsync(
            new ClaimSlipRequest(LabInteropTestData.OrderEnvelope(LabInteropTestData.Order("ACC-ONCE"), LabInteropTestData.ClinicA, ClaimSlipAddress)), default);

        await ClaimAsync(host, slip.Token);
        Func<Task> second = () => ClaimAsync(host, slip.Token);
        Func<Task> unknown = () => ClaimAsync(host, "no-such-token");

        (await second.Should().ThrowAsync<HubClaimException>()).Which.StatusCode.Should().Be(System.Net.HttpStatusCode.Conflict);
        (await unknown.Should().ThrowAsync<HubClaimException>()).Which.StatusCode.Should().Be(System.Net.HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Claiming_needs_a_signed_in_laboratory_and_a_token()
    {
        using var host = new LabInteropHost();
        using var scope = host.Provider.CreateScope();
        var handler = new ClaimLabOrderCommandHandler(
            scope.ServiceProvider.GetRequiredService<IHubClaimsClient>(), scope.ServiceProvider.GetRequiredService<ILabContext>());

        Func<Task> anonymous = () => handler.Handle(new ClaimLabOrderCommand("abc"), CancellationToken.None);
        Func<Task> blank = () => ClaimAsync(host, " ");

        await anonymous.Should().ThrowAsync<ForbiddenException>();
        await blank.Should().ThrowAsync<BadRequestException>();
    }

    // ── results to the patient ─────────────────────────────────────────────────────

    private static async Task FinalizeWithResultAsync(LabInteropHost host, Guid requisitionId)
    {
        await host.InLabScopeAsync(async sp =>
        {
            var db = sp.GetRequiredService<ClinicEz.Laboratory.Infrastructure.Persistence.ApplicationDbContext>();
            (await db.LabRequisitions.SingleAsync(r => r.Id == requisitionId)).Status = RequisitionStatus.InTesting;
            db.AnalyteResults.Add(new AnalyteResult
            {
                LabRequisitionId = requisitionId,
                PanelName = "Clinical Chemistry",
                AnalyteCode = "FBS",
                AnalyteName = "Fasting Blood Sugar",
                Value = "5.0",
                Unit = "mmol/L",
                ReferenceInterval = "3.9 - 5.6",
                Flag = AnalyteFlag.Normal
            });
            await db.SaveChangesAsync();
            return 0;
        });
        await FinalizeAsync(host, requisitionId);
    }

    [Fact]
    public async Task Finalized_report_is_also_issued_to_the_patient_as_a_verified_clinicez_lab_document()
    {
        using var host = new LabInteropHost();
        var patientId = Guid.NewGuid();
        var requisition = await OrderAsync(host, PaymentPolicy.None, patientId: patientId);

        await FinalizeWithResultAsync(host, requisition.Id);
        await host.Relay.RunOnceAsync(default);

        var report = host.Hub.Sent.Single(m => m.Type == InteropTypes.LabResultFinalized).GetPayload<DiagnosticReportFinalizedEvent>();
        var documentMessage = host.Hub.Sent.Single(m => m.Type == InteropTypes.PatientDocumentIssued);
        documentMessage.To.Should().Be(Party.ForPatient(patientId.ToString()));
        documentMessage.From.Should().Be(LabInteropTestData.Lab);
        documentMessage.CorrelationId.Should().Be(requisition.CorrelationId!.Value);
        var document = documentMessage.GetPayload<PatientDocumentIssuedPayload>();
        document.DocumentId.Should().Be(report.ReportId);
        document.Kind.Should().Be(PatientDocumentKind.LabResult);
        document.Source.Should().Be(ResultSource.ClinicEzLab);
        document.Verification.Should().Be(VerificationState.Verified);
        document.PatientId.Should().Be(patientId);
        document.IssuerTenantId.Should().Be(LabInteropTestData.LabTenant);
        document.IssuerFacilityId.Should().Be(LabInteropTestData.LabId.ToString());
        document.IssuerFacilityType.Should().Be(FacilityType.Laboratory);
        document.IssuerName.Should().Be("Test Laboratory");
        document.Title.Should().Contain(requisition.AccessionNumber);
        document.Status.Should().Be("Final");
        var body = document.Body!.Value.Deserialize<DiagnosticReportFinalizedEvent>(InteropJson.Options)!;
        body.ReportId.Should().Be(report.ReportId);
        body.Observations.Should().ContainSingle(o => o.AnalyteCode == "FBS");

        var finalStatus = (await StatusesToAsync(host, LabInteropTestData.ClinicA)).Single(p => p.Stage == LabOrderStage.ResultFinalized);
        finalStatus.PatientId.Should().Be(patientId);
    }

    [Fact]
    public async Task Finalized_report_of_an_unknown_patient_is_not_issued_to_any_patient()
    {
        using var host = new LabInteropHost();
        var requisition = await OrderAsync(host, PaymentPolicy.None, patientId: Guid.Empty);

        await FinalizeWithResultAsync(host, requisition.Id);
        await host.Relay.RunOnceAsync(default);

        host.Hub.Sent.Should().NotContain(m => m.Type == InteropTypes.PatientDocumentIssued);
        host.Hub.Sent.Single(m => m.Type == InteropTypes.LabResultFinalized).GetPayload<DiagnosticReportFinalizedEvent>().PatientId.Should().BeNull();
    }

    // ── lifecycle rules ────────────────────────────────────────────────────────────

    [Fact]
    public void Every_domain_stage_has_the_same_named_stage_on_the_wire()
    {
        foreach (var stage in Enum.GetValues<RequisitionStage>())
        {
            Enum.GetNames<LabOrderStage>().Should().Contain(stage.ToString());
            LabOrderLifecycle.ToWireStage(stage).ToString().Should().Be(stage.ToString());
        }
    }

    [Theory]
    [InlineData(RequisitionStage.Routed, RequisitionStage.AwaitingPayment, true)]
    [InlineData(RequisitionStage.Claimed, RequisitionStage.Paid, true)]
    [InlineData(RequisitionStage.AwaitingPayment, RequisitionStage.SpecimenCollected, true)]
    [InlineData(RequisitionStage.Paid, RequisitionStage.AwaitingPayment, false)]
    [InlineData(RequisitionStage.InProcess, RequisitionStage.Paid, false)]
    [InlineData(RequisitionStage.InProcess, RequisitionStage.InProcess, false)]
    [InlineData(RequisitionStage.InProcess, RequisitionStage.ResultFinalized, true)]
    [InlineData(RequisitionStage.AwaitingPayment, RequisitionStage.Rejected, true)]
    [InlineData(RequisitionStage.ResultFinalized, RequisitionStage.Rejected, false)]
    [InlineData(RequisitionStage.Rejected, RequisitionStage.Paid, false)]
    [InlineData(RequisitionStage.Cancelled, RequisitionStage.Cancelled, false)]
    public void Stages_only_move_forward_and_finished_orders_never_move(RequisitionStage from, RequisitionStage to, bool allowed)
    {
        LabOrderLifecycle.CanMove(from, to).Should().Be(allowed);
    }
}
