using ClinicEz.Pharmacy.Application.Common.Interfaces;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Pharmacy.Application.Interop;

/// <summary>
/// <c>billing.invoice.voided</c>: this pharmacy's billing service voided an unpaid invoice or refunded a paid one. Only that
/// billing mailbox (same tenant and facility as the recipient) may correct; the handler runs in the recipient pharmacy's scope.
/// <list type="bullet">
/// <item>Not yet dispensed: the order goes back to <see cref="PrescriptionPaymentStatus.AwaitingPayment"/> with the recorded
/// payment cleared, so a Prepaid order is blocked from dispensing again until it is paid. In the same save,
/// <c>billing.invoice.requested</c> is sent again with the same invoice request id (accepted items only), which makes billing
/// reopen the voided invoice for payment.</item>
/// <item>Already dispensed: the correction is only recorded (<see cref="PrescriptionPaymentStatus.Voided"/> /
/// <see cref="PrescriptionPaymentStatus.Refunded"/>) and logged; nothing is reopened.</item>
/// <item>Partial refund (<c>IsPartial</c>): the invoice stays settled, so the order is neither reopened nor marked unpaid and keeps
/// its payment status; only the cumulative refunded total is recorded.</item>
/// </list>
/// The prescription's clinical status does not change, so no <c>rx.status.changed</c> is sent. Idempotent: a correction that
/// is not newer than the one already recorded, or that predates the recorded payment, changes nothing.
/// </summary>
public sealed class BillingInvoiceVoidedHandler : IInteropHandler<BillingInvoiceVoidedPayload>
{
    private const string PrescriptionSourceType = "Prescription";

    private readonly IRepository<PrescriptionOrder> _orderRepository;
    private readonly IRepository<PharmacySettings> _settingsRepository;
    private readonly IPharmacyBillingPublisher _billingPublisher;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IPharmacyScopeSetter _scope;
    private readonly ILogger<BillingInvoiceVoidedHandler> _logger;

    public BillingInvoiceVoidedHandler(
        IRepository<PrescriptionOrder> orderRepository,
        IRepository<PharmacySettings> settingsRepository,
        IPharmacyBillingPublisher billingPublisher,
        IUnitOfWork unitOfWork,
        IPharmacyScopeSetter scope,
        ILogger<BillingInvoiceVoidedHandler> logger)
    {
        _orderRepository = orderRepository;
        _settingsRepository = settingsRepository;
        _billingPublisher = billingPublisher;
        _unitOfWork = unitOfWork;
        _scope = scope;
        _logger = logger;
    }

