using MediatR;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Constants;
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
    string PaymentMethod
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
    TenantUsageDto? Usage = null
);

public class GetBillingInfoQuery : IRequest<BillingInfoDto?>
{
    public string TenantId { get; set; } = string.Empty;

    public GetBillingInfoQuery(string tenantId)
    {
        TenantId = tenantId;
    }
}

public class GetBillingInfoQueryHandler(IApplicationDbContext context) : IRequestHandler<GetBillingInfoQuery, BillingInfoDto?>
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
                    r.PaymentMethod
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

        var latestReceipt = dbReceipts.OrderByDescending(r => r.PaidAt).FirstOrDefault();
        bool isAnnual = latestReceipt != null 
            ? (dbInvoices.FirstOrDefault(i => i.Id == latestReceipt.InvoiceId)?.IsAnnual ?? false)
            : false;
        
        if (latestReceipt == null && dbInvoices.Count > 0)
        {
            isAnnual = dbInvoices.First().IsAnnual;
        }

        var subscriptionStatus = tenant.SubscriptionStatus;
        DateTime? subscriptionExpiresAt = latestReceipt?.ExpiryDate;

        var effectivePlanId = tenant.SubscriptionPlanId;
        if (string.IsNullOrEmpty(effectivePlanId) && subscriptionStatus == "TRIALING")
        {
            effectivePlanId = "starter";
        }

        // If trialing without paid receipts, calculate trial expiration as 14 days from tenant creation
        if (subscriptionExpiresAt == null && subscriptionStatus == "TRIALING")
        {
            subscriptionExpiresAt = tenant.CreatedAt.AddDays(14);
        }

        // If trial has passed its 14-day evaluation window, mark status as EXPIRED
        if (subscriptionStatus == "TRIALING" && subscriptionExpiresAt.HasValue && DateTime.UtcNow > subscriptionExpiresAt.Value)
        {
            subscriptionStatus = "EXPIRED";
        }

        PlanLimitsDto? planLimitsDto = null;
        if (subscriptionStatus != "EXPIRED" && !string.IsNullOrEmpty(effectivePlanId))
        {
            var planLimits = PlanFeaturesConfig.GetLimitsForPlan(effectivePlanId);
            if (planLimits != null)
            {
                planLimitsDto = new PlanLimitsDto(
                    planLimits.PlanTitle,
                    planLimits.MaxClinics,
                    planLimits.MaxStaff,
                    planLimits.MaxPatients,
                    planLimits.MonthlyApiQuotaLimit
                );
            }
        }

        var actualStaffCount = await context.StaffMembers
            .CountAsync(s => s.TenantId == tenant.Id, cancellationToken);
        var effectiveStaffCount = actualStaffCount > 0 ? actualStaffCount : Math.Max(tenant.StaffAccountsCount, 1);

        var usageDto = new TenantUsageDto(
            tenant.FacilitiesCount,
            effectiveStaffCount,
            tenant.ActivePatientRecordsCount,
            tenant.MonthlyApiQuotaUsed
        );

        return new BillingInfoDto(
            subscriptionStatus,
            effectivePlanId,
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
            subscriptionExpiresAt,
            planLimitsDto,
            usageDto
        );
    }
}
