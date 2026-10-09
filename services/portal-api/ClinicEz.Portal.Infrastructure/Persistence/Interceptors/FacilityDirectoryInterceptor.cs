using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Hub;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Options;

namespace ClinicEz.Portal.Infrastructure.Persistence.Interceptors;

/// <summary>
/// Keeps the hub directory in step with the facility registry. Every <c>SaveChanges</c> that creates, renames,
/// activates, suspends, deletes or moves a facility, or changes its visibility or hosting, also stages
/// <c>directory.facility.upserted</c> (and the cell / same-branch link messages that go with it) in the same
/// transaction, so the directory feed cannot be forgotten at any of the many places a facility is modified.
/// The facility's <see cref="Facility.CellId"/> is derived from its hosting here for the same reason. Cross-tenant\n/// <see cref="FacilityLink"/> changes are staged as <c>directory.link.upserted</c> in the same way.
/// </summary>
public sealed class FacilityDirectoryInterceptor(IOptions<HubOptions> options, IFacilityLinkService links) : SaveChangesInterceptor
{
    /// <summary>Changes to these properties are visible in the directory.</summary>
    private static readonly string[] DirectoryProperties =
    [
        nameof(Facility.Name),
        nameof(Facility.FacilityType),
        nameof(Facility.Status),
        nameof(Facility.DeploymentMode),
        nameof(Facility.CellId),
        nameof(Facility.BranchId),
        nameof(Facility.City),
        nameof(Facility.Visibility),
        nameof(Facility.AcceptsExternalRequests),
        nameof(Facility.IsDeleted)
    ];

    /// <summary>Changes to these properties of a cross-tenant link are visible to the hub.</summary>
    private static readonly string[] LinkProperties =
    [
        nameof(FacilityLink.Status),
        nameof(FacilityLink.Scopes),
        nameof(FacilityLink.IsDeleted)
    ];

    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        // Synchronous SaveChanges is only used by start-up tooling; request handlers all use SaveChangesAsync.
        StageAsync(eventData.Context, CancellationToken.None).GetAwaiter().GetResult();
        return result;
    }

    public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        await StageAsync(eventData.Context, cancellationToken);
        return result;
    }

    private async Task StageAsync(DbContext? context, CancellationToken cancellationToken)
    {
        if (context is not ApplicationDbContext db) return;

        db.ChangeTracker.DetectChanges();
        var entries = db.ChangeTracker.Entries<Facility>()
            .Where(e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
            .ToList();
        var linkEntries = db.ChangeTracker.Entries<FacilityLink>()
            .Where(e => e.State is EntityState.Added or EntityState.Deleted
                        || (e.State == EntityState.Modified && LinkProperties.Any(p => e.Property(p).IsModified)))
            .ToList();
        if (entries.Count == 0 && linkEntries.Count == 0) return;

        var cloudCellId = options.Value.CloudCellId;
        var writer = new DirectoryFeedWriter(db);
        var pending = entries.Select(e => e.Entity).ToList();
        var tenants = new Dictionary<Guid, Tenant?>();

        foreach (var entry in entries)
        {
            var facility = entry.Entity;
            var removed = entry.State == EntityState.Deleted;
            if (!removed) SyncCellId(entry, cloudCellId);

            if (entry.State == EntityState.Modified && !DirectoryProperties.Any(p => entry.Property(p).IsModified)) continue;

            var payload = DirectoryPayloads.Facility(facility, cloudCellId);
            if (removed) payload = payload with { Active = false };

            if (entry.State == EntityState.Added || entry.Property(nameof(Facility.CellId)).IsModified)
            {
                writer.Cell(await CellFor(db, facility, payload.CellId, cloudCellId, tenants, cancellationToken));
            }

            writer.Facility(payload);

            if (removed) continue;

            var branchChanged = entry.State == EntityState.Added
                ? facility.BranchId is not null
                : entry.Property(nameof(Facility.BranchId)).IsModified;

            if (!branchChanged) continue;

            if (facility.BranchId is { } newBranch && FacilityCells.IsRoutable(facility))
            {
                foreach (var link in await links.BuildSameBranchLinksAsync(db, facility, newBranch, LinkStatus.Active, pending, cancellationToken))
                {
                    writer.Link(link);
                }
            }

            if (entry.State == EntityState.Modified && entry.Property(nameof(Facility.BranchId)).OriginalValue is Guid oldBranch)
            {
                foreach (var link in await links.BuildSameBranchLinksAsync(db, facility, oldBranch, LinkStatus.Revoked, pending, cancellationToken))
                {
                    writer.Link(link);
                }
            }
        }

        foreach (var entry in linkEntries)
        {
            writer.Link(LinkPayload(entry));
        }

        writer.Flush();
    }

    private static DirectoryLinkUpsertedPayload LinkPayload(EntityEntry<FacilityLink> entry)
    {
        var link = entry.Entity;
        var gone = entry.State == EntityState.Deleted || link.IsDeleted;
        return new DirectoryLinkUpsertedPayload
        {
            LinkId = link.Id,
            SourceTenantId = link.SourceTenantId.ToString(),
            SourceFacilityId = link.SourceFacilityId.ToString(),
            TargetTenantId = link.TargetTenantId.ToString(),
            TargetFacilityId = link.TargetFacilityId.ToString(),
            Status = gone ? LinkStatus.Revoked : link.Status,
            Scopes = link.Scopes
        };
    }

    private static void SyncCellId(EntityEntry<Facility> entry, string cloudCellId)
    {
        var facility = entry.Entity;
        var expected = FacilityCells.ResolveCellId(facility.DeploymentMode, facility.TenantId, cloudCellId);
        if (facility.CellId != expected) entry.Property(nameof(Facility.CellId)).CurrentValue = expected;
    }

    private static async Task<DirectoryCellUpsertedPayload> CellFor(
        ApplicationDbContext db,
        Facility facility,
        string cellId,
        string cloudCellId,
        Dictionary<Guid, Tenant?> tenants,
        CancellationToken cancellationToken)
    {
        if (!FacilityCells.IsEdgeCell(cellId)) return DirectoryPayloads.CloudCell(cloudCellId);

        if (!tenants.TryGetValue(facility.TenantId, out var tenant))
        {
            tenant = await db.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.Id == facility.TenantId, cancellationToken);
            tenants[facility.TenantId] = tenant;
        }

        // A tenant staged in the same unit of work as its first facility is not in the database yet.
        tenant ??= db.ChangeTracker.Entries<Tenant>().Select(e => e.Entity).FirstOrDefault(t => t.Id == facility.TenantId)
                   ?? throw new InvalidOperationException($"Tenant {facility.TenantId} of facility {facility.Id} was not found.");

        return DirectoryPayloads.EdgeCell(tenant);
    }
}
