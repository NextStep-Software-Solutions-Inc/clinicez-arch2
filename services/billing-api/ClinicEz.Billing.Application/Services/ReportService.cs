using ClinicEz.Billing.Application.Abstractions;
using ClinicEz.Billing.Application.Dtos;
using ClinicEz.Shared.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Billing.Application.Services;

/// <summary>
/// Collection reports and the audit trail. Reports aggregate in memory over the (bounded, tenant-scoped) payments and refunds of the
/// requested window: external (insurer) settlements are reported apart from money that went through the counter.
/// </summary>
public sealed class ReportService
{
    public const int MaxRangeDays = 366;
    public const int MaxAuditEntries = 200;
    private const string Unassigned = "(none)";

    private readonly IBillingDbContext _db;
    private readonly IBillingContext _context;

    public ReportService(IBillingDbContext db, IBillingContext context)
    {
        _db = db;
        _context = context;
    }

    public async Task<DailyCollectionReport> DailyCollectionAsync(DailyCollectionQuery query, CancellationToken ct)
    {
        var caller = _context.RequireStaff();
        if (query.To < query.From) throw new BadRequestException("The report end date is before its start date.");
        if (query.To.DayNumber - query.From.DayNumber >= MaxRangeDays) throw new BadRequestException($"A report covers at most {MaxRangeDays} days.");
        if (Math.Abs(query.UtcOffsetMinutes) > 14 * 60) throw new BadRequestException("The UTC offset must be within ±14 hours.");
        var currency = string.IsNullOrWhiteSpace(query.Currency) ? Domain.Money.DefaultCurrency : query.Currency.Trim().ToUpperInvariant();

        var offset = TimeSpan.FromMinutes(query.UtcOffsetMinutes);
        var fromUtc = query.From.ToDateTime(TimeOnly.MinValue) - offset;
        var toUtc = query.To.AddDays(1).ToDateTime(TimeOnly.MinValue) - offset;

        var paymentQuery = _db.Payments.AsNoTracking()
            .Where(p => p.TenantId == caller.TenantId && p.Currency == currency && p.PaidAtUtc >= fromUtc && p.PaidAtUtc < toUtc);
        var refundQuery = _db.Refunds.AsNoTracking()
            .Where(r => r.TenantId == caller.TenantId && r.Currency == currency && r.RefundedAtUtc >= fromUtc && r.RefundedAtUtc < toUtc);

        if (!string.IsNullOrWhiteSpace(query.FacilityId))
        {
            paymentQuery = paymentQuery.Where(p => p.FacilityId == query.FacilityId);
            refundQuery = refundQuery.Where(r => r.FacilityId == query.FacilityId);
        }

        if (!string.IsNullOrWhiteSpace(query.BranchId))
        {
            paymentQuery = paymentQuery.Where(p => p.BranchId == query.BranchId);
            refundQuery = refundQuery.Where(r => r.BranchId == query.BranchId);
        }

        if (query.CashierUserId is { } cashier)
        {
            paymentQuery = paymentQuery.Where(p => p.CashierUserId == cashier);
            refundQuery = refundQuery.Where(r => r.ApprovedByUserId == cashier);
        }

        var payments = await paymentQuery
            .Select(p => new Entry(p.PaidAtUtc, p.Method.ToString(), p.CashierName, p.BranchId, p.FacilityId, p.IsExternal ? 0m : p.Amount, p.IsExternal ? p.Amount : 0m, 0m, 1))
            .ToListAsync(ct);
        var refunds = await refundQuery
            .Select(r => new Entry(r.RefundedAtUtc, r.Method.ToString(), r.ApprovedByName, r.BranchId, r.FacilityId, 0m, 0m, r.Amount, 0))
            .ToListAsync(ct);
        var entries = payments.Concat(refunds).ToList();

        var days = new List<CollectionDay>();
        for (var date = query.From; date <= query.To; date = date.AddDays(1))
        {
            var day = entries.Where(e => DateOnly.FromDateTime(e.AtUtc + offset) == date).ToList();
            days.Add(new CollectionDay(date, day.Sum(e => e.Count), day.Sum(e => e.Collected), day.Sum(e => e.External), day.Sum(e => e.Refunded)));
        }

        var collected = entries.Sum(e => e.Collected);
        var refunded = entries.Sum(e => e.Refunded);
        return new DailyCollectionReport(
            query.From, query.To, query.UtcOffsetMinutes, currency,
            payments.Count, collected, entries.Sum(e => e.External), refunded, collected - refunded, days,
            Bucket(entries, e => e.Method), Bucket(entries, e => e.Cashier), Bucket(entries, e => e.Branch ?? Unassigned), Bucket(entries, e => e.Facility));
    }

    public async Task<IReadOnlyList<AuditEntryDto>> AuditAsync(string? entityType, Guid? entityId, int take, CancellationToken ct)
    {
        var caller = _context.RequireStaff();
        var query = _db.AuditEntries.AsNoTracking().Where(a => a.TenantId == caller.TenantId);
        if (!string.IsNullOrWhiteSpace(entityType)) query = query.Where(a => a.EntityType == entityType);
        if (entityId is { } id) query = query.Where(a => a.EntityId == id);

        var size = Math.Clamp(take, 1, MaxAuditEntries);
        return await query.OrderByDescending(a => a.AtUtc).Take(size)
            .Select(a => new AuditEntryDto(a.Id, a.AtUtc, a.ActorName, a.Action, a.EntityType, a.EntityId, a.Details))
            .ToListAsync(ct);
    }

    private static IReadOnlyList<CollectionBucket> Bucket(IEnumerable<Entry> entries, Func<Entry, string> key) =>
        entries.GroupBy(key)
            .Select(g => new CollectionBucket(g.Key, g.Sum(e => e.Count), g.Sum(e => e.Collected), g.Sum(e => e.External), g.Sum(e => e.Refunded)))
            .OrderByDescending(b => b.Net)
            .ThenBy(b => b.Key, StringComparer.Ordinal)
            .ToList();

    private sealed record Entry(DateTime AtUtc, string Method, string Cashier, string? Branch, string Facility, decimal Collected, decimal External, decimal Refunded, int Count);
}
