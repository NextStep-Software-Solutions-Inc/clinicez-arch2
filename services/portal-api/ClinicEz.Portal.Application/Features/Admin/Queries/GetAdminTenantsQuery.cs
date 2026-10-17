using MediatR;
using ClinicEz.Portal.Application.Features.Billing;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Admin.Queries;

public record AdminTenantResponseDto(
    Guid Id,
    string Name,
    string TenantSlug,
    string TenantType,
    string OwnerName,
    string Email,
    DateTime CreatedAt,
    DateTime? ArchivedAt,
    string SubscriptionStatus,
    string SubscriptionPlanId,
    bool IsAnnual,
    int FacilitiesCount,
    int StaffAccountsCount,
    int ActivePatientRecordsCount,
    int MonthlyApiQuotaUsed,
    int MonthlyApiQuotaLimit,
    bool IsOrphaned = false,
    string? OrphanReason = null,
    bool CanPurge = false
);

public record GetAdminTenantsQuery : IRequest<List<AdminTenantResponseDto>>;

public class GetAdminTenantsQueryHandler(
    IApplicationDbContext context,
    ISystemSettingsService? settingsService = null) 
    : IRequestHandler<GetAdminTenantsQuery, List<AdminTenantResponseDto>>
{
    public const string DefaultThresholdKey = "Workspace:OrphanInactivityDaysThreshold";
    public const int DefaultThresholdDays = 14;

    public async Task<List<AdminTenantResponseDto>> Handle(GetAdminTenantsQuery request, CancellationToken cancellationToken)
    {
        var thresholdDays = settingsService is not null
            ? await settingsService.GetSettingIntAsync(DefaultThresholdKey, DefaultThresholdDays, cancellationToken)
            : DefaultThresholdDays;

        var tenants = await context.Tenants
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync(cancellationToken);

        var subscriptions = await context.Subscriptions
            .AsNoTracking()
            .Include(s => s.Plan)
            .ToDictionaryAsync(s => s.TenantId, cancellationToken);

        // Fetch tenants with invoices or receipts in one fast query to avoid N+1
        var tenantIdsWithInvoices = await context.BillingInvoices
            .AsNoTracking()
            .Select(i => i.TenantId)
            .Distinct()
            .ToHashSetAsync(cancellationToken);

        var tenantIdsWithReceipts = await context.PaymentReceipts
            .AsNoTracking()
            .Select(r => r.TenantId)
            .Distinct()
            .ToHashSetAsync(cancellationToken);

        var now = DateTime.UtcNow;
        var result = new List<AdminTenantResponseDto>();

        foreach (var t in tenants)
        {
            var subscription = subscriptions.GetValueOrDefault(t.Id);
            var subStatus = subscription?.Status ?? SubscriptionStatus.Trialing;
            var hasInvoices = tenantIdsWithInvoices.Contains(t.Id);
            var hasReceipts = tenantIdsWithReceipts.Contains(t.Id);
            var hasActiveSub = subStatus == SubscriptionStatus.Active;

            var ageInDays = (now - t.CreatedAt).TotalDays;

            var canPurge = t.ActivePatientRecordsCount == 0 &&
                           t.FacilitiesCount == 0 &&
                           !hasInvoices &&
                           !hasReceipts &&
                           !hasActiveSub;

            var isOrphaned = canPurge && ageInDays >= thresholdDays;
            var orphanReason = isOrphaned
                ? $"Incomplete signup with no facilities or patients created for over {Math.Floor(ageInDays)} days (Threshold: {thresholdDays}d)."
                : null;

            result.Add(new AdminTenantResponseDto(
                t.Id,
                t.Name,
                t.TenantSlug,
                t.TenantType,
                $"{t.FirstName} {t.LastName}".Trim(),
                t.Email,
                t.CreatedAt,
                t.ArchivedAt,
                SubscriptionWire.Status(subStatus),
                subscription?.Plan?.Slug ?? SubscriptionWire.NoPlan,
                subscription?.IsAnnual ?? false,
                t.FacilitiesCount,
                t.StaffAccountsCount,
                t.ActivePatientRecordsCount,
                t.MonthlyApiQuotaUsed,
                t.MonthlyApiQuotaLimit,
                isOrphaned,
                orphanReason,
                canPurge
            ));
        }

        return result;
    }
}
