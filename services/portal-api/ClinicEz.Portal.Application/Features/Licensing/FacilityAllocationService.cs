using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Features.Licensing;

public interface IFacilityAllocationService
{
    /// <summary>
    /// Every facility's effective share of the pools. Explicit <c>FacilityAllocation</c> values win; facilities without one
    /// split what is left of each pool equally (remainders go to the oldest facilities), so shares always add up to the pool.
    /// </summary>
    /// <param name="includeFacilityId">A facility being created in this unit of work and not saved yet.</param>
    Task<IReadOnlyDictionary<Guid, FacilityShare>> ComputeSharesAsync(
        Guid tenantId, EntitlementSnapshot snapshot, Guid? includeFacilityId, CancellationToken cancellationToken);

    /// <summary>Sets a facility's explicit shares (null = automatic). Throws when the explicit shares would exceed a pool.</summary>
    Task SetAllocationAsync(
        Guid tenantId, Guid facilityId, EntitlementSnapshot snapshot, int? maxStaff, int? maxStorageMb, int? terminals, CancellationToken cancellationToken);
}

public sealed class FacilityAllocationService(IApplicationDbContext context) : IFacilityAllocationService
{
    public const string ExceedsPoolCode = "allocation_exceeds_pool";
    private const int MbPerGb = 1024;

    public async Task<IReadOnlyDictionary<Guid, FacilityShare>> ComputeSharesAsync(
        Guid tenantId, EntitlementSnapshot snapshot, Guid? includeFacilityId, CancellationToken cancellationToken)
    {
        var facilityIds = await context.Facilities
            .AsNoTracking()
            .Where(f => f.TenantId == tenantId && f.Status != FacilityStatus.Failed)
            .OrderBy(f => f.CreatedAt).ThenBy(f => f.Id)
            .Select(f => f.Id)
            .ToListAsync(cancellationToken);

        if (includeFacilityId is { } extra && !facilityIds.Contains(extra))
        {
            facilityIds.Add(extra);
        }

        var allocations = await context.FacilityAllocations
            .AsNoTracking()
            .Where(a => a.TenantId == tenantId)
            .ToDictionaryAsync(a => a.FacilityId, cancellationToken);

        var staff = Split(facilityIds, PoolStaff(snapshot), id => allocations.GetValueOrDefault(id)?.MaxStaff);
        var storage = Split(facilityIds, PoolStorageMb(snapshot), id => allocations.GetValueOrDefault(id)?.MaxStorageMb);
        var terminals = Split(facilityIds, PoolTerminals(snapshot), id => allocations.GetValueOrDefault(id)?.ConcurrentTerminals);

        return facilityIds.ToDictionary(id => id, id => new FacilityShare(staff[id], storage[id], terminals[id]));
    }

    public async Task SetAllocationAsync(
        Guid tenantId, Guid facilityId, EntitlementSnapshot snapshot, int? maxStaff, int? maxStorageMb, int? terminals, CancellationToken cancellationToken)
    {
        if (maxStaff < 0 || maxStorageMb < 0 || terminals < 0)
        {
            throw new EntitlementException("Allocations cannot be negative.", ExceedsPoolCode);
        }

        var facilityBelongs = await context.Facilities.AnyAsync(f => f.Id == facilityId && f.TenantId == tenantId, cancellationToken);
        if (!facilityBelongs)
        {
            throw new InvalidOperationException("Facility not found in this workspace.");
        }

        var others = await context.FacilityAllocations
            .Where(a => a.TenantId == tenantId && a.FacilityId != facilityId)
            .ToListAsync(cancellationToken);

        EnsureWithinPool("staff", PoolStaff(snapshot), others.Sum(a => (long)(a.MaxStaff ?? 0)) + (maxStaff ?? 0));
        EnsureWithinPool("storage", PoolStorageMb(snapshot), others.Sum(a => (long)(a.MaxStorageMb ?? 0)) + (maxStorageMb ?? 0));
        EnsureWithinPool("terminals", PoolTerminals(snapshot), others.Sum(a => (long)(a.ConcurrentTerminals ?? 0)) + (terminals ?? 0));

        var allocation = await context.FacilityAllocations.FirstOrDefaultAsync(a => a.FacilityId == facilityId, cancellationToken);
        if (allocation is null)
        {
            allocation = new FacilityAllocation { TenantId = tenantId, FacilityId = facilityId };
            context.FacilityAllocations.Add(allocation);
        }

        allocation.MaxStaff = maxStaff;
        allocation.MaxStorageMb = maxStorageMb;
        allocation.ConcurrentTerminals = terminals;
    }

    private static void EnsureWithinPool(string name, int pool, long total)
    {
        if (total > pool)
        {
            throw new EntitlementException(
                $"The {name} allocations add up to {total}, but the workspace pool is {pool}.",
                ExceedsPoolCode);
        }
    }

    private static int PoolStaff(EntitlementSnapshot s) => s.LimitAsInt(EntitlementKeys.PoolStaff);

    private static int PoolStorageMb(EntitlementSnapshot s)
    {
        var gb = s.Limit(EntitlementKeys.PoolStorageGb);
        return gb >= int.MaxValue / MbPerGb ? int.MaxValue : (int)(gb * MbPerGb);
    }

    private static int PoolTerminals(EntitlementSnapshot s) => s.LimitAsInt(EntitlementKeys.PoolTerminals);

    private static Dictionary<Guid, int> Split(IReadOnlyList<Guid> facilityIds, int pool, Func<Guid, int?> explicitShare)
    {
        var result = new Dictionary<Guid, int>();
        var unset = new List<Guid>();
        long explicitTotal = 0;

        foreach (var id in facilityIds)
        {
            if (explicitShare(id) is { } value)
            {
                result[id] = value;
                explicitTotal += value;
            }
            else
            {
                unset.Add(id);
            }
        }

        if (unset.Count == 0) return result;

        if (pool == int.MaxValue)
        {
            foreach (var id in unset) result[id] = int.MaxValue;
            return result;
        }

        var remaining = (int)Math.Max(0, pool - explicitTotal);
        var each = remaining / unset.Count;
        var leftover = remaining % unset.Count;
        for (var i = 0; i < unset.Count; i++)
        {
            result[unset[i]] = each + (i < leftover ? 1 : 0);
        }

        return result;
    }
}
