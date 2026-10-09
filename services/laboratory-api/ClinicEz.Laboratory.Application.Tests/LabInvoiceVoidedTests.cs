using System;
using System.Linq;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Common.Exceptions;
using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Laboratory.Application.Interop;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ClinicEz.Laboratory.Application.Tests;

/// <summary>
/// <c>billing.invoice.voided</c>: a void or refund that billing applied after the order was accepted, driven through the
/// real dispatcher, the handlers and an in-memory database.
/// </summary>
public class LabInvoiceVoidedTests
{
    private static InteropEnvelope VoidEnvelope(
        Guid? invoiceRequestId,
        Guid? invoiceId = null,
        BillingCorrectionKind kind = BillingCorrectionKind.Refund,
        Party? from = null,
        Party? to = null,
        DateTime? correctedAtUtc = null,
        string? tenantId = null,
        string? facilityId = null,
        FacilityType facilityType = FacilityType.Laboratory) =>
        InteropEnvelope.Create(
            InteropTypes.BillingInvoiceVoided,
            from ?? LabInteropTestData.LabBilling,
            to ?? LabInteropTestData.Lab,
            invoiceRequestId ?? Guid.NewGuid(),
            new BillingInvoiceVoidedPayload
            {
                TenantId = tenantId ?? LabInteropTestData.LabTenant,
                FacilityId = facilityId ?? LabInteropTestData.LabId.ToString(),
                FacilityType = facilityType,
                InvoiceId = invoiceId ?? Guid.NewGuid(),
                InvoiceRequestId = invoiceRequestId,
                SourceType = "LabOrder",
                SourceId = Guid.NewGuid(),
                Kind = kind,
                Total = 150m,
                AmountReversed = kind == BillingCorrectionKind.Refund ? 150m : 0m,
                WasFullyPaid = kind == BillingCorrectionKind.Refund,
                CorrectedAtUtc = correctedAtUtc ?? DateTime.UtcNow.AddMinutes(1)
            });

    private static Task<DispatchResult> PayAsync(LabInteropHost host, Guid requisitionId, Guid invoiceId) =>
        host.Dispatcher.DispatchAsync(LabInteropTestData.PaymentConfirmedEnvelope(requisitionId, invoiceId: invoiceId), default);

    [Fact]
    public async Task Refund_before_any_work_takes_a_paid_order_back_to_awaiting_payment_and_announces_it()
    {
        using var host = new LabInteropHost();
        var patientId = Guid.NewGuid();
        var order = await LabPaymentGateTests.OrderAsync(host, PaymentPolicy.Prepaid, patientId: patientId);
        var invoiceId = Guid.NewGuid();
        await PayAsync(host, order.Id, invoiceId);
        var outboxBefore = (await host.OutboxAsync()).Count;

        var result = await host.Dispatcher.DispatchAsync(VoidEnvelope(order.Id, invoiceId), default);

        result.Outcome.Should().Be(DispatchOutcome.Handled);
        var reopened = (await host.RequisitionsAsync()).Single();
        reopened.Stage.Should().Be(RequisitionStage.AwaitingPayment);
        reopened.PaymentCorrection.Should().Be(PaymentCorrection.Refunded);
        reopened.PaymentCorrectedAtUtc.Should().NotBeNull();
        reopened.PaidAtUtc.Should().BeNull();
        reopened.ReceiptNumber.Should().BeNull();
        reopened.InvoiceId.Should().BeNull();
        reopened.IsPaymentBlocking.Should().BeTrue();

        var toClinic = await LabPaymentGateTests.StatusesToAsync(host, LabInteropTestData.ClinicA);
        var toPatient = await LabPaymentGateTests.StatusesToAsync(host, Party.ForPatient(patientId.ToString()));
        foreach (var statuses in new[] { toClinic, toPatient })
        {
            var last = statuses.Last();
            last.Stage.Should().Be(LabOrderStage.AwaitingPayment);
            last.PaymentRequired.Should().BeTrue();
            last.Reason.Should().Be("Payment refunded");
            last.RequisitionId.Should().Be(order.CorrelationId!.Value);
        }

        await host.Relay.RunOnceAsync(default);
        var requests = host.Hub.Sent.Where(m => m.Type == InteropTypes.BillingInvoiceRequested).ToList();
        requests.Should().HaveCount(2, "the original request plus the one that reopens the refunded invoice");
        requests.Select(m => m.GetPayload<BillingInvoiceRequestedPayload>().InvoiceRequestId).Distinct().Should().ContainSingle().Which.Should().Be(order.Id);
        (await host.OutboxAsync()).Should().HaveCount(outboxBefore + 3, "two status messages and the invoice request were queued in the one save");

        Func<Task> collect = () => LabPaymentGateTests.AccessionAsync(host, order.Id);
        await collect.Should().ThrowAsync<PaymentRequiredException>("the refunded order is blocked again until it is repaid");
    }

