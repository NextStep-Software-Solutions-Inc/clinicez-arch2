using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Billing.Application.Abstractions;
using ClinicEz.Billing.Application.Dtos;
using ClinicEz.Billing.Domain;
using ClinicEz.Billing.Domain.Constants;
using ClinicEz.Billing.Domain.Entities;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Billing.Domain.Services;
using ClinicEz.Shared.Exceptions;

namespace ClinicEz.Billing.Application.Services;

/// <summary>
/// Discounts. Senior citizen and PWD (a statutory 20%) are applied by cashiers with the patient's ID number;
/// promo and other discounts need a supervisor (the signed-in supervisor is recorded as the approver).
/// Discounts only apply to invoices nothing was paid on.
/// </summary>
public sealed class DiscountService
{
    private readonly IBillingDbContext _db;
    private readonly IBillingContext _context;
    private readonly VisitBillService _visits;
    private readonly AuditTrail _audit;
    private readonly TimeProvider _clock;

    public DiscountService(IBillingDbContext db, IBillingContext context, VisitBillService visits, AuditTrail audit, TimeProvider clock)
    {
        _db = db;
        _context = context;
        _visits = visits;
        _audit = audit;
        _clock = clock;
    }

    public async Task<InvoiceDto> ApplyToInvoiceAsync(Guid invoiceId, ApplyDiscountRequest request, CancellationToken ct)
    {
        var caller = _context.RequireStaff();
        var approver = Authorize(caller, request.Kind);
        var invoice = await _visits.RequireInvoiceAsync(caller.TenantId, invoiceId, true, ct);

        Apply(caller, invoice, request, request.Value, approver);
        await _db.SaveOrConflictAsync(ct);
        return InvoiceMapper.ToDto(invoice);
    }

    /// <summary>
    /// Applies the discount to the whole visit bill. A percentage goes on every eligible invoice; a fixed amount is split
    /// over them in proportion to their totals (left-over cents on the last). Invoices already partly paid, or already
    /// carrying a statutory discount, are skipped and reported.
    /// </summary>
    public async Task<VisitDiscountResult> ApplyToVisitAsync(Guid anchorInvoiceId, ApplyDiscountRequest request, CancellationToken ct)
    {
        var caller = _context.RequireStaff();
        var approver = Authorize(caller, request.Kind);
        var anchor = await _visits.RequireInvoiceAsync(caller.TenantId, anchorInvoiceId, true, ct);
        var group = await _visits.LoadGroupAsync(caller.TenantId, anchor, true, ct);

        var statutory = request.Kind is DiscountKind.Senior or DiscountKind.Pwd;
        var eligible = group.Where(i => !i.IsLocked && !(statutory && i.Discounts.Any(d => d.Kind is DiscountKind.Senior or DiscountKind.Pwd))).ToList();
        if (eligible.Count == 0) throw new ConflictException("No invoice of this visit can take the discount any more.");

        var values = new decimal?[eligible.Count];
        if (request.Mode == DiscountMode.Fixed && !statutory)
        {
            var amount = request.Value ?? throw new BadRequestException("Discount mode and value are required.");
            var shares = Money.Distribute(amount, eligible.Select(i => i.Total).ToList());
            for (var n = 0; n < values.Length; n++) values[n] = shares[n];
        }
        else
        {
            for (var n = 0; n < values.Length; n++) values[n] = request.Value;
        }

        var applied = new List<Guid>();
        for (var n = 0; n < eligible.Count; n++)
        {
            if (values[n] == 0m) continue;
            Apply(caller, eligible[n], request, values[n], approver);
            applied.Add(eligible[n].Id);
        }

        if (applied.Count == 0) throw new BadRequestException("The discount is too small to share over the invoices of this visit.");

        await _db.SaveOrConflictAsync(ct);
        var skipped = group.Select(i => i.Id).Except(applied).ToList();
        return new VisitDiscountResult(applied, skipped, VisitBillService.ToDto(group));
    }

    private void Apply(BillingCaller caller, Invoice invoice, ApplyDiscountRequest request, decimal? value, BillingCaller? approver)
    {
        var discount = invoice.ApplyDiscount(
            request.Kind, request.Mode, value, request.Reason, request.IdNumber, caller.UserId, caller.UserName,
            approver?.UserId, approver?.UserName, _clock.GetUtcNow().UtcDateTime);

        _audit.Record(caller, caller.TenantId, caller.FacilityId, "discount.applied", nameof(Invoice), invoice.Id,
            new { discount.Kind, discount.Mode, discount.Value, discount.Amount, discount.Reason, discount.IdNumber, ApprovedBy = approver?.UserName, invoice.InvoiceNumber });
    }

    private static BillingCaller? Authorize(BillingCaller caller, DiscountKind kind)
    {
        if (kind is DiscountKind.Senior or DiscountKind.Pwd) return null;
        if (!caller.Has(BillingPermissions.Approvals))
            throw new ForbiddenException("Promo and other discounts need a supervisor's approval.");
        return caller;
    }
}
