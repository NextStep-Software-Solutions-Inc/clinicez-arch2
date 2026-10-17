using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Infrastructure.Services;

public sealed class OrphanTenancyCleanupJob(
    IApplicationDbContext context,
    IHubOnboardingService hubOnboarding,
    TimeProvider timeProvider,
    ILogger<OrphanTenancyCleanupJob> logger,
    ISystemSettingsService? settingsService = null) : IOrphanTenancyCleanupJob
{
    public const string ThresholdDaysKey = "Workspace:OrphanInactivityDaysThreshold";
    public const string AutoPurgeEnabledKey = "Workspace:OrphanAutoPurgeEnabled";
    public const string GraceDaysKey = "Workspace:OrphanAutoPurgeGraceDays";

    public async Task<int> ProcessOrphanTenanciesAsync(CancellationToken cancellationToken)
    {
        var thresholdDays = settingsService is not null
            ? await settingsService.GetSettingIntAsync(ThresholdDaysKey, 14, cancellationToken)
            : 14;

        var autoPurgeEnabled = settingsService is not null
            ? await settingsService.GetSettingBoolAsync(AutoPurgeEnabledKey, false, cancellationToken)
            : false;

        var graceDays = settingsService is not null
            ? await settingsService.GetSettingIntAsync(GraceDaysKey, 30, cancellationToken)
            : 30;

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var orphanHorizon = now.AddDays(-thresholdDays);
        var autoPurgeHorizon = now.AddDays(-graceDays);

        // Pre-query tenants with invoices or receipts
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

        var subscriptions = await context.Subscriptions
            .AsNoTracking()
            .ToDictionaryAsync(s => s.TenantId, cancellationToken);

        var candidates = await context.Tenants
            .Where(t => t.ActivePatientRecordsCount == 0 && t.FacilitiesCount == 0 && t.CreatedAt < orphanHorizon)
            .ToListAsync(cancellationToken);

        var eligibleOrphans = candidates
            .Where(t => !tenantIdsWithInvoices.Contains(t.Id) &&
                        !tenantIdsWithReceipts.Contains(t.Id) &&
                        subscriptions.GetValueOrDefault(t.Id)?.Status != SubscriptionStatus.Active)
            .ToList();

        if (!autoPurgeEnabled)
        {
            logger.LogInformation(
                "OrphanTenancyCleanupJob found {Count} orphaned workspace(s) eligible for cleanup. Auto-purge is disabled in Platform Settings (Threshold: {Threshold}d).",
                eligibleOrphans.Count, thresholdDays);
            return eligibleOrphans.Count;
        }

        // Auto-purge is enabled: filter to those older than the grace period
        var toPurge = eligibleOrphans.Where(t => t.CreatedAt < autoPurgeHorizon).ToList();
        if (toPurge.Count == 0)
        {
            logger.LogInformation("OrphanTenancyCleanupJob: No orphaned workspaces exceeded the auto-purge grace period of {GraceDays} days.", graceDays);
            return 0;
        }

        var purgedCount = 0;
        foreach (var tenant in toPurge)
        {
            try
            {
                await hubOnboarding.RevokeWorkspaceAsync(tenant.Id, cancellationToken);

                // Cascade stub records
                var hubClients = await context.EdgeHubClients.Where(c => c.TenantId == tenant.Id).ToListAsync(cancellationToken);
                foreach (var c in hubClients) c.AllowHardDelete = true;
                context.EdgeHubClients.RemoveRange(hubClients);

                var facilities = await context.Facilities.Where(f => f.TenantId == tenant.Id).ToListAsync(cancellationToken);
                foreach (var f in facilities) f.AllowHardDelete = true;
                context.Facilities.RemoveRange(facilities);

                var allocations = await context.FacilityAllocations.Where(a => a.TenantId == tenant.Id).ToListAsync(cancellationToken);
                foreach (var a in allocations) a.AllowHardDelete = true;
                context.FacilityAllocations.RemoveRange(allocations);

                var branches = await context.Branches.Where(b => b.TenantId == tenant.Id).ToListAsync(cancellationToken);
                foreach (var b in branches) b.AllowHardDelete = true;
                context.Branches.RemoveRange(branches);

                var links = await context.FacilityLinks.Where(l => l.SourceTenantId == tenant.Id || l.TargetTenantId == tenant.Id).ToListAsync(cancellationToken);
                foreach (var l in links) l.AllowHardDelete = true;
                context.FacilityLinks.RemoveRange(links);

                var members = await context.WorkspaceMembers.Where(m => m.TenantId == tenant.Id).ToListAsync(cancellationToken);
                foreach (var m in members) m.AllowHardDelete = true;
                context.WorkspaceMembers.RemoveRange(members);

                var staff = await context.StaffMembers.Where(s => s.TenantId == tenant.Id).ToListAsync(cancellationToken);
                foreach (var s in staff) s.AllowHardDelete = true;
                context.StaffMembers.RemoveRange(staff);

                var subs = await context.Subscriptions.Where(s => s.TenantId == tenant.Id).ToListAsync(cancellationToken);
                foreach (var s in subs) s.AllowHardDelete = true;
                context.Subscriptions.RemoveRange(subs);

                var overrides = await context.EntitlementOverrides.Where(o => o.TenantId == tenant.Id).ToListAsync(cancellationToken);
                foreach (var o in overrides) o.AllowHardDelete = true;
                context.EntitlementOverrides.RemoveRange(overrides);

                var settings = await context.WorkspaceSettings.Where(w => w.TenantId == tenant.Id).ToListAsync(cancellationToken);
                foreach (var w in settings) w.AllowHardDelete = true;
                context.WorkspaceSettings.RemoveRange(settings);

                var apiKeys = await context.WorkspaceApiKeys.Where(k => k.TenantId == tenant.Id).ToListAsync(cancellationToken);
                foreach (var k in apiKeys) k.AllowHardDelete = true;
                context.WorkspaceApiKeys.RemoveRange(apiKeys);

                var notifications = await context.PortalNotifications.Where(n => n.TenantId == tenant.Id).ToListAsync(cancellationToken);
                foreach (var n in notifications) n.AllowHardDelete = true;
                context.PortalNotifications.RemoveRange(notifications);

                var audits = await context.WorkspaceAuditEntries.Where(a => a.TenantId == tenant.Id).ToListAsync(cancellationToken);
                foreach (var a in audits) a.AllowHardDelete = true;
                context.WorkspaceAuditEntries.RemoveRange(audits);

                tenant.AllowHardDelete = true;
                context.Tenants.Remove(tenant);

                await context.SaveChangesAsync(cancellationToken);
                purgedCount++;
                logger.LogInformation("OrphanTenancyCleanupJob: Successfully purged ghost workspace '{Slug}' (ID: {TenantId}) created at {CreatedAt}.", tenant.TenantSlug, tenant.Id, tenant.CreatedAt);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "OrphanTenancyCleanupJob: Failed to purge workspace '{Slug}' (ID: {TenantId}).", tenant.TenantSlug, tenant.Id);
            }
        }

        return purgedCount;
    }
}
