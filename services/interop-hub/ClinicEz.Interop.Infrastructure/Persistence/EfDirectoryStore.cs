using ClinicEz.Interop.Application;
using ClinicEz.Interop.Application.Abstractions;
using ClinicEz.Interop.Domain.Entities;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Interop.Infrastructure.Persistence;

public sealed class EfDirectoryStore(HubDbContext db, TimeProvider time) : IDirectoryStore
{
    private const int MaxVersionRetries = 5;

    public Task<HubCell?> GetCellAsync(string cellId, CancellationToken ct) =>
        db.Cells.AsNoTracking().FirstOrDefaultAsync(c => c.CellId == cellId, ct);

    public Task<HubFacility?> GetFacilityAsync(string tenantId, string facilityId, CancellationToken ct)
    {
        var key = HubFacility.MakeKey(tenantId, facilityId);
        return db.Facilities.AsNoTracking().FirstOrDefaultAsync(f => f.Key == key, ct);
    }

    public async Task<IReadOnlyList<string>> GetTenantsOfCellAsync(string cellId, CancellationToken ct)
    {
        var tenants = await db.Facilities.AsNoTracking().Where(f => f.CellId == cellId).Select(f => f.TenantId).Distinct().ToListAsync(ct);
        var cellTenant = await db.Cells.AsNoTracking().Where(c => c.CellId == cellId).Select(c => c.TenantId).FirstOrDefaultAsync(ct);
        if (!string.IsNullOrWhiteSpace(cellTenant) && !tenants.Contains(cellTenant)) tenants.Add(cellTenant);
        tenants.Sort(StringComparer.Ordinal);
        return tenants;
    }

    public async Task<IReadOnlyList<HubLink>> GetActiveLinksBetweenAsync(string facilityKeyA, string facilityKeyB, CancellationToken ct)
    {
        var (tenantA, facilityA) = Split(facilityKeyA);
        var (tenantB, facilityB) = Split(facilityKeyB);
        return await db.Links.AsNoTracking()
            .Where(l => l.Status == LinkStatus.Active
                        && ((l.SourceTenantId == tenantA && l.SourceFacilityId == facilityA && l.TargetTenantId == tenantB && l.TargetFacilityId == facilityB)
                            || (l.SourceTenantId == tenantB && l.SourceFacilityId == facilityB && l.TargetTenantId == tenantA && l.TargetFacilityId == facilityA)))
            .ToListAsync(ct);
    }

    public Task UpsertCellAsync(DirectoryCellUpsertedPayload cell, CancellationToken ct) =>
        WithNextVersionAsync(async version =>
        {
            var now = time.GetUtcNow().UtcDateTime;
            var entity = await db.Cells.FirstOrDefaultAsync(c => c.CellId == cell.CellId, ct);
            if (entity is null)
            {
                entity = new HubCell { CellId = cell.CellId, CreatedAtUtc = now };
                db.Cells.Add(entity);
            }

            entity.Name = cell.Name;
            entity.Kind = cell.Kind;
            entity.TenantId = cell.TenantId;
            entity.Active = cell.Active;
            entity.UpdatedAtUtc = now;
            entity.Version = version;
        }, ct);

    public Task UpsertFacilityAsync(DirectoryFacilityUpsertedPayload facility, CancellationToken ct) =>
        WithNextVersionAsync(async version =>
        {
            var key = HubFacility.MakeKey(facility.TenantId, facility.FacilityId);
            var entity = await db.Facilities.FirstOrDefaultAsync(f => f.Key == key, ct);
            if (entity is null)
            {
                entity = new HubFacility(facility.TenantId, facility.FacilityId);
                db.Facilities.Add(entity);
            }

            Apply(entity, facility, time.GetUtcNow().UtcDateTime, version);
        }, ct);

    public Task UpsertLinkAsync(DirectoryLinkUpsertedPayload link, CancellationToken ct) =>
        WithNextVersionAsync(async version =>
        {
            var entity = await db.Links.FirstOrDefaultAsync(l => l.LinkId == link.LinkId, ct);
            if (entity is null)
            {
                entity = new HubLink { LinkId = link.LinkId };
                db.Links.Add(entity);
            }

            Apply(entity, link, time.GetUtcNow().UtcDateTime, version);
        }, ct);

