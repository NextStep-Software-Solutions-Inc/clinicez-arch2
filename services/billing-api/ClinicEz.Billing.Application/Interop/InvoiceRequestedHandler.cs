using ClinicEz.Billing.Application.Abstractions;
using ClinicEz.Billing.Application.Services;
using ClinicEz.Billing.Domain.Entities;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Billing.Application.Interop;

/// <summary>
/// <c>billing.invoice.requested</c>: a facility of this cell asks the cashier for an invoice.
/// <list type="bullet">
/// <item>The sender (<c>From</c>) must be a facility and must be exactly the tenant/facility named in the payload, and the
/// message must be addressed to that same facility's billing mailbox. Anything else is a spoof or a misroute and is ignored.</item>
/// <item>Upsert by <c>(tenant, facility, InvoiceRequestId)</c>: a re-send replaces the lines while the invoice is unpaid; once
/// anything was paid (or the invoice was voided) re-sends are ignored, never rewriting a ledger record.</item>
/// <item>Malformed lines can never succeed on retry, so they are logged and acknowledged instead of redelivered.</item>
/// <item>An invoice with nothing to collect is settled on arrival and the facility is told right away.</item>
/// </list>
/// Facilities are trusted for their own tenant/facility only: anything arriving through this cell's hub client registers the
/// facility in <see cref="BillingFacility"/>.
/// </summary>
public sealed class InvoiceRequestedHandler : IInteropHandler<BillingInvoiceRequestedPayload>
{
    private readonly IBillingDbContext _db;
    private readonly IInteropPublisher _publisher;
    private readonly DocumentNumbers _numbers;
    private readonly AuditTrail _audit;
    private readonly TimeProvider _clock;
    private readonly ILogger<InvoiceRequestedHandler> _logger;

    public InvoiceRequestedHandler(
        IBillingDbContext db,
        IInteropPublisher publisher,
        DocumentNumbers numbers,
        AuditTrail audit,
        TimeProvider clock,
        ILogger<InvoiceRequestedHandler> logger)
    {
        _db = db;
        _publisher = publisher;
        _numbers = numbers;
        _audit = audit;
        _clock = clock;
        _logger = logger;
    }

    public async Task HandleAsync(BillingInvoiceRequestedPayload payload, InteropMessageContext context, CancellationToken ct)
    {
        var from = context.From;
        var to = context.To;

        if (from.Kind != PartyKind.Facility || string.IsNullOrWhiteSpace(from.TenantId) || string.IsNullOrWhiteSpace(from.FacilityId))
        {
            _logger.LogWarning("[Billing] Ignoring {Type} {MessageId}: sender {Sender} is not an identifiable facility.", context.Type, context.MessageId, from.Address);
            return;
        }

        var tenantId = from.TenantId;
        var facilityId = from.FacilityId;

        if (!string.Equals(payload.TenantId, tenantId, StringComparison.Ordinal) || !string.Equals(payload.FacilityId, facilityId, StringComparison.Ordinal))
        {
            _logger.LogWarning(
                "[Billing] Ignoring {Type} {MessageId}: sender {Sender} claims to invoice for {PayloadTenant}/{PayloadFacility}.",
                context.Type, context.MessageId, from.Address, payload.TenantId, payload.FacilityId);
            return;
        }

        if (to.Kind != PartyKind.Facility
            || !string.Equals(to.TenantId, tenantId, StringComparison.Ordinal)
            || !string.Equals(to.FacilityId, facilityId, StringComparison.Ordinal)
            || !string.Equals(to.Service, InteropServices.Billing, StringComparison.Ordinal))
        {
            _logger.LogWarning("[Billing] Ignoring {Type} {MessageId}: {Recipient} is not the billing mailbox of {Sender}.", context.Type, context.MessageId, to.Address, from.Address);
            return;
        }

        if (from.FacilityType is { } senderType && senderType != payload.FacilityType)
        {
            _logger.LogWarning("[Billing] Ignoring {Type} {MessageId}: payload facility type {PayloadType} does not match the sender ({SenderType}).", context.Type, context.MessageId, payload.FacilityType, senderType);
            return;
        }

        if (payload.InvoiceRequestId == Guid.Empty)
        {
            _logger.LogWarning("[Billing] Ignoring {Type} {MessageId}: InvoiceRequestId is empty.", context.Type, context.MessageId);
            return;
        }

        try
        {
            await UpsertAsync(payload, tenantId, facilityId, ct);
        }
        catch (BadRequestException ex)
        {
            _logger.LogWarning("[Billing] Ignoring {Type} {MessageId}: invalid invoice request {RequestId}: {Reason}", context.Type, context.MessageId, payload.InvoiceRequestId, ex.Message);
        }
    }

