using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Admin.DTOs;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Licensing;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Application.Features.Admin.Commands.UpdateTenantOverrides;

public class UpdateTenantOverridesCommand : IRequest<TenantOverridesDto?>
{
    public Guid TenantId { get; set; }
    public Dictionary<string, long?> Limits { get; set; } = new(StringComparer.Ordinal);
    public Dictionary<string, bool> Features { get; set; } = new(StringComparer.Ordinal);
    public string? Reason { get; set; }
    public string? UpdatedBy { get; set; }

    public UpdateTenantOverridesCommand() { }

    public UpdateTenantOverridesCommand(
        Guid tenantId,
        Dictionary<string, long?>? limits,
        Dictionary<string, bool>? features,
        string? reason = null,
        string? updatedBy = null)
    {
        TenantId = tenantId;
        Limits = limits != null ? new Dictionary<string, long?>(limits, StringComparer.Ordinal) : new Dictionary<string, long?>(StringComparer.Ordinal);
        Features = features != null ? new Dictionary<string, bool>(features, StringComparer.Ordinal) : new Dictionary<string, bool>(StringComparer.Ordinal);
        Reason = reason;
        UpdatedBy = updatedBy;
    }
}

public class UpdateTenantOverridesCommandHandler(
    IApplicationDbContext context,
    IEntitlementService entitlementService,
    ISubscriptionService subscriptionService,
    IEntitlementsPublisher publisher,
    TimeProvider timeProvider,
    ILogger<UpdateTenantOverridesCommandHandler> logger)
    : IRequestHandler<UpdateTenantOverridesCommand, TenantOverridesDto?>
{
    public async Task<TenantOverridesDto?> Handle(UpdateTenantOverridesCommand request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants.FirstOrDefaultAsync(t => t.Id == request.TenantId, cancellationToken);
        if (tenant is null)
        {
            logger.LogWarning("UpdateTenantOverrides failed: tenant {TenantId} not found", request.TenantId);
            return null;
        }

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var updatedBy = request.UpdatedBy ?? "SuperAdmin";

        var existingOverrides = await context.EntitlementOverrides
            .IgnoreQueryFilters()
            .Where(o => o.TenantId == request.TenantId)
            .ToListAsync(cancellationToken);

        var desiredLimits = request.Limits ?? new Dictionary<string, long?>(StringComparer.Ordinal);
        var desiredFeatures = request.Features ?? new Dictionary<string, bool>(StringComparer.Ordinal);

        var submittedKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var k in desiredLimits.Keys) submittedKeys.Add(k);
        foreach (var k in desiredFeatures.Keys) submittedKeys.Add(k);

        // 1. Soft-delete existing active overrides omitted in the payload
        foreach (var existing in existingOverrides.Where(o => !o.IsDeleted))
        {
            if (!submittedKeys.Contains(existing.Key))
            {
                existing.IsDeleted = true;
                existing.DeletedAt = now;
                existing.DeletedBy = updatedBy;
                existing.UpdatedAt = now;
                existing.UpdatedBy = updatedBy;
            }
        }

        // 2. Upsert limits
        foreach (var (key, rawLimit) in desiredLimits)
        {
            var limitValue = rawLimit == -1 ? null : rawLimit;
            var existing = existingOverrides.FirstOrDefault(o => o.Key.Equals(key, StringComparison.OrdinalIgnoreCase));
            if (existing is null)
            {
                context.EntitlementOverrides.Add(new EntitlementOverride
                {
                    TenantId = request.TenantId,
                    Key = key,
                    Kind = EntitlementKind.Limit,
                    Limit = limitValue,
                    Enabled = null,
                    Reason = request.Reason,
                    CreatedAt = now,
                    CreatedBy = updatedBy,
                    UpdatedAt = now,
                    UpdatedBy = updatedBy,
                    IsDeleted = false
                });
            }
            else
            {
                existing.Kind = EntitlementKind.Limit;
                existing.Limit = limitValue;
                existing.Enabled = null;
                existing.Reason = request.Reason;
                existing.IsDeleted = false;
                existing.DeletedAt = null;
                existing.DeletedBy = null;
                existing.UpdatedAt = now;
                existing.UpdatedBy = updatedBy;
            }
        }

        // 3. Upsert features
        foreach (var (key, enabledValue) in desiredFeatures)
        {
            var existing = existingOverrides.FirstOrDefault(o => o.Key.Equals(key, StringComparison.OrdinalIgnoreCase));
            if (existing is null)
            {
                context.EntitlementOverrides.Add(new EntitlementOverride
                {
                    TenantId = request.TenantId,
                    Key = key,
                    Kind = EntitlementKind.Feature,
                    Limit = null,
                    Enabled = enabledValue,
                    Reason = request.Reason,
                    CreatedAt = now,
                    CreatedBy = updatedBy,
                    UpdatedAt = now,
                    UpdatedBy = updatedBy,
                    IsDeleted = false
                });
            }
            else
            {
                existing.Kind = EntitlementKind.Feature;
                existing.Limit = null;
                existing.Enabled = enabledValue;
                existing.Reason = request.Reason;
                existing.IsDeleted = false;
                existing.DeletedAt = null;
                existing.DeletedBy = null;
                existing.UpdatedAt = now;
                existing.UpdatedBy = updatedBy;
            }
        }

        // 4. Increment EntitlementVersion on workspace subscription
        var subscription = await context.Subscriptions
            .FirstOrDefaultAsync(s => s.TenantId == request.TenantId && !s.IsDeleted, cancellationToken);
        if (subscription is null)
        {
            subscription = await subscriptionService.StartTrialAsync(request.TenantId, cancellationToken);
        }
        subscription.EntitlementVersion++;
        subscription.UpdatedAt = now;
        subscription.UpdatedBy = updatedBy;

        // 5. Phase 1 Save: Commit overrides & version so ResolveAsync sees fresh data
        await context.SaveChangesAsync(cancellationToken);

        // 6. License Re-staging: Re-derive shares, re-issue ECDSA P-256 tokens, enqueue entitlements.changed
        await publisher.StageForWorkspaceAsync(request.TenantId, cancellationToken);

        // 7. Phase 2 Save: Persist updated facility license tokens and outbox messages
        await context.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Updated entitlement overrides for tenant {TenantId}. New EntitlementVersion: {Version}",
            request.TenantId, subscription.EntitlementVersion);

        // 8. Return current state
        var activeOverrides = await context.EntitlementOverrides
            .AsNoTracking()
            .Where(o => o.TenantId == request.TenantId)
            .OrderBy(o => o.Key)
            .ToListAsync(cancellationToken);

        var snapshot = await entitlementService.ResolveAsync(request.TenantId, cancellationToken);

        var limitsDto = activeOverrides
            .Where(o => o.Kind == EntitlementKind.Limit)
            .ToDictionary(o => o.Key, o => o.Limit, StringComparer.Ordinal);

        var featuresDto = activeOverrides
            .Where(o => o.Kind == EntitlementKind.Feature)
            .ToDictionary(o => o.Key, o => o.Enabled ?? false, StringComparer.Ordinal);

        var effectiveLimits = snapshot.Limits.ToDictionary(
            k => k.Key,
            v => v.Value == EntitlementSnapshot.Unlimited ? -1 : v.Value,
            StringComparer.Ordinal);

        var effectiveFeatures = snapshot.Features.OrderBy(f => f).ToList();

        DateTime? latestUpdatedAt = activeOverrides.Count > 0 
            ? activeOverrides.Max(o => o.UpdatedAt ?? o.CreatedAt) 
            : now;

        return new TenantOverridesDto(
            TenantId: tenant.Id,
            Limits: limitsDto,
            Features: featuresDto,
            Reason: request.Reason,
            UpdatedAt: latestUpdatedAt,
            TenantSlug: tenant.TenantSlug,
            PlanSlug: snapshot.PlanSlug,
            PlanName: snapshot.PlanName,
            SubscriptionStatus: snapshot.Status.ToString(),
            EntitlementVersion: snapshot.Version,
            EffectiveLimits: effectiveLimits,
            EffectiveFeatures: effectiveFeatures
        );
    }
}
