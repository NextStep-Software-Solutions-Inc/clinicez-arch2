using ClinicEz.Billing.Application.Abstractions;
using ClinicEz.Billing.Application.Dtos;
using ClinicEz.Billing.Domain;
using ClinicEz.Billing.Domain.Constants;
using ClinicEz.Billing.Domain.Entities;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Billing.Domain.Services;
using ClinicEz.Shared.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Billing.Application.Services;

public static class UnitOfWorkExtensions
{
    /// <summary>Saves, turning an optimistic-concurrency clash (two cashiers touching the same record) into a retryable 409.</summary>
    public static async Task SaveOrConflictAsync(this IBillingDbContext db, CancellationToken ct)
    {
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException ex)
        {
            throw new ConflictException("Another cashier changed the same record at the same time. Reload and try again.", ex);
        }
    }
}

/// <summary>
/// The consolidated visit bill: every open invoice of one patient's visit (same tenant + branch + visit key) across the
/// facilities of this cell, as ONE total at the shared counter. Tenant scope always comes from the signed-in cashier.
/// </summary>
public sealed class VisitBillService
{
    private static readonly InvoiceStatus[] Collectable = { InvoiceStatus.Open, InvoiceStatus.PartiallyPaid };

    private readonly IBillingDbContext _db;
    private readonly IBillingContext _context;

    public VisitBillService(IBillingDbContext db, IBillingContext context)
    {
        _db = db;
        _context = context;
    }

    public async Task<Invoice> RequireInvoiceAsync(string tenantId, Guid invoiceId, bool track, CancellationToken ct)
    {
        IQueryable<Invoice> query = _db.Invoices.Include(i => i.Lines).Include(i => i.Discounts).Where(i => i.TenantId == tenantId && i.Id == invoiceId);
        if (!track) query = query.AsNoTracking();
        return await query.FirstOrDefaultAsync(ct) ?? throw new NotFoundException("Invoice not found.");
    }

    /// <summary>The visit bill (group of invoices) that contains <paramref name="anchor"/>; closed invoices are never part of one.</summary>
    public async Task<List<Invoice>> LoadGroupAsync(string tenantId, Invoice anchor, bool track, CancellationToken ct)
    {
        if (anchor.VisitKey is null || anchor.Status is InvoiceStatus.Void or InvoiceStatus.Refunded) return new List<Invoice> { anchor };

        var visitKey = anchor.VisitKey.ToLower();
        IQueryable<Invoice> query = _db.Invoices.Include(i => i.Lines).Include(i => i.Discounts)
            .Where(i => i.TenantId == tenantId && i.VisitKey != null && i.VisitKey.ToLower() == visitKey
                        && i.Status != InvoiceStatus.Void && i.Status != InvoiceStatus.Refunded);
        if (!track) query = query.AsNoTracking();

        var candidates = await query.ToListAsync(ct);
        var anchorInList = candidates.FindIndex(i => i.Id == anchor.Id);
        if (anchorInList < 0) candidates.Add(anchor);
        else candidates[anchorInList] = anchor;

        return VisitBillGrouper.Group(candidates).First(g => g.Any(i => i.Id == anchor.Id));
    }

    public async Task<VisitBillDto> GetAsync(Guid anchorInvoiceId, CancellationToken ct)
    {
        var caller = _context.RequireStaff();
        var anchor = await RequireInvoiceAsync(caller.TenantId, anchorInvoiceId, false, ct);
        return ToDto(await LoadGroupAsync(caller.TenantId, anchor, false, ct));
    }

    public async Task<IReadOnlyList<VisitBillSummaryDto>> SearchAsync(string? search, string? visitKey, string? branchId, string? facilityId, CancellationToken ct)
    {
        var caller = _context.RequireStaff();
        var tenantId = caller.TenantId;

        var query = _db.Invoices.AsNoTracking().Where(i => i.TenantId == tenantId && (i.Status == InvoiceStatus.Open || i.Status == InvoiceStatus.PartiallyPaid));
        if (!string.IsNullOrWhiteSpace(branchId)) query = query.Where(i => i.BranchId == branchId);
        if (!string.IsNullOrWhiteSpace(facilityId)) query = query.Where(i => i.FacilityId == facilityId);
        if (!string.IsNullOrWhiteSpace(visitKey))
        {
            var key = visitKey.Trim().ToLower();
            query = query.Where(i => i.VisitKey != null && i.VisitKey.ToLower() == key);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(i => i.PatientName.ToLower().Contains(term)
                                     || (i.VisitKey != null && i.VisitKey.ToLower().Contains(term))
                                     || i.InvoiceNumber.ToLower().Contains(term));
        }

        var matched = await query.OrderByDescending(i => i.CreatedAtUtc).Take(300).ToListAsync(ct);

        // A search hit on one facility's invoice must still show the WHOLE visit: pull in the sibling invoices.
        var visitKeys = matched.Where(i => i.VisitKey != null).Select(i => i.VisitKey!.ToLower()).Distinct().ToList();
        var siblings = visitKeys.Count == 0
            ? new List<Invoice>()
            : await _db.Invoices.AsNoTracking()
                .Where(i => i.TenantId == tenantId && (i.Status == InvoiceStatus.Open || i.Status == InvoiceStatus.PartiallyPaid)
                            && i.VisitKey != null && visitKeys.Contains(i.VisitKey.ToLower()))
                .ToListAsync(ct);

        var all = matched.Concat(siblings).DistinctBy(i => i.Id).ToList();
        return VisitBillGrouper.Group(all)
            .Select(g => new VisitBillSummaryDto(
                g[0].Id, g[0].VisitKey, g[0].BranchId, g.Select(i => i.PatientId).FirstOrDefault(p => p is not null), g[0].PatientName, g[0].Currency,
                g.Count, g.Select(i => i.FacilityType).Distinct().ToList(), g.Sum(i => i.Total), g.Sum(i => i.Balance), g[0].CreatedAtUtc))
            .Where(s => s.Balance > 0m)
            .Take(50)
            .ToList();
    }

    public static VisitBillDto ToDto(IReadOnlyList<Invoice> group)
    {
        var first = group[0];
        return new VisitBillDto(
            first.Id,
            first.VisitKey,
            first.BranchId,
            group.Select(i => i.PatientId).FirstOrDefault(p => p is not null),
            first.PatientName,
            first.Currency,
            group.Sum(i => i.Subtotal),
            group.Sum(i => i.DiscountTotal),
            group.Sum(i => i.Total),
            group.Sum(i => i.NetPaid),
            group.Sum(i => i.RefundedTotal),
            group.Sum(i => i.Balance),
            group.GroupBy(i => (i.FacilityId, i.FacilityType))
                .Select(f => new VisitFacilityDto(f.Key.FacilityId, f.Key.FacilityType, f.Sum(i => i.Total), f.Sum(i => i.Balance)))
                .ToList(),
            group.Select(InvoiceMapper.ToDto).ToList());
    }
}

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
