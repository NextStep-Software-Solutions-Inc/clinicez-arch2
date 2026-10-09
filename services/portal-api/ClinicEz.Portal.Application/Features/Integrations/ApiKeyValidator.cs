using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Integrations;

/// <summary>Who an API key belongs to, resolved from the presented key.</summary>
public sealed record ApiKeyIdentity(Guid KeyId, Guid TenantId, string TenantSlug, IReadOnlyList<string> Scopes);

public interface IApiKeyValidator
{
    /// <summary>Returns null for unknown, revoked or archived-workspace keys.</summary>
    Task<ApiKeyIdentity?> ValidateAsync(string presentedKey, CancellationToken cancellationToken);
}

public class ApiKeyValidator(IApplicationDbContext context) : IApiKeyValidator
{
    /// <summary>Last-used is a hint for admins, so it is refreshed at most this often to avoid a write per request.</summary>
    private static readonly TimeSpan LastUsedGranularity = TimeSpan.FromMinutes(5);

    public async Task<ApiKeyIdentity?> ValidateAsync(string presentedKey, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(presentedKey) || !presentedKey.StartsWith(ApiKeyHasher.KeyMarker, StringComparison.Ordinal) || presentedKey.Length > 128)
        {
            return null;
        }

        var hash = ApiKeyHasher.Hash(presentedKey.Trim());
        var key = await context.WorkspaceApiKeys.FirstOrDefaultAsync(k => k.KeyHash == hash && k.RevokedAt == null, cancellationToken);
        if (key == null) return null;

        var tenant = await context.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.Id == key.TenantId, cancellationToken);
        if (tenant == null || tenant.ArchivedAt != null) return null;

        var now = DateTime.UtcNow;
        if (key.LastUsedAt == null || now - key.LastUsedAt.Value > LastUsedGranularity)
        {
            key.LastUsedAt = now;
            await context.SaveChangesAsync(cancellationToken);
        }

        return new ApiKeyIdentity(key.Id, tenant.Id, tenant.TenantSlug, IntegrationCatalog.Split(key.Scopes));
    }
}

/// <summary>Facility metadata for integrations. No licence, billing or contact details, and nothing from the facility's own data.</summary>
public record IntegrationFacilityDto(
    Guid Id,
    string Name,
    string Slug,
    string FacilityType,
    string Status,
    string DeploymentMode,
    Guid? BranchId,
    string? BranchName);

public record GetIntegrationFacilitiesQuery(Guid TenantId) : IRequest<IReadOnlyList<IntegrationFacilityDto>>;

public class GetIntegrationFacilitiesQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetIntegrationFacilitiesQuery, IReadOnlyList<IntegrationFacilityDto>>
{
    public async Task<IReadOnlyList<IntegrationFacilityDto>> Handle(GetIntegrationFacilitiesQuery request, CancellationToken cancellationToken)
    {
        var branches = await context.Branches.AsNoTracking()
            .Where(b => b.TenantId == request.TenantId)
            .ToDictionaryAsync(b => b.Id, b => b.Name, cancellationToken);

        var facilities = await context.Facilities.AsNoTracking()
            .Where(f => f.TenantId == request.TenantId)
            .OrderBy(f => f.Name)
            .ToListAsync(cancellationToken);

        return facilities.Select(f => new IntegrationFacilityDto(
            f.Id,
            f.Name,
            f.Slug,
            f.FacilityType.ToString(),
            f.Status.ToString(),
            f.DeploymentMode.ToString(),
            f.BranchId,
            f.BranchId != null && branches.TryGetValue(f.BranchId.Value, out var name) ? name : null)).ToList();
    }
}
