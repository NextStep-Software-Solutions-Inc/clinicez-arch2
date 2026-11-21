using MediatR;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Billing.Queries;

public record PaymentReceiptDto(
    string ReceiptNumber,
    decimal AmountPaid,
    DateTime PaidAt,
    DateTime ExpiryDate,
    string PaymentMethod,
    string Currency = "PHP",
    string? TransactionReference = null,
    string? Notes = null
);

public record BillingInvoiceDto(
    string InvoiceNumber,
    decimal Amount,
    string Currency,
    string Status,
    string PlanSlug,
    bool IsAnnual,
    DateTime CreatedAt,
    string XenditInvoiceId,
    PaymentReceiptDto? Receipt
);

public record PlanLimitsDto(
    string PlanTitle,
    int MaxClinics,
    int MaxStaff,
    int MaxPatients,
    int MonthlyApiQuotaLimit
);

public record TenantUsageDto(
    int FacilitiesCount,
    int StaffAccountsCount,
    int ActivePatientRecordsCount,
    int MonthlyApiQuotaUsed
);

public record BillingInfoDto(
    string SubscriptionStatus,
    string SubscriptionPlanId,
    List<BillingInvoiceDto> Invoices,
    string Name,
    string? TradingName,
    string? BusinessType,
    string? PhoneNumber,
    string? Country,
    string? StreetLine1,
    string? StreetLine2,
    string? City,
    string? Province,
    string? PostalCode,
    string? TaxId,
    bool IsAnnual,
    DateTime? SubscriptionExpiresAt,
    PlanLimitsDto? PlanLimits = null,
    TenantUsageDto? Usage = null,
    BillingPaymentConfigDto? PaymentConfig = null,
    int? TrialDays = null
);

public class GetBillingInfoQuery : IRequest<BillingInfoDto?>
{
    public string TenantId { get; set; } = string.Empty;

    public GetBillingInfoQuery(string tenantId)
    {
        TenantId = tenantId;
    }
}

public class GetBillingInfoQueryHandler(
    IApplicationDbContext context,
    IEntitlementService entitlementsService,
    ISystemSettingsService? settingsService = null) : IRequestHandler<GetBillingInfoQuery, BillingInfoDto?>
{
    public async Task<BillingInfoDto?> Handle(GetBillingInfoQuery request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.Id.ToString() == request.TenantId || t.TenantSlug == request.TenantId, cancellationToken);

        if (tenant == null) return null;

        var dbInvoices = await context.BillingInvoices
            .Where(i => i.TenantId == tenant.Id)
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync(cancellationToken);

        var dbReceipts = await context.PaymentReceipts
            .Where(r => r.TenantId == tenant.Id)
            .ToListAsync(cancellationToken);

        var receiptsLookup = dbReceipts.ToDictionary(r => r.InvoiceId);

        var invoices = dbInvoices.Select(i => {
            PaymentReceiptDto? receiptDto = null;
            if (receiptsLookup.TryGetValue(i.Id, out var r))
            {
                receiptDto = new PaymentReceiptDto(
                    r.ReceiptNumber,
                    r.AmountPaid,
                    r.PaidAt,
                    r.ExpiryDate,
                    r.PaymentMethod,
                    r.Currency,
                    r.TransactionReference,
                    r.Notes
                );
            }

            return new BillingInvoiceDto(
                i.InvoiceNumber,
                i.Amount,
                i.Currency,
                i.Status,
                i.PlanSlug,
                i.IsAnnual,
                i.CreatedAt,
                i.XenditInvoiceId,
                receiptDto
            );
        }).ToList();

        var subscription = await entitlementsService.ResolveAsync(tenant.Id, cancellationToken);
        var stored = await context.Subscriptions.AsNoTracking().FirstAsync(s => s.TenantId == tenant.Id, cancellationToken);

        var latestReceipt = dbReceipts.OrderByDescending(r => r.PaidAt).FirstOrDefault();
        var isAnnual = stored.IsAnnual;
        if (latestReceipt != null)
        {
            isAnnual = dbInvoices.FirstOrDefault(i => i.Id == latestReceipt.InvoiceId)?.IsAnnual ?? isAnnual;
        }

        // The legacy wire format of this endpoint: upper-case status, plan slug as the plan id.
        var subscriptionStatus = subscription.Status switch
        {
            SubscriptionStatus.PastDue => "PAST_DUE",
            var status => status.ToString().ToUpperInvariant()
        };

        PlanLimitsDto? planLimitsDto = null;
        if (subscription.IsActive)
        {
            planLimitsDto = new PlanLimitsDto(
                subscription.PlanName,
                DisplayLimit(subscription, EntitlementKeys.LimitClinics),
                DisplayLimit(subscription, EntitlementKeys.LimitMembers),
                DisplayLimit(subscription, EntitlementKeys.LimitPatients),
                DisplayLimit(subscription, EntitlementKeys.LimitApiRequestsMonthly));
        }

        var memberCount = await context.WorkspaceMembers
            .CountAsync(m => m.TenantId == tenant.Id && m.Status != MemberStatus.Suspended && m.Status != MemberStatus.Revoked, cancellationToken);

        var usageDto = new TenantUsageDto(
            tenant.FacilitiesCount,
            Math.Max(memberCount, 1),
            tenant.ActivePatientRecordsCount,
            tenant.MonthlyApiQuotaUsed
        );

        var paymentConfig = settingsService != null
            ? await settingsService.GetBillingPaymentConfigAsync(cancellationToken)
            : null;

        var platformTrialDays = settingsService != null
            ? await settingsService.GetSettingIntAsync("Billing:TrialDays", 14, cancellationToken)
            : 14;

        int? effectiveTrialDays = platformTrialDays;
        if (stored.TrialEndsAt.HasValue && tenant.CreatedAt != default)
        {
            var diff = (int)Math.Round((stored.TrialEndsAt.Value - tenant.CreatedAt).TotalDays);
            if (diff > 0)
            {
                effectiveTrialDays = diff;
            }
        }

        return new BillingInfoDto(
            subscriptionStatus,
            subscription.PlanSlug,
            invoices,
            tenant.Name,
            tenant.TradingName,
            tenant.BusinessType,
            tenant.PhoneNumber,
            tenant.Country,
            tenant.StreetLine1,
            tenant.StreetLine2,
            tenant.City,
            tenant.Province,
            tenant.PostalCode,
            tenant.TaxId,
            isAnnual,
            subscription.PeriodEnd,
            planLimitsDto,
            usageDto,
            paymentConfig,
            effectiveTrialDays
        );
    }

    /// <summary>Unlimited plans are shown with the large sentinel numbers the dashboard already treats as unlimited.</summary>
    private static int DisplayLimit(EntitlementSnapshot snapshot, string key)
    {
        var limit = snapshot.Limit(key);
        return limit >= 999999 ? 999999 : (int)limit;
    }
}