    [Theory]
    [InlineData(PaymentPolicy.Prepaid)]
    [InlineData(PaymentPolicy.Postpaid)]
    public async Task Void_of_an_unpaid_invoice_is_recorded_and_the_invoice_requested_again_without_a_stage_change(PaymentPolicy policy)
    {
        using var host = new LabInteropHost();
        var order = await LabPaymentGateTests.OrderAsync(host, policy);
        var outbox = (await host.OutboxAsync()).Count;

        await host.Dispatcher.DispatchAsync(VoidEnvelope(order.Id, kind: BillingCorrectionKind.Void), default);

        var recorded = (await host.RequisitionsAsync()).Single();
        recorded.PaymentCorrection.Should().Be(PaymentCorrection.Voided);
        recorded.Stage.Should().Be(RequisitionStage.AwaitingPayment);
        (await host.OutboxAsync()).Should().HaveCount(outbox + 1);
        (await host.OutboxAsync()).Should().Contain(o => o.Type == InteropTypes.BillingInvoiceRequested && o.CorrelationId == order.Id);
    }

    [Fact]
    public async Task Refund_after_the_specimen_was_drawn_only_records_the_flag_and_the_work_continues()
    {
        using var host = new LabInteropHost();
        var order = await LabPaymentGateTests.OrderAsync(host, PaymentPolicy.Prepaid);
        var invoiceId = Guid.NewGuid();
        await PayAsync(host, order.Id, invoiceId);
        await LabPaymentGateTests.AccessionAsync(host, order.Id);
        var outbox = (await host.OutboxAsync()).Count;

        await host.Dispatcher.DispatchAsync(VoidEnvelope(order.Id, invoiceId), default);

        var recorded = (await host.RequisitionsAsync()).Single();
        recorded.PaymentCorrection.Should().Be(PaymentCorrection.Refunded);
        recorded.Stage.Should().Be(RequisitionStage.SpecimenCollected);
        recorded.PaidAtUtc.Should().NotBeNull("a drawn specimen is not un-drawn");
        recorded.InvoiceId.Should().Be(invoiceId);
        (await host.OutboxAsync()).Should().HaveCount(outbox, "no stage changed, so nothing is announced");
        await LabPaymentGateTests.RecordResultAsync(host, order.Id);
        (await host.RequisitionsAsync()).Single().Stage.Should().Be(RequisitionStage.InProcess);
    }

    [Fact]
    public async Task Redelivery_and_an_older_correction_change_nothing()
    {
        using var host = new LabInteropHost();
        var order = await LabPaymentGateTests.OrderAsync(host, PaymentPolicy.Prepaid);
        var invoiceId = Guid.NewGuid();
        await PayAsync(host, order.Id, invoiceId);
        var correctedAt = DateTime.UtcNow.AddMinutes(1);
        var envelope = VoidEnvelope(order.Id, invoiceId, correctedAtUtc: correctedAt);

        await host.Dispatcher.DispatchAsync(envelope, default);
        var outbox = (await host.OutboxAsync()).Count;
        await host.Dispatcher.DispatchAsync(envelope, default);
        await host.Dispatcher.DispatchAsync(VoidEnvelope(order.Id, invoiceId, correctedAtUtc: correctedAt), default);
        await host.Dispatcher.DispatchAsync(VoidEnvelope(order.Id, invoiceId, correctedAtUtc: correctedAt.AddSeconds(-30)), default);

        (await host.OutboxAsync()).Should().HaveCount(outbox);
        var recorded = (await host.RequisitionsAsync()).Single();
        recorded.Stage.Should().Be(RequisitionStage.AwaitingPayment);
        recorded.PaymentCorrectedAtUtc.Should().Be(correctedAt);
    }

    [Fact]
    public async Task A_new_payment_after_a_refund_pays_the_order_again_and_clears_the_correction()
    {
        using var host = new LabInteropHost();
        var order = await LabPaymentGateTests.OrderAsync(host, PaymentPolicy.Prepaid);
        var firstInvoice = Guid.NewGuid();
        await PayAsync(host, order.Id, firstInvoice);
        await host.Dispatcher.DispatchAsync(VoidEnvelope(order.Id, firstInvoice), default);

        await PayAsync(host, order.Id, Guid.NewGuid());

        var repaid = (await host.RequisitionsAsync()).Single();
        repaid.Stage.Should().Be(RequisitionStage.Paid);
        repaid.PaidAtUtc.Should().NotBeNull();
        repaid.PaymentCorrection.Should().Be(PaymentCorrection.None);
        repaid.IsPaymentBlocking.Should().BeFalse();
    }

    [Fact]
    public async Task A_correction_older_than_the_current_payment_is_ignored()
    {
        using var host = new LabInteropHost();
        var order = await LabPaymentGateTests.OrderAsync(host, PaymentPolicy.Prepaid);
        var invoiceId = Guid.NewGuid();
        await PayAsync(host, order.Id, invoiceId);

        await host.Dispatcher.DispatchAsync(VoidEnvelope(order.Id, invoiceId, correctedAtUtc: DateTime.UtcNow.AddHours(-1)), default);

        var unchanged = (await host.RequisitionsAsync()).Single();
        unchanged.Stage.Should().Be(RequisitionStage.Paid);
        unchanged.PaymentCorrection.Should().Be(PaymentCorrection.None);
        unchanged.PaidAtUtc.Should().NotBeNull();
    }

