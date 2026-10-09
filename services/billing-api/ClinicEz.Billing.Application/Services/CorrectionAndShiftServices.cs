using ClinicEz.Billing.Application.Abstractions;
using ClinicEz.Billing.Application.Dtos;
using ClinicEz.Billing.Application.Interop;
using ClinicEz.Billing.Domain.Constants;
using ClinicEz.Billing.Domain.Entities;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Billing.Application.Services;

/// <summary>
/// Supervisor actions that undo a charge. A void cancels an invoice nothing was paid on; a refund gives back everything paid on an
/// invoice. Both need a reason, are audited, and tell the requesting facility (and, for a fully paid invoice, the portal rollup)
/// through <c>billing.invoice.voided</c> in the same save.
/// </summary>
public sealed class CorrectionService
{
    private readonly IBillingDbContext _db;
    private readonly IBillingContext _context;
    private readonly VisitBillService _visits;
    private readonly AuditTrail _audit;
    private readonly IInteropPublisher _publisher;
    private readonly TimeProvider _clock;

    public CorrectionService(IBillingDbContext db, IBillingContext context, VisitBillService visits, AuditTrail audit, IInteropPublisher publisher, TimeProvider clock)
    {
        _db = db;
        _context = context;
        _visits = visits;
        _audit = audit;
        _publisher = publisher;
        _clock = clock;
    }

    public async Task<InvoiceDto> VoidAsync(Guid invoiceId, VoidRequest request, CancellationToken ct)
    {
        var caller = _context.RequireStaff();
        var invoice = await _visits.RequireInvoiceAsync(caller.TenantId, invoiceId, true, ct);
        var now = _clock.GetUtcNow().UtcDateTime;

        invoice.Void(request.Reason, now);
        BillingMessages.Voided(_publisher, invoice, BillingCorrectionKind.Void, 0m, false, now);
        _audit.Record(caller, caller.TenantId, caller.FacilityId, "invoice.voided", nameof(Invoice), invoice.Id,
            new { invoice.InvoiceNumber, invoice.Total, request.Reason });

        await _db.SaveOrConflictAsync(ct);
        return InvoiceMapper.ToDto(invoice);
    }

    public async Task<RefundDto> RefundAsync(Guid invoiceId, RefundRequest request, CancellationToken ct)
    {
        var caller = _context.RequireStaff();
        var invoice = await _visits.RequireInvoiceAsync(caller.TenantId, invoiceId, true, ct);
        var now = _clock.GetUtcNow().UtcDateTime;
        var wasFullyPaid = invoice.Status == InvoiceStatus.Paid;

        var method = request.Method ?? await _db.PaymentAllocations
            .Where(a => a.TenantId == caller.TenantId && a.InvoiceId == invoiceId)
            .Join(_db.Payments, a => a.PaymentId, p => p.Id, (a, p) => new { p.Method, p.PaidAtUtc })
            .OrderByDescending(x => x.PaidAtUtc)
            .Select(x => x.Method)
            .FirstOrDefaultAsync(ct);

        var shift = await _db.CashierShifts.FirstOrDefaultAsync(
            s => s.TenantId == caller.TenantId && s.FacilityId == caller.FacilityId && s.CashierUserId == caller.UserId && s.Status == ShiftStatus.Open, ct);
        if (method == PaymentMethod.Cash && shift is null)
            throw new ConflictException("Open a cashier shift before refunding cash: the money leaves your drawer.");

        var amount = invoice.Refund(request.Reason, now);
        var refund = new Refund
        {
            Id = Guid.NewGuid(),
            TenantId = caller.TenantId,
            FacilityId = caller.FacilityId,
            InvoiceId = invoice.Id,
            InvoiceFacilityId = invoice.FacilityId,
            BranchId = invoice.BranchId,
            Currency = invoice.Currency,
            Amount = amount,
            Method = method,
            Reason = request.Reason.Trim(),
            ApprovedByUserId = caller.UserId,
            ApprovedByName = caller.UserName,
            ShiftId = shift?.Id,
            RefundedAtUtc = now
        };
        _db.Refunds.Add(refund);

        BillingMessages.Voided(_publisher, invoice, BillingCorrectionKind.Refund, amount, wasFullyPaid, now);
        _audit.Record(caller, caller.TenantId, caller.FacilityId, "invoice.refunded", nameof(Invoice), invoice.Id,
            new { invoice.InvoiceNumber, Amount = amount, Method = method, request.Reason });

        await _db.SaveOrConflictAsync(ct);
        return new RefundDto(refund.Id, invoice.Id, amount, method, refund.Reason, refund.ApprovedByName, now);
    }
}

/// <summary>Cashier drawer sessions: opening float, close with counted cash, variance.</summary>
public sealed class ShiftService
{
    private readonly IBillingDbContext _db;
    private readonly IBillingContext _context;
    private readonly AuditTrail _audit;
    private readonly TimeProvider _clock;

    public ShiftService(IBillingDbContext db, IBillingContext context, AuditTrail audit, TimeProvider clock)
    {
        _db = db;
        _context = context;
        _audit = audit;
        _clock = clock;
    }

