using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Admin.DTOs;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Features.Admin.Queries.GetTenantOverrides;

public record GetTenantOverridesQuery(Guid TenantId) : IRequest<TenantOverridesDto?>;

public class GetTenantOverridesQueryHandler(
    IApplicationDbContext context,
    IEntitlementService entitlementService)
    : IRequestHandler<GetTenantOverridesQuery, TenantOverridesDto?>
{
    public async Task<TenantOverridesDto?> Handle(GetTenantOverridesQuery request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == request.TenantId, cancellationToken);
        if (tenant is null) return null;

        var overrides = await context.EntitlementOverrides
            .AsNoTracking()
            .Where(o => o.TenantId == request.TenantId)
            .OrderBy(o => o.Key)
            .ToListAsync(cancellationToken);

        var snapshot = await entitlementService.ResolveAsync(request.TenantId, cancellationToken);

        var limitsDto = overrides
            .Where(o => o.Kind == EntitlementKind.Limit)
            .ToDictionary(o => o.Key, o => o.Limit, StringComparer.Ordinal);

        var featuresDto = overrides
            .Where(o => o.Kind == EntitlementKind.Feature)
            .ToDictionary(o => o.Key, o => o.Enabled ?? false, StringComparer.Ordinal);

        var effectiveLimits = snapshot.Limits.ToDictionary(
            k => k.Key,
            v => v.Value == EntitlementSnapshot.Unlimited ? -1 : v.Value,
            StringComparer.Ordinal);

        var effectiveFeatures = snapshot.Features.OrderBy(f => f).ToList();

        var reason = overrides.Select(o => o.Reason).FirstOrDefault(r => !string.IsNullOrEmpty(r));
        DateTime? updatedAt = overrides.Count > 0 ? overrides.Max(o => o.UpdatedAt ?? o.CreatedAt) : null;

        return new TenantOverridesDto(
            TenantId: tenant.Id,
            Limits: limitsDto,
            Features: featuresDto,
            Reason: reason,
            UpdatedAt: updatedAt,
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
