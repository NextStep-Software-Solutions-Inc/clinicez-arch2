using ClinicEz.Billing.Application.Abstractions;
using ClinicEz.Billing.Application.Dtos;
using ClinicEz.Billing.Domain.Entities;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Shared.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Billing.Application.Services;

/// <summary>Invoices of the signed-in cashier's tenant: list, read, and manual walk-in invoices for the cashier's own counter.</summary>
public sealed class InvoiceService
{
    private const int MaxPageSize = 100;

    private readonly IBillingDbContext _db;
    private readonly IBillingContext _context;
    private readonly VisitBillService _visits;
    private readonly DocumentNumbers _numbers;
    private readonly AuditTrail _audit;
    private readonly TimeProvider _clock;

    public InvoiceService(IBillingDbContext db, IBillingContext context, VisitBillService visits, DocumentNumbers numbers, AuditTrail audit, TimeProvider clock)
    {
        _db = db;
        _context = context;
        _visits = visits;
        _numbers = numbers;
        _audit = audit;
        _clock = clock;
    }

    /// <summary>
    /// Charges services directly at this counter (clinic-only tenants need no other service message). The invoice belongs to the
    /// cashier's own facility; it can share a visit key with invoices other facilities sent, to be collected as one bill.
    /// </summary>
    public async Task<InvoiceDto> CreateWalkInAsync(CreateInvoiceRequest request, CancellationToken ct)
    {
        var caller = _context.RequireStaff();
        var facility = await _db.BillingFacilities.AsNoTracking()
            .FirstOrDefaultAsync(f => f.TenantId == caller.TenantId && f.FacilityId == caller.FacilityId, ct)
            ?? throw new BadRequestException("This counter's facility is not registered with billing yet.");
        if (request.Lines is null || request.Lines.Count == 0) throw new BadRequestException("An invoice needs at least one line.");

        var now = _clock.GetUtcNow().UtcDateTime;
        var invoice = Invoice.Create(
            caller.TenantId, caller.FacilityId, facility.FacilityType, request.BranchId, InvoiceOrigin.WalkIn, null,
            string.IsNullOrWhiteSpace(request.SourceType) ? "WalkIn" : request.SourceType, Guid.NewGuid(), request.PatientId,
            request.PatientName, request.VisitKey, request.Currency,
            request.Lines.Select(l => new InvoiceLineInput(l.Code ?? string.Empty, l.Description, l.Quantity, l.UnitPrice)),
            caller.UserName, now);
        if (invoice.Total <= 0m) throw new BadRequestException("A walk-in invoice must have an amount due.");

        var (_, number) = await _numbers.NextAsync(caller.TenantId, caller.FacilityId, DocumentNumbers.Invoice, ct);
        invoice.AssignNumber(number);
        _db.Invoices.Add(invoice);
        _audit.Record(caller, caller.TenantId, caller.FacilityId, "invoice.created", nameof(Invoice), invoice.Id,
            new { invoice.InvoiceNumber, invoice.Total, Lines = invoice.Lines.Count });

        await _db.SaveOrConflictAsync(ct);
        return InvoiceMapper.ToDto(invoice);
    }

    public async Task<InvoiceDto> GetAsync(Guid invoiceId, CancellationToken ct)
    {
        var caller = _context.RequireStaff();
        return InvoiceMapper.ToDto(await _visits.RequireInvoiceAsync(caller.TenantId, invoiceId, false, ct));
    }

    public async Task<PagedResult<InvoiceDto>> ListAsync(InvoiceQuery query, CancellationToken ct)
    {
        var caller = _context.RequireStaff();
        var page = Math.Max(1, query.Page);
        var pageSize = Math.Clamp(query.PageSize, 1, MaxPageSize);

        var invoices = _db.Invoices.AsNoTracking().Where(i => i.TenantId == caller.TenantId);
        if (query.Statuses is { Count: > 0 } statuses) invoices = invoices.Where(i => statuses.Contains(i.Status));
        if (!string.IsNullOrWhiteSpace(query.FacilityId)) invoices = invoices.Where(i => i.FacilityId == query.FacilityId);
        if (!string.IsNullOrWhiteSpace(query.BranchId)) invoices = invoices.Where(i => i.BranchId == query.BranchId);
        if (!string.IsNullOrWhiteSpace(query.VisitKey))
        {
            var key = query.VisitKey.Trim().ToLower();
            invoices = invoices.Where(i => i.VisitKey != null && i.VisitKey.ToLower() == key);
        }

        if (!string.IsNullOrWhiteSpace(query.PatientName))
        {
            var name = query.PatientName.Trim().ToLower();
            invoices = invoices.Where(i => i.PatientName.ToLower().Contains(name));
        }

        if (query.FromUtc is { } from) invoices = invoices.Where(i => i.CreatedAtUtc >= from);
        if (query.ToUtc is { } to) invoices = invoices.Where(i => i.CreatedAtUtc < to);

        var total = await invoices.CountAsync(ct);
        var items = await invoices
            .Include(i => i.Lines)
            .Include(i => i.Discounts)
            .OrderByDescending(i => i.CreatedAtUtc).ThenBy(i => i.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .ToListAsync(ct);

        return new PagedResult<InvoiceDto>(items.Select(InvoiceMapper.ToDto).ToList(), total, page, pageSize);
    }
}
