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

