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
/// <c>billing.payment.confirmed</c>: this pharmacy's billing service reports payment for an invoice the pharmacy requested.
/// Only that billing mailbox (same tenant and facility as the recipient) may confirm; the handler runs in the recipient
/// pharmacy's scope and marks the matching order <see cref="PrescriptionPaymentStatus.Paid"/> once the invoice is fully paid.
/// Idempotent: a redelivery or a repeat for an order that is already paid changes nothing. A payment can only follow the
/// invoice request, so an unknown order is ignored (acknowledged and logged) rather than retried.
/// </summary>
public sealed class BillingPaymentConfirmedHandler : IInteropHandler<BillingPaymentConfirmedPayload>
{
    private const string PrescriptionSourceType = "Prescription";

    private readonly IRepository<PrescriptionOrder> _orderRepository;
    private readonly IRepository<PharmacySettings> _settingsRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IPharmacyScopeSetter _scope;
    private readonly ILogger<BillingPaymentConfirmedHandler> _logger;

    public BillingPaymentConfirmedHandler(
        IRepository<PrescriptionOrder> orderRepository,
        IRepository<PharmacySettings> settingsRepository,
        IUnitOfWork unitOfWork,
        IPharmacyScopeSetter scope,
        ILogger<BillingPaymentConfirmedHandler> logger)
    {
        _orderRepository = orderRepository;
        _settingsRepository = settingsRepository;
        _unitOfWork = unitOfWork;
        _scope = scope;
        _logger = logger;
    }

    public async Task HandleAsync(BillingPaymentConfirmedPayload msg, InteropMessageContext context, CancellationToken ct)
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
                "[BillingPaymentConfirmedHandler] Ignoring {MessageId}: recipient {Recipient} is not a pharmacy address.",
                context.MessageId, to.Address);
            return;
        }

        if (from.Kind != PartyKind.Facility
            || from.Service != InteropServices.Billing
            || from.TenantId != to.TenantId
            || from.FacilityId != to.FacilityId)
        {
            _logger.LogWarning(
                "[BillingPaymentConfirmedHandler] Ignoring {MessageId}: sender {Sender} is not the billing service of {Recipient}.",
                context.MessageId, from.Address, to.Address);
            return;
        }

        if (!string.Equals(msg.SourceType, PrescriptionSourceType, StringComparison.Ordinal))
        {
            _logger.LogWarning(
                "[BillingPaymentConfirmedHandler] Ignoring {MessageId}: source type '{SourceType}' is not a prescription.",
                context.MessageId, msg.SourceType);
            return;
        }

        _scope.Enter(to.TenantId, pharmacyId);

        if (!await _settingsRepository.Query(s => s.PharmacyId == pharmacyId).AnyAsync(ct))
        {
            _logger.LogWarning(
                "[BillingPaymentConfirmedHandler] Ignoring {MessageId}: {Recipient} is not a pharmacy provisioned on this server.",
                context.MessageId, to.Address);
            return;
        }

        var order = await _orderRepository.Query(o => o.Id == msg.InvoiceRequestId).FirstOrDefaultAsync(ct);
        if (order is null)
        {
            _logger.LogWarning(
                "[BillingPaymentConfirmedHandler] Ignoring {MessageId}: no prescription order {InvoiceRequestId} at {Recipient}.",
                context.MessageId, msg.InvoiceRequestId, to.Address);
            return;
        }

        if (order.PaymentStatus != PrescriptionPaymentStatus.AwaitingPayment)
        {
            _logger.LogInformation(
                "[BillingPaymentConfirmedHandler] Order {PrescriptionNo} is {PaymentStatus}; nothing to record for {MessageId}.",
                order.PrescriptionNumber, order.PaymentStatus, context.MessageId);
            return;
        }

        order.PaidAmount = msg.AmountPaid;
        order.UpdatedAt = DateTime.UtcNow;
        order.UpdatedBy = "SystemInterop";

        if (msg.FullyPaid)
        {
            order.PaymentStatus = PrescriptionPaymentStatus.Paid;
            order.PaidAt = msg.PaidAtUtc;
            order.PaymentReceiptNumber = msg.ReceiptNumber;
        }

        _orderRepository.Update(order);
        await _unitOfWork.SaveChangesAsync(ct);

        _logger.LogInformation(
            "[BillingPaymentConfirmedHandler] Recorded payment of {AmountPaid} for Prescription {PrescriptionNo} (fully paid: {FullyPaid}).",
            msg.AmountPaid, order.PrescriptionNumber, msg.FullyPaid);
    }
}
