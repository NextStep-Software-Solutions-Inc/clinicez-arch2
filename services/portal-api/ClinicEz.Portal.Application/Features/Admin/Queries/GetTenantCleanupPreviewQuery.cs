using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Admin.Queries;

public record TenantCleanupPreviewDto(
    Guid TenantId,
    string TenantSlug,
    string ClinicName,
    string OwnerName,
    string Email,
    DateTime CreatedAt,
    DateTime? ArchivedAt,
    string SubscriptionStatus,
    string SubscriptionPlanId,
    int FacilitiesCount,
    int StaffAccountsCount,
    int ActivePatientRecordsCount,
    int InvoicesCount,
    int ReceiptsCount,
    bool IsEligibleForPurge,
    IReadOnlyList<string> IneligibilityReasons,
    bool IsOrphaned,
    string? OrphanReason
);

public record GetTenantCleanupPreviewQuery(Guid TenantId) : IRequest<TenantCleanupPreviewDto>;

public class GetTenantCleanupPreviewQueryHandler(
    IApplicationDbContext context,
    ISystemSettingsService? settingsService = null)
    : IRequestHandler<GetTenantCleanupPreviewQuery, TenantCleanupPreviewDto>
{
    public const string DefaultThresholdKey = "Workspace:OrphanInactivityDaysThreshold";
    public const int DefaultThresholdDays = 14;

    public async Task<TenantCleanupPreviewDto> Handle(GetTenantCleanupPreviewQuery request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.Id == request.TenantId, cancellationToken)
            ?? throw new NotFoundException($"Workspace with ID '{request.TenantId}' was not found.");

        var subscription = await context.Subscriptions
            .Include(s => s.Plan)
            .FirstOrDefaultAsync(s => s.TenantId == tenant.Id, cancellationToken);

        var facilitiesCount = await context.Facilities.CountAsync(f => f.TenantId == tenant.Id, cancellationToken);
        var staffCount = await context.StaffMembers.CountAsync(s => s.TenantId == tenant.Id, cancellationToken);
        var invoicesCount = await context.BillingInvoices.CountAsync(i => i.TenantId == tenant.Id, cancellationToken);
        var receiptsCount = await context.PaymentReceipts.CountAsync(r => r.TenantId == tenant.Id, cancellationToken);
        var patientRecordsCount = tenant.ActivePatientRecordsCount;

        var ineligibility = new List<string>();

        if (patientRecordsCount > 0)
        {
            ineligibility.Add($"Contains {patientRecordsCount} clinical patient record(s). Medical record retention mandates archival only.");
        }

        if (invoicesCount > 0 || receiptsCount > 0)
        {
            ineligibility.Add($"Contains {invoicesCount} invoice(s) and {receiptsCount} receipt(s). Legal tax audit retention mandates archival only.");
        }

        if (subscription?.Status == SubscriptionStatus.Active)
        {
            ineligibility.Add("Has an active paid subscription. Subscription must be cancelled or lapsed prior to cleanup.");
        }

        var isEligibleForPurge = ineligibility.Count == 0;

        // Evaluate orphan status dynamically based on Platform Settings
        var thresholdDays = settingsService is not null
            ? await settingsService.GetSettingIntAsync(DefaultThresholdKey, DefaultThresholdDays, cancellationToken)
            : DefaultThresholdDays;

        var ageInDays = (DateTime.UtcNow - tenant.CreatedAt).TotalDays;
        var isOrphaned = facilitiesCount == 0 &&
                         patientRecordsCount == 0 &&
                         invoicesCount == 0 &&
                         receiptsCount == 0 &&
                         subscription?.Status != SubscriptionStatus.Active &&
                         ageInDays >= thresholdDays;

        string? orphanReason = isOrphaned
            ? $"Incomplete signup with no facilities or patients created for over {Math.Floor(ageInDays)} days (Threshold: {thresholdDays}d)."
            : null;

        return new TenantCleanupPreviewDto(
            tenant.Id,
            tenant.TenantSlug,
            tenant.Name,
            $"{tenant.FirstName} {tenant.LastName}".Trim(),
            tenant.Email,
            tenant.CreatedAt,
            tenant.ArchivedAt,
            subscription?.Status.ToString().ToUpperInvariant() ?? "TRIALING",
            subscription?.Plan?.Slug ?? "None",
            facilitiesCount,
            staffCount,
            patientRecordsCount,
            invoicesCount,
            receiptsCount,
            isEligibleForPurge,
            ineligibility.AsReadOnly(),
            isOrphaned,
            orphanReason
        );
    }
}
