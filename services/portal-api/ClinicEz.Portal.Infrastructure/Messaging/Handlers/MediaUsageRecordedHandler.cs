using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Infrastructure.Messaging.Handlers;

/// <summary>
/// Handles <c>media.usage.recorded</c> (<c>InteropTypes.MediaUsageRecorded</c>) from <c>Party.Media</c>.
/// Idempotently processes zero-PHI call minute usage, deducts prepaid balances or accrues postpaid/overage charges,
/// and re-stages <c>media.entitlement.updated</c> if a prepaid balance is depleted.
/// </summary>
public sealed class MediaUsageRecordedHandler(
    IApplicationDbContext dbContext,
    IInteropPublisher publisher,
    ILogger<MediaUsageRecordedHandler> logger) : IInteropHandler<MediaUsageRecordedPayload>
{
    public async Task HandleAsync(MediaUsageRecordedPayload payload, InteropMessageContext context, CancellationToken ct)
    {
        if (payload is null || payload.CallId == Guid.Empty)
        {
            logger.LogWarning("[MediaUsageRecordedHandler] Received null or invalid payload; skipping.");
            return;
        }

        logger.LogInformation(
            "[MediaUsageRecordedHandler] Ingesting usage for CallId {CallId}, Tenant {TenantId}, Duration: {Minutes} mins.",
            payload.CallId, payload.TenantId, payload.DurationMinutes);

        // 1. Idempotency Check: prevent double-billing on network replay
        var alreadyProcessed = await dbContext.TeleconsultUsageRecords
            .AnyAsync(r => r.CallId == payload.CallId, ct);

        if (alreadyProcessed)
        {
            logger.LogInformation(
                "[MediaUsageRecordedHandler] Usage for CallId {CallId} already recorded. Idempotent skip.",
                payload.CallId);
            return;
        }

        // 2. Resolve Tenant
        var tenant = await ResolveTenantAsync(payload.TenantId, ct);
        if (tenant is null)
        {
            logger.LogWarning(
                "[MediaUsageRecordedHandler] Tenant {TenantId} could not be resolved for CallId {CallId}.",
                payload.TenantId, payload.CallId);
            return;
        }

        // 3. Resolve WorkspaceTeleconsultBilling
        var billing = await dbContext.WorkspaceTeleconsultBillings
            .FirstOrDefaultAsync(b => b.TenantId == tenant.Id, ct);

        if (billing is null)
        {
            logger.LogInformation(
                "[MediaUsageRecordedHandler] WorkspaceTeleconsultBilling not found for Tenant {TenantId}; creating default postpaid entity.",
                tenant.Id);
            billing = new WorkspaceTeleconsultBilling
            {
                TenantId = tenant.Id,
                IsEnabled = false,
                BillingMode = WorkspaceTeleconsultBilling.ModePostpaid,
                RatePerMinutePhp = WorkspaceTeleconsultBilling.DefaultRatePerMinutePhp,
                AllocatedBudgetPhp = 0m,
                PrepaidBalancePhp = 0m,
                AllowOverageBeyondAllocation = true,
                CurrentPeriodYearMonth = payload.CallEndedAtUtc.ToString("yyyy-MM")
            };
            dbContext.WorkspaceTeleconsultBillings.Add(billing);
        }

        // 4. Period Rollover
        var callPeriod = payload.CallEndedAtUtc.ToString("yyyy-MM");
        billing.RollPeriodIfNeeded(callPeriod);

        // 5. Billing Calculation
        var rate = billing.RatePerMinutePhp > 0m ? billing.RatePerMinutePhp : WorkspaceTeleconsultBilling.DefaultRatePerMinutePhp;
        var duration = Math.Max(0, payload.DurationMinutes);
        var totalCost = duration * rate;

        decimal prepaidDeducted = 0m;
        decimal postpaidOverage = 0m;

        if (string.Equals(billing.BillingMode, WorkspaceTeleconsultBilling.ModePrepaid, StringComparison.OrdinalIgnoreCase))
        {
            if (billing.PrepaidBalancePhp >= totalCost)
            {
                prepaidDeducted = totalCost;
                billing.PrepaidBalancePhp -= totalCost;
            }
            else
            {
                // Cutoff protection: call was completed, deduct whatever remains, remainder recorded as overdraft
                prepaidDeducted = Math.Max(0m, billing.PrepaidBalancePhp);
                postpaidOverage = totalCost - prepaidDeducted;
                billing.PrepaidBalancePhp = 0m;
            }

            billing.CurrentPeriodMinutesUsed += duration;
            billing.CurrentPeriodBilledPhp += prepaidDeducted;
            billing.CurrentPeriodOveragePhp += postpaidOverage;

            // If balance is depleted below 1 billable minute, sync media-broker to block new call requests
            if (billing.PrepaidBalancePhp < rate)
            {
                logger.LogInformation(
                    "[MediaUsageRecordedHandler] Tenant {TenantId} prepaid balance depleted ({Balance} < {Rate}); staging media.entitlement.updated.",
                    tenant.Id, billing.PrepaidBalancePhp, rate);

                publisher.Enqueue(
                    InteropTypes.MediaEntitlementUpdated,
                    Party.Portal,
                    Party.Media,
                    payload.CallId,
                    new MediaEntitlementUpdatedPayload(
                        tenant.Id.ToString(),
                        CallMinutesMonthly: 0,
                        IsActive: false,
                        Version: 1,
                        UpdatedAtUtc: DateTime.UtcNow,
                        AllowOverdraft: false,
                        BillingMode: WorkspaceTeleconsultBilling.ModePrepaid,
                        RatePerMinutePhp: rate));
            }
        }
        else // Postpaid Mode
        {
            billing.CurrentPeriodMinutesUsed += duration;

            if (billing.AllocatedBudgetPhp > 0m)
            {
                var remainingBudget = Math.Max(0m, billing.AllocatedBudgetPhp - billing.CurrentPeriodBilledPhp);
                var withinBudget = Math.Min(totalCost, remainingBudget);
                postpaidOverage = totalCost - withinBudget;

                billing.CurrentPeriodBilledPhp += withinBudget;
                billing.CurrentPeriodOveragePhp += postpaidOverage;
            }
            else
            {
                billing.CurrentPeriodBilledPhp += totalCost;
                postpaidOverage = 0m;
            }
        }

        // 6. Record Zero-PHI Usage Record
        var usageRecord = new TeleconsultUsageRecord
        {
            CallId = payload.CallId,
            TenantId = tenant.Id.ToString(),
            DurationMinutes = duration,
            RatePerMinutePhp = rate,
            TotalCostPhp = totalCost,
            PrepaidDeductedPhp = prepaidDeducted,
            PostpaidOveragePhp = postpaidOverage,
            CallStartedAtUtc = payload.CallStartedAtUtc,
            CallEndedAtUtc = payload.CallEndedAtUtc,
            CreatedBy = nameof(MediaUsageRecordedHandler)
        };

        dbContext.TeleconsultUsageRecords.Add(usageRecord);
        await dbContext.SaveChangesAsync(ct);

        logger.LogInformation(
            "[MediaUsageRecordedHandler] Successfully recorded call {CallId}. TotalCost: ₱{Cost:F2}, PrepaidDeducted: ₱{Prepaid:F2}, Overage: ₱{Overage:F2}.",
            payload.CallId, totalCost, prepaidDeducted, postpaidOverage);
    }

    private async Task<Tenant?> ResolveTenantAsync(string tenantIdOrSlug, CancellationToken ct)
    {
        if (Guid.TryParse(tenantIdOrSlug, out var tenantGuid))
        {
            var byId = await dbContext.Tenants.FirstOrDefaultAsync(t => t.Id == tenantGuid, ct);
            if (byId != null) return byId;
        }

        var slugLower = tenantIdOrSlug.Trim().ToLowerInvariant();
        return await dbContext.Tenants.FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == slugLower, ct);
    }
}
