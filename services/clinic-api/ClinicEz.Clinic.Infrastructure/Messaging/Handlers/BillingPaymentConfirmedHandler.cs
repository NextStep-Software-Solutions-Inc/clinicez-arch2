using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Messaging;

/// <summary>
/// Records a payment taken at the shared billing counter (<c>billing.payment.confirmed</c>) against the clinic invoice that
/// requested it. The invoice is matched by the request id (the envelope correlation id) inside the addressed clinic, and the
/// message must come from this clinic's own billing mailbox. The amount paid only ever moves forward, so a redelivered or
/// out-of-order confirmation never adds a payment twice.
/// </summary>
public sealed class BillingPaymentConfirmedHandler : IInteropHandler<BillingPaymentConfirmedPayload>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ClinicRecipientResolver _recipient;
    private readonly ILogger<BillingPaymentConfirmedHandler> _logger;

    public BillingPaymentConfirmedHandler(
        ApplicationDbContext dbContext,
        ClinicRecipientResolver recipient,
        ILogger<BillingPaymentConfirmedHandler> logger)
    {
        _dbContext = dbContext;
        _recipient = recipient;
        _logger = logger;
    }

    public async Task HandleAsync(BillingPaymentConfirmedPayload message, InteropMessageContext context, CancellationToken ct)
    {
        var clinic = await _recipient.ResolveAsync(context, ct);
        if (clinic == null) return;

        var from = context.From;
        if (from.Kind != PartyKind.Facility
            || !string.Equals(from.Service, InteropServices.Billing, StringComparison.OrdinalIgnoreCase)
            || !string.Equals(from.TenantId?.Trim(), clinic.TenantId, StringComparison.OrdinalIgnoreCase)
            || !string.Equals(from.FacilityId?.Trim(), clinic.ClinicId.ToString(), StringComparison.OrdinalIgnoreCase))
        {
            Ignore(context, "the sender is not this clinic's billing counter");
            return;
        }

        var invoiceRequestId = context.CorrelationId;
        if (message.InvoiceRequestId != invoiceRequestId)
        {
            Ignore(context, $"invoice request {message.InvoiceRequestId} does not match correlation {invoiceRequestId}");
            return;
        }

        var invoice = await _dbContext.Invoices
            .IgnoreQueryFilters()
            .Include(i => i.Payments)
            .FirstOrDefaultAsync(i => !i.IsDeleted && i.ClinicId == clinic.ClinicId && i.Id == invoiceRequestId, ct);
        if (invoice == null)
        {
            Ignore(context, $"invoice {invoiceRequestId} is unknown to clinic {clinic.ClinicId}");
            return;
        }

        if (invoice.Status is InvoiceStatus.Voided or InvoiceStatus.Refunded)
        {
            Ignore(context, $"invoice {invoice.InvoiceNumber} is {invoice.Status}");
            return;
        }

        var confirmedPaid = Math.Min(Math.Max(message.AmountPaid, 0m), invoice.NetAmount);
        var delta = confirmedPaid - invoice.AmountPaid;
        if (delta <= 0m)
        {
            _logger.LogInformation("[ClinicEz.Clinic] Payment confirmation for invoice {InvoiceNumber} is already recorded.", invoice.InvoiceNumber);
            return;
        }

        var now = DateTime.UtcNow;
        _dbContext.Payments.Add(new PaymentRecord
        {
            Id = Guid.NewGuid(),
            InvoiceId = invoice.Id,
            TenantId = invoice.TenantId,
            ClinicId = invoice.ClinicId,
            PaymentNumber = ReceiptNumber(message, invoice, now),
            PaymentDate = message.PaidAtUtc,
            Amount = delta,
            Method = ParseMethod(message.PaymentMethod),
            ReferenceNumber = message.ReceiptNumber,
            Notes = "Paid at the shared billing counter.",
            CreatedAt = now,
            CreatedBy = "System:BillingPaymentConfirmed"
        });

        invoice.AmountPaid = confirmedPaid;
        invoice.BalanceDue = Math.Max(0m, invoice.NetAmount - confirmedPaid);
        invoice.Status = message.FullyPaid || invoice.BalanceDue <= 0m ? InvoiceStatus.Paid : InvoiceStatus.PartiallyPaid;
        invoice.UpdatedAt = now;

        await _dbContext.SaveChangesAsync(ct);

        _logger.LogInformation("[ClinicEz.Clinic] Invoice {InvoiceNumber} is now {Status} ({Paid} of {Net}).",
            invoice.InvoiceNumber, invoice.Status, invoice.AmountPaid, invoice.NetAmount);
    }

    private static string ReceiptNumber(BillingPaymentConfirmedPayload message, Invoice invoice, DateTime now) =>
        !string.IsNullOrWhiteSpace(message.ReceiptNumber)
            ? message.ReceiptNumber.Trim()
            : $"OR-{now:yyyyMMdd}-{invoice.Payments.Count + 1:D3}";

    private static PaymentMethod ParseMethod(string? method) =>
        Enum.TryParse<PaymentMethod>(method?.Trim(), ignoreCase: true, out var parsed) ? parsed : PaymentMethod.Cash;

    private void Ignore(InteropMessageContext context, string reason) =>
        _logger.LogWarning("[ClinicEz.Clinic] Ignoring {Type} message {MessageId}: {Reason}.", context.Type, context.MessageId, reason);
}