    public async Task HandleAsync(BillingInvoiceVoidedPayload msg, InteropMessageContext context, CancellationToken ct)
    {
        var from = context.From;
        var to = context.To;

        if (to.Kind != PartyKind.Facility
            || to.FacilityType is not null and not FacilityType.Pharmacy
            || string.IsNullOrWhiteSpace(to.TenantId)
            || !Guid.TryParse(to.FacilityId, out var pharmacyId)
            || pharmacyId == Guid.Empty)
        {
            _logger.LogWarning(
                "[BillingInvoiceVoidedHandler] Ignoring {MessageId}: recipient {Recipient} is not a pharmacy address.",
                context.MessageId, to.Address);
            return;
        }

        if (from.Kind != PartyKind.Facility
            || from.Service != InteropServices.Billing
            || from.TenantId != to.TenantId
            || from.FacilityId != to.FacilityId)
        {
            _logger.LogWarning(
                "[BillingInvoiceVoidedHandler] Ignoring {MessageId}: sender {Sender} is not the billing service of {Recipient}.",
                context.MessageId, from.Address, to.Address);
            return;
        }

        if (!string.Equals(msg.SourceType, PrescriptionSourceType, StringComparison.Ordinal) || msg.InvoiceRequestId is not { } orderId)
        {
            _logger.LogWarning(
                "[BillingInvoiceVoidedHandler] Ignoring {MessageId}: source type '{SourceType}' / invoice request {InvoiceRequestId} is not a prescription order.",
                context.MessageId, msg.SourceType, msg.InvoiceRequestId);
            return;
        }

        _scope.Enter(to.TenantId, pharmacyId);

        if (!await _settingsRepository.Query(s => s.PharmacyId == pharmacyId).AnyAsync(ct))
        {
            _logger.LogWarning(
                "[BillingInvoiceVoidedHandler] Ignoring {MessageId}: {Recipient} is not a pharmacy provisioned on this server.",
                context.MessageId, to.Address);
            return;
        }

        var order = await _orderRepository.Query(o => o.Id == orderId).Include(o => o.Items).FirstOrDefaultAsync(ct);
        if (order is null)
        {
            _logger.LogWarning(
                "[BillingInvoiceVoidedHandler] Ignoring {MessageId}: no prescription order {InvoiceRequestId} at {Recipient}.",
                context.MessageId, orderId, to.Address);
            return;
        }

        if (order.PaymentStatus == PrescriptionPaymentStatus.NotRequired
            || order.Status is PrescriptionStatus.Cancelled or PrescriptionStatus.Rejected)
        {
            _logger.LogInformation(
                "[BillingInvoiceVoidedHandler] Order {PrescriptionNo} is {Status}/{PaymentStatus} and has no live invoice; nothing to correct for {MessageId}.",
                order.PrescriptionNumber, order.Status, order.PaymentStatus, context.MessageId);
            return;
        }

        if (order.PaymentCorrectedAt >= msg.CorrectedAtUtc || order.PaidAt > msg.CorrectedAtUtc)
        {
            _logger.LogInformation(
                "[BillingInvoiceVoidedHandler] Correction {MessageId} for Prescription {PrescriptionNo} is already applied or predates the recorded payment; ignored.",
                context.MessageId, order.PrescriptionNumber);
            return;
        }

        var reversed = msg.RefundedTotal > 0 ? msg.RefundedTotal : msg.AmountReversed;

        if (msg.IsPartial && msg.Kind == BillingCorrectionKind.Refund)
        {
            _logger.LogInformation(
                "[BillingInvoiceVoidedHandler] Prescription {PrescriptionNo} was partially refunded by billing ({AmountReversed} now, {RefundedTotal} in total); the order stays {PaymentStatus}.",
                order.PrescriptionNumber, msg.AmountReversed, msg.RefundedTotal, order.PaymentStatus);
        }
        else if (order.Status == PrescriptionStatus.Dispensed)
        {
            order.PaymentStatus = msg.Kind == BillingCorrectionKind.Refund
                ? PrescriptionPaymentStatus.Refunded
                : PrescriptionPaymentStatus.Voided;
            _logger.LogWarning(
                "[BillingInvoiceVoidedHandler] Prescription {PrescriptionNo} was already dispensed when billing {Kind} its invoice (reversed {AmountReversed}); recorded only.",
                order.PrescriptionNumber, msg.Kind, msg.AmountReversed);
        }
        else
        {
            order.PaymentStatus = PrescriptionPaymentStatus.AwaitingPayment;
            order.PaidAmount = null;
            order.PaidAt = null;
            order.PaymentReceiptNumber = null;
            _billingPublisher.EnqueueInvoiceRequest(order);
            _logger.LogInformation(
                "[BillingInvoiceVoidedHandler] Prescription {PrescriptionNo} is back to awaiting payment after billing {Kind} its invoice (reversed {AmountReversed}); invoice re-requested.",
                order.PrescriptionNumber, msg.Kind, msg.AmountReversed);
        }

        order.PaymentCorrectedAt = msg.CorrectedAtUtc;
        order.PaymentReversedAmount = reversed;
        order.UpdatedAt = DateTime.UtcNow;
        order.UpdatedBy = "SystemInterop";

        _orderRepository.Update(order);
        await _unitOfWork.SaveChangesAsync(ct);
    }
}
