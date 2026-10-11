using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Features.Finance;

/// <summary>Money collected, reversed and net, for one currency over some slice of the rollup.</summary>
public record FinanceTotalsDto(string Currency, decimal Paid, decimal Reversed, decimal Net, int PaidInvoices, int ReversedInvoices);

public record FinanceFacilityTotalsDto(
    Guid FacilityId,
    string FacilityName,
    string FacilityType,
    Guid? BranchId,
    FinanceTotalsDto Totals);

public record FinanceBranchTotalsDto(Guid? BranchId, string BranchName, FinanceTotalsDto Totals);

public record FinanceDayDto(DateOnly Day, FinanceTotalsDto Totals);

public record FinanceSourceDto(string SourceType, FinanceTotalsDto Totals);

/// <summary>The workspace finance dashboard: totals only, never patient or invoice-line detail.</summary>
public record FinanceSummaryDto(
    DateOnly From,
    DateOnly To,
    List<FinanceTotalsDto> Totals,
    List<FinanceFacilityTotalsDto> ByFacility,
    List<FinanceBranchTotalsDto> ByBranch,
    List<FinanceSourceDto> BySource,
    List<FinanceDayDto> Daily);

public record GetFinanceSummaryQuery(
    string TenantSlug,
    DateOnly? From,
    DateOnly? To,
    Guid? FacilityId,
    Guid? BranchId) : IRequest<FinanceSummaryDto>;

public class GetFinanceSummaryQueryHandler(
    IApplicationDbContext context,
    TimeProvider timeProvider) : IRequestHandler<GetFinanceSummaryQuery, FinanceSummaryDto>
{
    public const int MaxRangeDays = 366;
    public const int DefaultRangeDays = 30;

    public async Task<FinanceSummaryDto> Handle(GetFinanceSummaryQuery request, CancellationToken cancellationToken)
    {
        var key = request.TenantSlug.Trim().ToLowerInvariant();
        var tenant = await context.Tenants.AsNoTracking()
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == key || t.Id.ToString() == key, cancellationToken)
            ?? throw new NotFoundException($"Workspace '{request.TenantSlug}' not found.");

        var today = DateOnly.FromDateTime(timeProvider.GetUtcNow().UtcDateTime);
        var to = request.To ?? today;
        var from = request.From ?? to.AddDays(-(DefaultRangeDays - 1));
        if (from > to) throw new BadRequestException("The start date must not be after the end date.");
        if (to.DayNumber - from.DayNumber >= MaxRangeDays) throw new BadRequestException($"The date range cannot exceed {MaxRangeDays} days.");

        var query = context.FinanceDailySummaries.AsNoTracking()
            .Where(s => s.TenantId == tenant.Id && s.Day >= from && s.Day <= to);
        if (request.FacilityId is { } facilityId) query = query.Where(s => s.FacilityId == facilityId);
        if (request.BranchId is { } branchId) query = query.Where(s => s.BranchId == branchId);
        var rows = await query.ToListAsync(cancellationToken);

        var facilities = await context.Facilities.IgnoreQueryFilters().AsNoTracking()
            .Where(f => f.TenantId == tenant.Id)
            .ToDictionaryAsync(f => f.Id, cancellationToken);
        var branches = await context.Branches.IgnoreQueryFilters().AsNoTracking()
            .Where(b => b.TenantId == tenant.Id)
            .ToDictionaryAsync(b => b.Id, b => b.Name, cancellationToken);

        return new FinanceSummaryDto(
            from,
            to,
            ByCurrency(rows),
            rows.GroupBy(r => (r.FacilityId, r.BranchId))
                .SelectMany(g => ByCurrency(g).Select(t => new FinanceFacilityTotalsDto(
                    g.Key.FacilityId,
                    facilities.TryGetValue(g.Key.FacilityId, out var f) ? f.Name : "Removed facility",
                    facilities.TryGetValue(g.Key.FacilityId, out var ft) ? ft.FacilityType.ToString() : string.Empty,
                    g.Key.BranchId,
                    t)))
                .OrderBy(x => x.FacilityName).ThenBy(x => x.Totals.Currency)
                .ToList(),
            rows.GroupBy(r => r.BranchId)
                .SelectMany(g => ByCurrency(g).Select(t => new FinanceBranchTotalsDto(
                    g.Key,
                    g.Key is { } id && branches.TryGetValue(id, out var name) ? name : "No branch",
                    t)))
                .OrderBy(x => x.BranchName).ThenBy(x => x.Totals.Currency)
                .ToList(),
            rows.GroupBy(r => r.SourceType)
                .SelectMany(g => ByCurrency(g).Select(t => new FinanceSourceDto(g.Key, t)))
                .OrderBy(x => x.SourceType).ThenBy(x => x.Totals.Currency)
                .ToList(),
            rows.GroupBy(r => r.Day)
                .SelectMany(g => ByCurrency(g).Select(t => new FinanceDayDto(g.Key, t)))
                .OrderBy(x => x.Day).ThenBy(x => x.Totals.Currency)
                .ToList());
    }

    private static List<FinanceTotalsDto> ByCurrency(IEnumerable<Domain.Entities.FinanceDailySummary> rows) => rows
        .GroupBy(r => r.Currency)
        .Select(g =>
        {
            var paid = g.Sum(r => r.TotalPaid);
            var reversed = g.Sum(r => r.TotalReversed);
            return new FinanceTotalsDto(g.Key, paid, reversed, paid - reversed, g.Sum(r => r.PaidInvoiceCount), g.Sum(r => r.ReversedInvoiceCount));
        })
        .OrderBy(t => t.Currency)
        .ToList();
}
