using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Laboratory.Application.Interop;

/// <summary>
/// <c>billing.invoice.voided</c>: billing voided the invoice of an order or refunded its payment.
/// <list type="bullet">
/// <item>Only accepted from this laboratory's own billing mailbox, about this laboratory (sender, recipient and payload all
/// name the same tenant and laboratory). Anything else is acknowledged and ignored.</item>
/// <item>The data scope is the laboratory in <c>To</c>; the order is found by the invoice request id (the lab requisition
/// id). Walk-in invoices carry no request id and are not this laboratory's orders.</item>
/// <item>The correction is always recorded. If the order has not started (no specimen drawn) the payment is withdrawn, a
/// <c>Paid</c> order goes back to <c>AwaitingPayment</c> (announced to the clinic and the patient) and the invoice is requested
/// again under the same request id, which billing uses to reopen the corrected invoice. Work that already started
/// keeps its payment (a drawn specimen is not un-drawn): the flag is recorded and logged only.</item>
/// <item>A partial refund (<c>IsPartial</c>) never withdraws the payment: it only records the cumulative refunded amount on the
/// order, which stays paid.</item>
/// <item>Idempotent: a redelivery, or a correction older than the one recorded or than a newer payment, changes nothing.</item>
/// </list>
/// </summary>
public sealed class BillingInvoiceVoidedHandler : IInteropHandler<BillingInvoiceVoidedPayload>
{
    private readonly IRepository<LabRequisition> _requisitionRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILabContext _labContext;
    private readonly ILabOrderLifecycle _lifecycle;
    private readonly ILabOrderBilling _billing;
    private readonly ILogger<BillingInvoiceVoidedHandler> _logger;

    public BillingInvoiceVoidedHandler(
        IRepository<LabRequisition> requisitionRepository,
        IUnitOfWork unitOfWork,
        ILabContext labContext,
        ILabOrderLifecycle lifecycle,
        ILabOrderBilling billing,
        ILogger<BillingInvoiceVoidedHandler> logger)
    {
        _requisitionRepository = requisitionRepository;
        _unitOfWork = unitOfWork;
        _labContext = labContext;
        _lifecycle = lifecycle;
        _billing = billing;
        _logger = logger;
    }

