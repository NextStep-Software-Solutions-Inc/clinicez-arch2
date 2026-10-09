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
/// Applies a correction made at the shared billing counter (<c>billing.invoice.voided</c>) to the clinic invoice that requested
/// it: a void of an unpaid bill marks the invoice <see cref="InvoiceStatus.Voided"/>, a refund marks it
/// <see cref="InvoiceStatus.Refunded"/> and books the money given back as a reversing payment so collections net out. Either way
/// nothing is owed any more and the visit can be invoiced again. The invoice is matched by the request id (the envelope
/// correlation id) inside the addressed clinic, and the message must come from this clinic's own billing mailbox. An invoice that
/// was already voided or refunded is left alone, so a redelivery changes nothing.
/// </summary>
public sealed class BillingInvoiceVoidedHandler : IInteropHandler<BillingInvoiceVoidedPayload>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly ClinicRecipientResolver _recipient;
    private readonly ILogger<BillingInvoiceVoidedHandler> _logger;

    public BillingInvoiceVoidedHandler(
        ApplicationDbContext dbContext,
        ClinicRecipientResolver recipient,
        ILogger<BillingInvoiceVoidedHandler> logger)
    {
        _dbContext = dbContext;
        _recipient = recipient;
        _logger = logger;
    }

    public async Task HandleAsync(BillingInvoiceVoidedPayload message, InteropMessageContext context, CancellationToken ct)
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
            _logger.LogInformation("[ClinicEz.Clinic] Correction for invoice {InvoiceNumber} is already recorded ({Status}).",
                invoice.InvoiceNumber, invoice.Status);
            return;
        }

        var now = DateTime.UtcNow;
        var reversed = Math.Min(invoice.AmountPaid, Math.Max(message.AmountReversed, 0m));
        if (reversed > 0m)
        {
            // The give-back is its own dated entry (never an edit of the original receipt), so end-of-day collections net out.
            _dbContext.Payments.Add(new PaymentRecord
            {
                Id = Guid.NewGuid(),
                InvoiceId = invoice.Id,
                TenantId = invoice.TenantId,
                ClinicId = invoice.ClinicId,
                PaymentNumber = $"RF-{now:yyyyMMdd}-{invoice.Payments.Count + 1:D3}",
                PaymentDate = message.CorrectedAtUtc,
                Amount = -reversed,
                Method = invoice.Payments.OrderByDescending(p => p.PaymentDate).Select(p => p.Method).FirstOrDefault(),
                Notes = "Refunded at the shared billing counter.",
                CreatedAt = now,
                CreatedBy = "System:BillingInvoiceVoided"
            });
        }

        invoice.AmountPaid -= reversed;
        invoice.BalanceDue = 0m;
        invoice.Status = message.Kind == BillingCorrectionKind.Refund ? InvoiceStatus.Refunded : InvoiceStatus.Voided;
        invoice.UpdatedAt = now;

        await _dbContext.SaveChangesAsync(ct);

        _logger.LogInformation("[ClinicEz.Clinic] Invoice {InvoiceNumber} is now {Status} ({Reversed} given back).",
            invoice.InvoiceNumber, invoice.Status, reversed);
    }

    private void Ignore(InteropMessageContext context, string reason) =>
        _logger.LogWarning("[ClinicEz.Clinic] Ignoring {Type} message {MessageId}: {Reason}.", context.Type, context.MessageId, reason);
}
