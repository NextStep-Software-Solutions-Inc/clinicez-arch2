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
/// <c>billing.payment.confirmed</c>: the cashier collected the payment for an order, which opens the payment gate.
/// <list type="bullet">
/// <item>Only accepted from this laboratory's own billing mailbox: <c>From</c> is the laboratory facility with the billing
/// service and <c>To</c> is the same laboratory. Anything else is acknowledged and ignored.</item>
/// <item>The data scope is the laboratory in <c>To</c>; the order is found by the invoice request id (the lab requisition id),
/// never by an accession or order number.</item>
/// <item>Only a full payment pays the order. Idempotent: a redelivery changes nothing and announces nothing.</item>
/// <item>The order always exists before its invoice request is sent, so an unknown id is not a race: it is logged and
/// acknowledged.</item>
/// </list>
/// </summary>
public sealed class BillingPaymentConfirmedHandler : IInteropHandler<BillingPaymentConfirmedPayload>
{
    private readonly IRepository<LabRequisition> _requisitionRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILabContext _labContext;
    private readonly ILabOrderLifecycle _lifecycle;
    private readonly ILogger<BillingPaymentConfirmedHandler> _logger;

    public BillingPaymentConfirmedHandler(
        IRepository<LabRequisition> requisitionRepository,
        IUnitOfWork unitOfWork,
        ILabContext labContext,
        ILabOrderLifecycle lifecycle,
        ILogger<BillingPaymentConfirmedHandler> logger)
    {
        _requisitionRepository = requisitionRepository;
        _unitOfWork = unitOfWork;
        _labContext = labContext;
        _lifecycle = lifecycle;
        _logger = logger;
    }

    public async Task HandleAsync(BillingPaymentConfirmedPayload msg, InteropMessageContext context, CancellationToken ct)
    {
        var from = context.From;
        var to = context.To;

        if (to.Kind != PartyKind.Facility
            || string.IsNullOrWhiteSpace(to.TenantId)
            || !Guid.TryParse(to.FacilityId, out var laboratoryId))
        {
            _logger.LogWarning(
                "[BillingPaymentConfirmedHandler] Ignoring billing.payment.confirmed {MessageId}: {Recipient} is not a laboratory address.",
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
                "[BillingPaymentConfirmedHandler] Ignoring billing.payment.confirmed {MessageId}: sender {Sender} is not the billing service of {Recipient}.",
                context.MessageId, from.Address, to.Address);
            return;
        }

        using var scope = _labContext.BeginFacilityScope(to.TenantId, laboratoryId);

        var requisition = await _requisitionRepository.Query()
            .FirstOrDefaultAsync(r => r.Id == msg.InvoiceRequestId, ct);

        if (requisition == null)
        {
            _logger.LogWarning(
                "[BillingPaymentConfirmedHandler] Ignoring billing.payment.confirmed {MessageId}: no order {InvoiceRequestId} in laboratory {LaboratoryId}.",
                context.MessageId, msg.InvoiceRequestId, laboratoryId);
            return;
        }

        if (!msg.FullyPaid)
        {
            _logger.LogInformation(
                "[BillingPaymentConfirmedHandler] Order {RequisitionId} is only partially paid ({AmountPaid} of {AmountDue}); it stays unpaid.",
                requisition.Id, msg.AmountPaid, msg.AmountDue);
            return;
        }

        if (requisition.PaidAtUtc != null)
        {
            _logger.LogInformation(
                "[BillingPaymentConfirmedHandler] Order {RequisitionId} is already paid. Skipping.", requisition.Id);
            return;
        }

        requisition.PaidAtUtc = msg.PaidAtUtc;
        requisition.InvoiceId = msg.InvoiceId;
        requisition.ReceiptNumber = msg.ReceiptNumber;
        requisition.PaymentCorrection = PaymentCorrection.None;
        requisition.PaymentCorrectedAtUtc = null;

        // Queued before the save: the payment and its announcement commit together. A postpaid order that is already
        // being worked on is past this stage, so only the payment fields change for it.
        await _lifecycle.TransitionAsync(requisition, RequisitionStage.Paid, null, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        _logger.LogInformation(
            "[BillingPaymentConfirmedHandler] Order {RequisitionId} paid (receipt {ReceiptNumber}); stage is {Stage}.",
            requisition.Id, requisition.ReceiptNumber, requisition.Stage);
    }
}