    public async Task HandleAsync(BillingInvoiceVoidedPayload msg, InteropMessageContext context, CancellationToken ct)
    {
        var from = context.From;
        var to = context.To;

        if (to.Kind != PartyKind.Facility
            || string.IsNullOrWhiteSpace(to.TenantId)
            || !Guid.TryParse(to.FacilityId, out var laboratoryId))
        {
            _logger.LogWarning(
                "[BillingInvoiceVoidedHandler] Ignoring billing.invoice.voided {MessageId}: {Recipient} is not a laboratory address.",
                context.MessageId, to.Address);
            return;
        }

        var fromThisLaboratoryBilling = from.Kind == PartyKind.Facility
            && from.FacilityType == FacilityType.Laboratory
            && string.Equals(from.Service, InteropServices.Billing, StringComparison.Ordinal)
            && string.Equals(from.TenantId, to.TenantId, StringComparison.Ordinal)
            && string.Equals(from.FacilityId, to.FacilityId, StringComparison.OrdinalIgnoreCase);

        if (!fromThisLaboratoryBilling)
        {
            _logger.LogWarning(
                "[BillingInvoiceVoidedHandler] Ignoring billing.invoice.voided {MessageId}: sender {Sender} is not the billing service of {Recipient}.",
                context.MessageId, from.Address, to.Address);
            return;
        }

        var aboutThisLaboratory = msg.FacilityType == FacilityType.Laboratory
            && string.Equals(msg.TenantId, to.TenantId, StringComparison.Ordinal)
            && string.Equals(msg.FacilityId, to.FacilityId, StringComparison.OrdinalIgnoreCase);

        if (!aboutThisLaboratory || msg.InvoiceRequestId is not { } invoiceRequestId)
        {
            _logger.LogWarning(
                "[BillingInvoiceVoidedHandler] Ignoring billing.invoice.voided {MessageId}: invoice {InvoiceId} is not a laboratory order of {Recipient}.",
                context.MessageId, msg.InvoiceId, to.Address);
            return;
        }

        using var scope = _labContext.BeginFacilityScope(to.TenantId, laboratoryId);

        var requisition = await _requisitionRepository.Query()
            .FirstOrDefaultAsync(r => r.Id == invoiceRequestId, ct);

        if (requisition == null)
        {
            _logger.LogWarning(
                "[BillingInvoiceVoidedHandler] Ignoring billing.invoice.voided {MessageId}: no order {InvoiceRequestId} in laboratory {LaboratoryId}.",
                context.MessageId, invoiceRequestId, laboratoryId);
            return;
        }

        if (requisition.PaidAtUtc != null && requisition.InvoiceId != null && requisition.InvoiceId != msg.InvoiceId)
        {
            _logger.LogWarning(
                "[BillingInvoiceVoidedHandler] Ignoring billing.invoice.voided {MessageId}: order {RequisitionId} was paid by invoice {PaidInvoiceId}, not {InvoiceId}.",
                context.MessageId, requisition.Id, requisition.InvoiceId, msg.InvoiceId);
            return;
        }

        if (msg.IsPartial)
        {
            await RecordPartialRefundAsync(requisition, msg, ct);
            return;
        }

        var alreadyRecorded = requisition.PaymentCorrection != PaymentCorrection.None
            && requisition.PaymentCorrectedAtUtc >= msg.CorrectedAtUtc;
        var supersededByLaterPayment = requisition.PaidAtUtc is { } paidAt && paidAt > msg.CorrectedAtUtc;

        if (alreadyRecorded || supersededByLaterPayment)
        {
            _logger.LogInformation(
                "[BillingInvoiceVoidedHandler] Order {RequisitionId}: correction of {CorrectedAtUtc:u} is already recorded or superseded. Skipping.",
                requisition.Id, msg.CorrectedAtUtc);
            return;
        }

        var correction = msg.Kind == BillingCorrectionKind.Refund ? PaymentCorrection.Refunded : PaymentCorrection.Voided;
        requisition.PaymentCorrection = correction;
        requisition.PaymentCorrectedAtUtc = msg.CorrectedAtUtc;

        if (HasStarted(requisition.Stage))
        {
            requisition.RefundedAmount = msg.RefundedTotal;
            _logger.LogWarning(
                "[BillingInvoiceVoidedHandler] Order {RequisitionId} is already {Stage}: the {Correction} is recorded but the work continues.",
                requisition.Id, requisition.Stage, correction);
            await _unitOfWork.SaveChangesAsync(ct);
            return;
        }

        // Not started: the payment is withdrawn. Queued before the save so the correction, its announcement and the new
        // invoice request commit together. Billing reopens a corrected invoice when the same request id is asked again.
        requisition.PaidAtUtc = null;
        requisition.InvoiceId = null;
        requisition.ReceiptNumber = null;
        requisition.RefundedAmount = 0m;

        var reopened = await _lifecycle.ReopenForPaymentAsync(
            requisition, correction == PaymentCorrection.Refunded ? "Payment refunded" : "Payment voided", ct);
        var reinvoiced = await _billing.RefreshInvoiceAsync(requisition, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        _logger.LogInformation(
            "[BillingInvoiceVoidedHandler] Order {RequisitionId}: payment {Correction}; stage is {Stage}{Reopened}{Reinvoiced}.",
            requisition.Id, correction, requisition.Stage,
            reopened ? " (back to awaiting payment)" : string.Empty,
            reinvoiced ? ", invoice requested again" : string.Empty);
    }

    /// <summary>
    /// A partial refund keeps the order paid: only the cumulative refunded amount is recorded. Nothing is reopened,
    /// re-invoiced or announced. The total is cumulative, so a redelivery or an older message changes nothing, and a
    /// partial refund for an order that is not paid (any more) is ignored.
    /// </summary>
    private async Task RecordPartialRefundAsync(LabRequisition requisition, BillingInvoiceVoidedPayload msg, CancellationToken ct)
    {
        if (requisition.PaidAtUtc == null)
        {
            _logger.LogWarning(
                "[BillingInvoiceVoidedHandler] Ignoring partial refund of invoice {InvoiceId}: order {RequisitionId} is not paid.",
                msg.InvoiceId, requisition.Id);
            return;
        }

        if (msg.RefundedTotal <= requisition.RefundedAmount)
        {
            _logger.LogInformation(
                "[BillingInvoiceVoidedHandler] Order {RequisitionId}: refunded total {RefundedTotal} is already recorded. Skipping.",
                requisition.Id, msg.RefundedTotal);
            return;
        }

        requisition.RefundedAmount = msg.RefundedTotal;
        await _unitOfWork.SaveChangesAsync(ct);

        _logger.LogInformation(
            "[BillingInvoiceVoidedHandler] Order {RequisitionId}: partial refund recorded, {RefundedTotal} of {Total} refunded; the order stays paid.",
            requisition.Id, msg.RefundedTotal, msg.Total);
    }

    /// <summary>A drawn specimen, processing, a finished or a closed order is past the point where payment can be withdrawn.</summary>
    private static bool HasStarted(RequisitionStage stage) => stage is
        RequisitionStage.SpecimenCollected or RequisitionStage.InProcess or RequisitionStage.ResultFinalized
        or RequisitionStage.Rejected or RequisitionStage.Cancelled;
}