    [Fact]
    public async Task Corrections_from_the_wrong_sender_or_about_another_facility_are_acknowledged_and_ignored()
    {
        using var host = new LabInteropHost();
        var order = await LabPaymentGateTests.OrderAsync(host, PaymentPolicy.Prepaid);
        var invoiceId = Guid.NewGuid();
        await PayAsync(host, order.Id, invoiceId);
        var outbox = (await host.OutboxAsync()).Count;
        var otherLabBilling = Party.ForFacility(LabInteropTestData.OtherLabTenant, LabInteropTestData.OtherLabId.ToString(), FacilityType.Laboratory, InteropServices.Billing);
        var sameTenantOtherLabBilling = Party.ForFacility(LabInteropTestData.LabTenant, Guid.NewGuid().ToString(), FacilityType.Laboratory, InteropServices.Billing);

        var envelopes = new[]
        {
            VoidEnvelope(order.Id, invoiceId, from: LabInteropTestData.ClinicA),
            VoidEnvelope(order.Id, invoiceId, from: LabInteropTestData.Lab),
            VoidEnvelope(order.Id, invoiceId, from: otherLabBilling),
            VoidEnvelope(order.Id, invoiceId, from: sameTenantOtherLabBilling),
            VoidEnvelope(order.Id, invoiceId, tenantId: LabInteropTestData.OtherLabTenant),
            VoidEnvelope(order.Id, invoiceId, facilityId: Guid.NewGuid().ToString()),
            VoidEnvelope(order.Id, invoiceId, facilityType: FacilityType.Clinic),
            VoidEnvelope(null, invoiceId),
            VoidEnvelope(Guid.NewGuid(), invoiceId),
            VoidEnvelope(order.Id, Guid.NewGuid())
        };

        foreach (var envelope in envelopes)
        {
            (await host.Dispatcher.DispatchAsync(envelope, default)).ShouldAck.Should().BeTrue();
        }

        var unchanged = (await host.RequisitionsAsync()).Single();
        unchanged.Stage.Should().Be(RequisitionStage.Paid);
        unchanged.PaymentCorrection.Should().Be(PaymentCorrection.None);
        unchanged.PaidAtUtc.Should().NotBeNull();
        (await host.OutboxAsync()).Should().HaveCount(outbox);
    }

    [Fact]
    public async Task A_correction_addressed_to_another_tenants_laboratory_never_touches_this_laboratorys_order()
    {
        using var host = new LabInteropHost();
        var order = await LabPaymentGateTests.OrderAsync(host, PaymentPolicy.Prepaid);
        var invoiceId = Guid.NewGuid();
        await PayAsync(host, order.Id, invoiceId);
        await host.WithDbAsync(async db =>
        {
            await LabInteropTestData.SeedLabAsync(db, PaymentPolicy.Prepaid, LabInteropTestData.OtherLabTenant, LabInteropTestData.OtherLabId, "Other Laboratory");
            return 0;
        });
        var otherLabBilling = Party.ForFacility(LabInteropTestData.OtherLabTenant, LabInteropTestData.OtherLabId.ToString(), FacilityType.Laboratory, InteropServices.Billing);

        // Billing of ANOTHER tenant's laboratory names this laboratory's order id: scope comes from To, so no match.
        var result = await host.Dispatcher.DispatchAsync(
            VoidEnvelope(order.Id, invoiceId, from: otherLabBilling, to: LabInteropTestData.OtherLab,
                tenantId: LabInteropTestData.OtherLabTenant, facilityId: LabInteropTestData.OtherLabId.ToString()), default);

        result.ShouldAck.Should().BeTrue();
        var unchanged = (await host.RequisitionsAsync()).Single();
        unchanged.PaymentCorrection.Should().Be(PaymentCorrection.None);
        unchanged.Stage.Should().Be(RequisitionStage.Paid);
    }

    [Fact]
    public async Task Reopening_for_payment_only_moves_an_order_that_is_still_paid()
    {
        using var host = new LabInteropHost();
        await LabPaymentGateTests.OrderAsync(host, PaymentPolicy.Prepaid);

        var moved = await host.InLabScopeAsync(async sp =>
        {
            var lifecycle = sp.GetRequiredService<ILabOrderLifecycle>();
            var requisition = await sp.GetRequiredService<ApplicationDbContext>().LabRequisitions.SingleAsync();
            return await lifecycle.ReopenForPaymentAsync(requisition, "Payment voided", default);
        });

        moved.Should().BeFalse("an order awaiting payment has nothing to reopen");
        (await host.RequisitionsAsync()).Single().Stage.Should().Be(RequisitionStage.AwaitingPayment);
    }
}