    public async Task<ShiftDto> OpenAsync(OpenShiftRequest request, CancellationToken ct)
    {
        var caller = _context.RequireStaff();
        var alreadyOpen = await _db.CashierShifts.AnyAsync(
            s => s.TenantId == caller.TenantId && s.FacilityId == caller.FacilityId && s.CashierUserId == caller.UserId && s.Status == ShiftStatus.Open, ct);
        if (alreadyOpen) throw new ConflictException("You already have an open shift. Close it first.");

        var shift = CashierShift.Open(caller.TenantId, caller.FacilityId, caller.UserId, caller.UserName, request.OpeningFloat, _clock.GetUtcNow().UtcDateTime);
        _db.CashierShifts.Add(shift);
        _audit.Record(caller, caller.TenantId, caller.FacilityId, "shift.opened", nameof(CashierShift), shift.Id, new { shift.OpeningFloat });

        await _db.SaveOrConflictAsync(ct);
        return await ToDtoAsync(shift, ct);
    }

    /// <summary>The caller's open shift at their counter, or <c>null</c>.</summary>
    public async Task<ShiftDto?> CurrentAsync(CancellationToken ct)
    {
        var caller = _context.RequireStaff();
        var shift = await _db.CashierShifts.AsNoTracking().FirstOrDefaultAsync(
            s => s.TenantId == caller.TenantId && s.FacilityId == caller.FacilityId && s.CashierUserId == caller.UserId && s.Status == ShiftStatus.Open, ct);
        return shift is null ? null : await ToDtoAsync(shift, ct);
    }

    public async Task<ShiftDto> CloseAsync(Guid shiftId, CloseShiftRequest request, CancellationToken ct)
    {
        var caller = _context.RequireStaff();
        var shift = await _db.CashierShifts.FirstOrDefaultAsync(s => s.TenantId == caller.TenantId && s.FacilityId == caller.FacilityId && s.Id == shiftId, ct)
            ?? throw new NotFoundException("Shift not found.");
        if (shift.CashierUserId != caller.UserId && !caller.Has(BillingPermissions.Approvals))
            throw new ForbiddenException("Only the cashier or a supervisor can close this shift.");

        var totals = await TotalsAsync(shift, ct);
        shift.Close(request.CountedCash, totals.Cash, totals.CashRefunded, totals.NonCash, totals.External, request.Notes, _clock.GetUtcNow().UtcDateTime);
        _audit.Record(caller, caller.TenantId, caller.FacilityId, "shift.closed", nameof(CashierShift), shift.Id,
            new { shift.ExpectedCash, shift.CountedCash, shift.Variance, shift.CloseNotes });

        await _db.SaveOrConflictAsync(ct);
        return await ToDtoAsync(shift, ct);
    }

    public async Task<IReadOnlyList<ShiftDto>> ListAsync(CancellationToken ct)
    {
        var caller = _context.RequireStaff();
        var shifts = await _db.CashierShifts.AsNoTracking()
            .Where(s => s.TenantId == caller.TenantId && s.FacilityId == caller.FacilityId)
            .OrderByDescending(s => s.OpenedAtUtc).Take(50).ToListAsync(ct);

        var result = new List<ShiftDto>(shifts.Count);
        foreach (var shift in shifts) result.Add(await ToDtoAsync(shift, ct));
        return result;
    }

    private async Task<(decimal Cash, decimal CashRefunded, decimal NonCash, decimal External)> TotalsAsync(CashierShift shift, CancellationToken ct)
    {
        var payments = await _db.Payments.AsNoTracking().Where(p => p.TenantId == shift.TenantId && p.ShiftId == shift.Id)
            .Select(p => new { p.Method, p.IsExternal, p.Amount }).ToListAsync(ct);
        var refunds = await _db.Refunds.AsNoTracking().Where(r => r.TenantId == shift.TenantId && r.ShiftId == shift.Id)
            .Select(r => new { r.Method, r.Amount }).ToListAsync(ct);

        return (
            payments.Where(p => !p.IsExternal && p.Method == PaymentMethod.Cash).Sum(p => p.Amount),
            refunds.Where(r => r.Method == PaymentMethod.Cash).Sum(r => r.Amount),
            payments.Where(p => !p.IsExternal && p.Method != PaymentMethod.Cash).Sum(p => p.Amount),
            payments.Where(p => p.IsExternal).Sum(p => p.Amount));
    }

    private async Task<ShiftDto> ToDtoAsync(CashierShift shift, CancellationToken ct)
    {
        var totals = await TotalsAsync(shift, ct);
        var expected = shift.ExpectedCash ?? shift.OpeningFloat + totals.Cash - totals.CashRefunded;
        return new ShiftDto(
            shift.Id, shift.FacilityId, shift.CashierUserId, shift.CashierName, shift.Status, shift.OpenedAtUtc, shift.OpeningFloat,
            shift.ClosedAtUtc, totals.Cash, totals.CashRefunded, totals.NonCash, totals.External, expected, shift.CountedCash,
            shift.Variance, shift.CloseNotes);
    }
}
