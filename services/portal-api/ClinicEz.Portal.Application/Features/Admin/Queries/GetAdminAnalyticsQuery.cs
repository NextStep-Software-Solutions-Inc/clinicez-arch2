using MediatR;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Admin.Queries;

public record RegistrationTrendDto(string Date, int Count);

public record AdminAnalyticsResponse(
    int TotalTenants,
    int ActiveSubscribers,
    int LeadsCount,
    double ConversionRate,
    decimal TotalMRR,
    List<RegistrationTrendDto> RegistrationTrends
);

public record GetAdminAnalyticsQuery : IRequest<AdminAnalyticsResponse>;

public class GetAdminAnalyticsQueryHandler(IApplicationDbContext context) : IRequestHandler<GetAdminAnalyticsQuery, AdminAnalyticsResponse>
{
    public async Task<AdminAnalyticsResponse> Handle(GetAdminAnalyticsQuery request, CancellationToken cancellationToken)
    {
        var totalTenants = await context.Tenants.CountAsync(cancellationToken);
        var activeSubscriptions = await context.Subscriptions
            .AsNoTracking()
            .Include(s => s.Plan)
            .Where(s => s.Status == SubscriptionStatus.Active)
            .ToListAsync(cancellationToken);
        var activeSubscribers = activeSubscriptions.Count;
        var leadsCount = totalTenants - activeSubscribers;
        var conversionRate = totalTenants > 0 ? Math.Round((double)activeSubscribers * 100.0 / totalTenants, 1) : 0.0;

        // MRR: what each active subscription pays per month on its plan and billing interval
        var totalMRR = activeSubscriptions.Sum(s => s.IsAnnual ? s.Plan.PriceAnnually : s.Plan.PriceMonthly);

        // Past 30 days trends
        var startDate = DateTime.UtcNow.Date.AddDays(-30);
        var tenants = await context.Tenants
            .Where(t => t.CreatedAt >= startDate)
            .ToListAsync(cancellationToken);

        var trends = tenants
            .GroupBy(t => t.CreatedAt.Date)
            .Select(g => new RegistrationTrendDto(g.Key.ToString("yyyy-MM-dd"), g.Count()))
            .OrderBy(t => t.Date)
            .ToList();

        return new AdminAnalyticsResponse(
            totalTenants,
            activeSubscribers,
            leadsCount,
            conversionRate,
            totalMRR,
            trends
        );
    }
}
