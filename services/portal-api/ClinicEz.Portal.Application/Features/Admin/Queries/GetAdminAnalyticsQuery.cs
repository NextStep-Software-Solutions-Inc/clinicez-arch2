using MediatR;
using ClinicEz.Portal.Application.Interfaces;
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
        var activeSubscribers = await context.Tenants.CountAsync(t => t.SubscriptionStatus == "ACTIVE", cancellationToken);
        var leadsCount = await context.Tenants.CountAsync(t => t.SubscriptionStatus != "ACTIVE", cancellationToken);
        var conversionRate = totalTenants > 0 ? Math.Round((double)activeSubscribers * 100.0 / totalTenants, 1) : 0.0;

        // MRR calculation
        decimal totalMRR = 0;
        var activeTenantsList = await context.Tenants
            .Where(t => t.SubscriptionStatus == "ACTIVE")
            .ToListAsync(cancellationToken);

        foreach (var tenant in activeTenantsList)
        {
            var planId = tenant.SubscriptionPlanId?.ToLower() ?? "";
            if (string.IsNullOrEmpty(planId)) continue;

            var latestInvoice = await context.BillingInvoices
                .Where(i => i.TenantId == tenant.Id)
                .OrderByDescending(i => i.CreatedAt)
                .FirstOrDefaultAsync(cancellationToken);

            bool isAnnual = latestInvoice?.IsAnnual ?? false;

            if (planId == "pro" || planId == "professional")
            {
                totalMRR += isAnnual ? 5940 : 7740;
            }
            else // starter
            {
                totalMRR += isAnnual ? 2340 : 2940;
            }
        }

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