    public async Task<IReadOnlyList<VisibleFacility>> QueryAsync(DirectoryQuery query, CancellationToken ct)
    {
        IQueryable<HubFacility> facilities = db.Facilities.AsNoTracking().Where(f => f.Active);
        if (query.Type is { } type) facilities = facilities.Where(f => f.FacilityType == type);
        if (!string.IsNullOrWhiteSpace(query.City))
        {
            var city = query.City.Trim().ToLower();
            facilities = facilities.Where(f => f.City != null && f.City.ToLower() == city);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var search = query.Search.Trim().ToLower();
            facilities = facilities.Where(f => f.DisplayName.ToLower().Contains(search));
        }

        if (query.ViewerTenants is null)
        {
            var all = await facilities.OrderBy(f => f.DisplayName).ThenBy(f => f.Key).ToListAsync(ct);
            return all.Select(f => new VisibleFacility(f, false, null)).ToList();
        }

        var viewer = query.ViewerTenants.ToArray();
        var linkStatuses = await LinkStatusesAsync(viewer, ct);
        var activeLinked = linkStatuses.Where(kv => kv.Value == LinkStatus.Active).Select(kv => kv.Key).ToArray();

        var visible = await facilities
            .Where(f => viewer.Contains(f.TenantId)
                        || f.Visibility == FacilityVisibility.Public
                        || (f.Visibility == FacilityVisibility.Network && activeLinked.Contains(f.Key)))
            .OrderBy(f => f.DisplayName).ThenBy(f => f.Key)
            .ToListAsync(ct);

        return visible
            .Select(f => new VisibleFacility(
                f,
                viewer.Contains(f.TenantId, StringComparer.Ordinal),
                linkStatuses.TryGetValue(f.Key, out var status) ? status : null))
            .ToList();
    }

    public async Task<long> GetVersionAsync(CancellationToken ct) =>
        await db.State.AsNoTracking().Where(s => s.Key == HubState.DirectoryVersion).Select(s => s.Value).FirstOrDefaultAsync(ct);

    public async Task<long> GetSnapshotCursorAsync(CancellationToken ct) =>
        await db.State.AsNoTracking().Where(s => s.Key == HubState.SnapshotCursor).Select(s => s.Value).FirstOrDefaultAsync(ct);

    public async Task<DirectorySnapshotDto> BuildSnapshotAsync(IReadOnlyCollection<string> viewerTenants, string ownCellId, CancellationToken ct)
    {
        var version = await GetVersionAsync(ct);
        var visible = (await QueryAsync(new DirectoryQuery(viewerTenants), ct)).Select(v => v.Facility).ToList();
        var ownCell = await db.Facilities.AsNoTracking().Where(f => f.Active && f.CellId == ownCellId).ToListAsync(ct);
        foreach (var facility in ownCell.Where(f => visible.All(v => v.Key != f.Key))) visible.Add(facility);

        var tenants = viewerTenants.ToArray();
        var links = await db.Links.AsNoTracking()
            .Where(l => tenants.Contains(l.SourceTenantId) || tenants.Contains(l.TargetTenantId))
            .ToListAsync(ct);

        var cellIds = visible.Select(f => f.CellId).Append(ownCellId).Distinct().ToArray();
        var cells = await db.Cells.AsNoTracking().Where(c => cellIds.Contains(c.CellId)).ToListAsync(ct);

        return new DirectorySnapshotDto(
            version,
            false,
            cells.Select(c => new DirectoryCellUpsertedPayload { CellId = c.CellId, Name = c.Name, Kind = c.Kind, TenantId = c.TenantId, Active = c.Active }).ToList(),
            visible.Select(f => new DirectoryFacilityUpsertedPayload
            {
                TenantId = f.TenantId,
                FacilityId = f.FacilityId,
                FacilityType = f.FacilityType,
                CellId = f.CellId,
                DisplayName = f.DisplayName,
                BranchId = f.BranchId,
                City = f.City,
                Visibility = f.Visibility,
                AcceptsExternalRequests = f.AcceptsExternalRequests,
                Active = f.Active
            }).ToList(),
            links.Select(l => new DirectoryLinkUpsertedPayload
            {
                LinkId = l.LinkId,
                SourceTenantId = l.SourceTenantId,
                SourceFacilityId = l.SourceFacilityId,
                TargetTenantId = l.TargetTenantId,
                TargetFacilityId = l.TargetFacilityId,
                Status = l.Status,
                Scopes = l.Scopes
            }).ToList());
    }

