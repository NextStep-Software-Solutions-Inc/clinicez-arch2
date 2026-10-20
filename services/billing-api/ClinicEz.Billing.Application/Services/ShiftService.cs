using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Billing.Application.Abstractions;
using ClinicEz.Billing.Application.Dtos;
using ClinicEz.Billing.Domain.Constants;
using ClinicEz.Billing.Domain.Entities;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Shared.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Billing.Application.Services;

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
        var refunds = await _db.RefundLines.AsNoTracking()
            .Where(l => l.TenantId == shift.TenantId)
            .Join(_db.Refunds.Where(r => r.TenantId == shift.TenantId && r.ShiftId == shift.Id), l => l.RefundId, r => r.Id, (l, _) => new { l.Method, l.Amount })
            .ToListAsync(ct);

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
