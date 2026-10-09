using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Features.Licensing;

/// <summary>A facility's slice of the workspace pools, as it is in its signed license right now.</summary>
public record FacilityAllocationDto(
    Guid FacilityId,
    string FacilityName,
    string FacilityType,
    int MaxStaff,
    int MaxStorageMb,
    int ConcurrentTerminals,
    int? ExplicitMaxStaff,
    int? ExplicitMaxStorageMb,
    int? ExplicitConcurrentTerminals,
    DateTime? LicenseExpiresAt,
    DateTime? LastSeenAt,
    string? AppVersion);

public record WorkspacePoolsDto(int Staff, int StorageMb, int Terminals);

/// <summary>
/// What the workspace is entitled to and how the pools are divided. <c>Limits</c> maps each limit key to its ceiling;
/// <c>null</c> means unlimited. <c>int.MaxValue</c> in a pool or share also means unlimited.
/// </summary>
public record WorkspaceEntitlementsDto(
    string PlanSlug,
    string PlanName,
    string Status,
    int Version,
    DateTime? PeriodEnd,
    Dictionary<string, long?> Limits,
    List<string> Features,
    WorkspacePoolsDto Pools,
    List<FacilityAllocationDto> Facilities);

public record GetWorkspaceEntitlementsQuery(string TenantSlug) : IRequest<WorkspaceEntitlementsDto>;

public class GetWorkspaceEntitlementsQueryHandler(
    IApplicationDbContext context,
    IEntitlementService entitlements,
    IFacilityAllocationService allocations) : IRequestHandler<GetWorkspaceEntitlementsQuery, WorkspaceEntitlementsDto>
{
    public async Task<WorkspaceEntitlementsDto> Handle(GetWorkspaceEntitlementsQuery request, CancellationToken cancellationToken)
    {
        var tenant = await WorkspaceEntitlementsMapper.FindTenantAsync(context, request.TenantSlug, cancellationToken);
        return await WorkspaceEntitlementsMapper.BuildAsync(context, entitlements, allocations, tenant.Id, cancellationToken);
    }
}

/// <summary>
/// Sets (or, with all values null, clears) the explicit pool shares of one facility. Shares may not add up to more than a pool
/// (409 <c>allocation_exceeds_pool</c>). The facility's license is re-minted and <c>entitlements.changed</c> goes out with the change.
/// </summary>
public record SetFacilityAllocationCommand(
    string TenantSlug,
    Guid FacilityId,
    int? MaxStaff,
    int? MaxStorageMb,
    int? ConcurrentTerminals) : IRequest<WorkspaceEntitlementsDto>;

public class SetFacilityAllocationCommandHandler(
    IApplicationDbContext context,
    IEntitlementService entitlements,
    IFacilityAllocationService allocations,
    IEntitlementsPublisher publisher) : IRequestHandler<SetFacilityAllocationCommand, WorkspaceEntitlementsDto>
{
    public async Task<WorkspaceEntitlementsDto> Handle(SetFacilityAllocationCommand request, CancellationToken cancellationToken)
    {
        var tenant = await WorkspaceEntitlementsMapper.FindTenantAsync(context, request.TenantSlug, cancellationToken);

        if (!await context.Facilities.AnyAsync(f => f.Id == request.FacilityId && f.TenantId == tenant.Id, cancellationToken))
        {
            throw new NotFoundException("Facility not found in this workspace.");
        }

        var snapshot = await entitlements.ResolveAsync(tenant.Id, cancellationToken);
        await allocations.SetAllocationAsync(
            tenant.Id, request.FacilityId, snapshot, request.MaxStaff, request.MaxStorageMb, request.ConcurrentTerminals, cancellationToken);
        await context.SaveChangesAsync(cancellationToken);

        await publisher.StageForWorkspaceAsync(tenant.Id, cancellationToken);
        await context.SaveChangesAsync(cancellationToken);

        return await WorkspaceEntitlementsMapper.BuildAsync(context, entitlements, allocations, tenant.Id, cancellationToken);
    }
}

internal static class WorkspaceEntitlementsMapper
{
    public static async Task<Domain.Entities.Tenant> FindTenantAsync(IApplicationDbContext context, string slugOrId, CancellationToken ct)
    {
        var key = slugOrId.Trim().ToLowerInvariant();
        return await context.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == key || t.Id.ToString() == key, ct)
            ?? throw new NotFoundException($"Workspace '{slugOrId}' not found.");
    }

    public static async Task<WorkspaceEntitlementsDto> BuildAsync(
        IApplicationDbContext context,
        IEntitlementService entitlements,
        IFacilityAllocationService allocations,
        Guid tenantId,
        CancellationToken ct)
    {
        var snapshot = await entitlements.ResolveAsync(tenantId, ct);
        var shares = await allocations.ComputeSharesAsync(tenantId, snapshot, null, ct);
        var explicitShares = await context.FacilityAllocations.AsNoTracking()
            .Where(a => a.TenantId == tenantId)
            .ToDictionaryAsync(a => a.FacilityId, ct);
        var facilities = await context.Facilities.AsNoTracking()
            .Where(f => f.TenantId == tenantId)
            .OrderBy(f => f.CreatedAt)
            .ToListAsync(ct);

        var poolStorageGb = snapshot.Limit(EntitlementKeys.PoolStorageGb);
        var pools = new WorkspacePoolsDto(
            snapshot.LimitAsInt(EntitlementKeys.PoolStaff),
            poolStorageGb >= int.MaxValue / 1024 ? int.MaxValue : (int)(poolStorageGb * 1024),
            snapshot.LimitAsInt(EntitlementKeys.PoolTerminals));

        return new WorkspaceEntitlementsDto(
            snapshot.PlanSlug,
            snapshot.PlanName,
            snapshot.Status.ToString(),
            snapshot.Version,
            snapshot.PeriodEnd,
            snapshot.Limits.ToDictionary(l => l.Key, l => l.Value == EntitlementSnapshot.Unlimited ? (long?)null : l.Value),
            snapshot.Features.OrderBy(f => f, StringComparer.Ordinal).ToList(),
            pools,
            facilities
                .Where(f => shares.ContainsKey(f.Id))
                .Select(f =>
                {
                    var share = shares[f.Id];
                    explicitShares.TryGetValue(f.Id, out var explicitShare);
                    return new FacilityAllocationDto(
                        f.Id, f.Name, f.FacilityType.ToString(),
                        share.MaxStaff, share.MaxStorageMb, share.ConcurrentTerminals,
                        explicitShare?.MaxStaff, explicitShare?.MaxStorageMb, explicitShare?.ConcurrentTerminals,
                        f.LicenseExpiresAt, f.LastSeenAt, f.AppVersion);
                })
                .ToList());
    }
}