    private async Task UpsertAsync(BillingInvoiceRequestedPayload payload, string tenantId, string facilityId, CancellationToken ct)
    {
        var now = _clock.GetUtcNow().UtcDateTime;
        var lines = payload.Lines.Select(l => new InvoiceLineInput(l.Code, l.Description, l.Quantity, l.UnitPrice)).ToList();
        var patientName = string.IsNullOrWhiteSpace(payload.PatientName) ? "Unknown patient" : payload.PatientName;

        var invoice = await _db.Invoices.IgnoreQueryFilters()
            .Include(i => i.Lines)
            .Include(i => i.Discounts)
            .FirstOrDefaultAsync(i => i.TenantId == tenantId && i.FacilityId == facilityId && i.InvoiceRequestId == payload.InvoiceRequestId, ct);

        string action;
        if (invoice is null)
        {
            invoice = Invoice.Create(
                tenantId, facilityId, payload.FacilityType, payload.BranchId, InvoiceOrigin.Requested, payload.InvoiceRequestId,
                payload.SourceType, payload.SourceId, payload.PatientId, patientName, payload.VisitKey, payload.Currency,
                lines, "system:interop", now);
            var (_, number) = await _numbers.NextAsync(tenantId, facilityId, DocumentNumbers.Invoice, ct);
            invoice.AssignNumber(number);
            _db.Invoices.Add(invoice);
            action = "invoice.requested";
        }
        else if (invoice.IsLocked)
        {
            _logger.LogInformation(
                "[Billing] Invoice request {RequestId} for {Tenant}/{Facility} is {Status}; the re-sent request is ignored.",
                payload.InvoiceRequestId, tenantId, facilityId, invoice.Status);
            return;
        }
        else
        {
            invoice.ReplaceRequest(payload.BranchId, payload.SourceType, payload.SourceId, payload.PatientId, patientName, payload.VisitKey, payload.Currency, lines, now);
            action = "invoice.updated";
        }

        await RegisterFacilityAsync(tenantId, facilityId, payload.FacilityType, now, ct);

        if (invoice.Total == 0m)
        {
            invoice.SettleWithoutCharge(now);
            BillingMessages.PaymentConfirmed(_publisher, invoice, null, null, now);
            action += ".settled-no-charge";
        }

        _audit.Record(null, tenantId, facilityId, action, nameof(Invoice), invoice.Id,
            new { invoice.InvoiceNumber, invoice.SourceType, invoice.SourceId, invoice.Total, Lines = invoice.Lines.Count });

        await _db.SaveChangesAsync(ct);
    }

    private async Task RegisterFacilityAsync(string tenantId, string facilityId, ClinicEz.Shared.Common.FacilityType type, DateTime now, CancellationToken ct)
    {
        var facility = await _db.BillingFacilities.IgnoreQueryFilters()
            .FirstOrDefaultAsync(f => f.TenantId == tenantId && f.FacilityId == facilityId, ct);
        if (facility is null)
        {
            _db.BillingFacilities.Add(new BillingFacility
            {
                Id = Guid.NewGuid(), TenantId = tenantId, FacilityId = facilityId, FacilityType = type, FirstSeenUtc = now, LastSeenUtc = now
            });
        }
        else
        {
            facility.LastSeenUtc = now;
        }
    }
}