    public async Task ApplySnapshotAsync(DirectorySnapshotDto snapshot, CancellationToken ct)
    {
        var now = time.GetUtcNow().UtcDateTime;
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var cells = await db.Cells.ToDictionaryAsync(c => c.CellId, ct);
        foreach (var incoming in snapshot.Cells)
        {
            if (!cells.Remove(incoming.CellId, out var entity))
            {
                entity = new HubCell { CellId = incoming.CellId, CreatedAtUtc = now };
                db.Cells.Add(entity);
            }

            entity.Name = incoming.Name;
            entity.Kind = incoming.Kind;
            entity.TenantId = incoming.TenantId;
            entity.Active = incoming.Active;
            entity.UpdatedAtUtc = now;
            entity.Version = snapshot.Version;
        }

        db.Cells.RemoveRange(cells.Values);

        var facilities = await db.Facilities.ToDictionaryAsync(f => f.Key, ct);
        foreach (var incoming in snapshot.Facilities)
        {
            var key = HubFacility.MakeKey(incoming.TenantId, incoming.FacilityId);
            if (!facilities.Remove(key, out var entity))
            {
                entity = new HubFacility(incoming.TenantId, incoming.FacilityId);
                db.Facilities.Add(entity);
            }

            Apply(entity, incoming, now, snapshot.Version);
        }

        db.Facilities.RemoveRange(facilities.Values);

        var links = await db.Links.ToDictionaryAsync(l => l.LinkId, ct);
        foreach (var incoming in snapshot.Links)
        {
            if (!links.Remove(incoming.LinkId, out var entity))
            {
                entity = new HubLink { LinkId = incoming.LinkId };
                db.Links.Add(entity);
            }

            Apply(entity, incoming, now, snapshot.Version);
        }

        db.Links.RemoveRange(links.Values);

        var cursor = await db.State.FirstOrDefaultAsync(s => s.Key == HubState.SnapshotCursor, ct);
        if (cursor is null) db.State.Add(cursor = new HubState { Key = HubState.SnapshotCursor });
        cursor.Value = snapshot.Version;
        cursor.UpdatedAtUtc = now;

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    private static void Apply(HubFacility entity, DirectoryFacilityUpsertedPayload source, DateTime now, long version)
    {
        entity.FacilityType = source.FacilityType;
        entity.CellId = source.CellId;
        entity.DisplayName = source.DisplayName;
        entity.BranchId = source.BranchId;
        entity.City = source.City;
        entity.Visibility = source.Visibility;
        entity.AcceptsExternalRequests = source.AcceptsExternalRequests;
        entity.Active = source.Active;
        entity.UpdatedAtUtc = now;
        entity.Version = version;
    }

    private static void Apply(HubLink entity, DirectoryLinkUpsertedPayload source, DateTime now, long version)
    {
        entity.SourceTenantId = source.SourceTenantId;
        entity.SourceFacilityId = source.SourceFacilityId;
        entity.TargetTenantId = source.TargetTenantId;
        entity.TargetFacilityId = source.TargetFacilityId;
        entity.Status = source.Status;
        entity.Scopes = source.Scopes;
        entity.UpdatedAtUtc = now;
        entity.Version = version;
    }

    /// <summary>
    /// The best link status between any facility of the viewer's tenants and each other facility
    /// (Active beats Pending beats Revoked beats Rejected).
    /// </summary>
    private async Task<Dictionary<string, LinkStatus>> LinkStatusesAsync(string[] viewer, CancellationToken ct)
    {
        var links = await db.Links.AsNoTracking()
            .Where(l => viewer.Contains(l.SourceTenantId) || viewer.Contains(l.TargetTenantId))
            .ToListAsync(ct);

        var best = new Dictionary<string, LinkStatus>(StringComparer.Ordinal);
        foreach (var link in links)
        {
            var sourceOwn = viewer.Contains(link.SourceTenantId, StringComparer.Ordinal);
            var targetOwn = viewer.Contains(link.TargetTenantId, StringComparer.Ordinal);
            if (sourceOwn == targetOwn) continue;
            var other = sourceOwn ? link.TargetKey : link.SourceKey;
            if (!best.TryGetValue(other, out var current) || Rank(link.Status) > Rank(current)) best[other] = link.Status;
        }

        return best;
    }

    private static int Rank(LinkStatus status) => status switch
    {
        LinkStatus.Active => 3,
        LinkStatus.Pending => 2,
        LinkStatus.Revoked => 1,
        _ => 0
    };

    private static (string Tenant, string Facility) Split(string key)
    {
        var i = key.IndexOf('/');
        return (key[..i], key[(i + 1)..]);
    }

    /// <summary>
    /// Runs <paramref name="apply"/> with the next directory version. The version counter row is a concurrency token,
    /// so two hub instances can never hand out the same version; the loser retries.
    /// </summary>
    private async Task WithNextVersionAsync(Func<long, Task> apply, CancellationToken ct)
    {
        for (var attempt = 1; ; attempt++)
        {
            var state = await db.State.FirstOrDefaultAsync(s => s.Key == HubState.DirectoryVersion, ct);
            if (state is null) db.State.Add(state = new HubState { Key = HubState.DirectoryVersion });
            state.Value++;
            state.UpdatedAtUtc = time.GetUtcNow().UtcDateTime;

            await apply(state.Value);
            try
            {
                await db.SaveChangesAsync(ct);
                return;
            }
            catch (DbUpdateException) when (attempt < MaxVersionRetries)
            {
                db.ChangeTracker.Clear();
            }
        }
    }
}
