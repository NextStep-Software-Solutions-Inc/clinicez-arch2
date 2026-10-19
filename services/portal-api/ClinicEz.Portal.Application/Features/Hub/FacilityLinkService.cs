using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Features.Hub;

/// <summary>
/// Decides which facility links exist and feeds them to the hub directory (<c>directory.link.upserted</c>).
/// <para>
/// This service knows the automatic rule from the architecture plan (4.3/4.4): two facilities of the SAME tenant
/// that share a branch are linked with every scope, in both directions, with no setup ("one roof works").
/// Cross-tenant links (request, target-admin approval, auto-accept for public facilities, gated by
/// <c>feature.cross_tenant_interop</c>) are <see cref="FacilityLink"/> rows managed by the commands in
/// <c>Features/Links</c>; the directory interceptor feeds those to the hub.
/// </para>
/// </summary>
public interface IFacilityLinkService
{
    /// <summary>
    /// Links between <paramref name="facility"/> and every other routable facility of its tenant that sits in
    /// <paramref name="branchId"/>, both directions, all carrying <paramref name="status"/>.
    /// </summary>
    /// <param name="pendingFacilities">Facilities with unsaved changes in the current unit of work. Their in-memory
    /// state wins over what the database still says.</param>
    Task<IReadOnlyList<DirectoryLinkUpsertedPayload>> BuildSameBranchLinksAsync(
        IApplicationDbContext db,
        Facility facility,
        Guid branchId,
        LinkStatus status,
        IReadOnlyCollection<Facility> pendingFacilities,
        CancellationToken cancellationToken);

    /// <summary>Every automatic link among <paramref name="facilities"/> (all tenants; used by the full resync).</summary>
    IReadOnlyList<DirectoryLinkUpsertedPayload> BuildAllSameBranchLinks(IEnumerable<Facility> facilities);
}

public sealed class SameBranchFacilityLinkService : IFacilityLinkService
{
    public async Task<IReadOnlyList<DirectoryLinkUpsertedPayload>> BuildSameBranchLinksAsync(
        IApplicationDbContext db,
        Facility facility,
        Guid branchId,
        LinkStatus status,
        IReadOnlyCollection<Facility> pendingFacilities,
        CancellationToken cancellationToken)
    {
        var pendingIds = pendingFacilities.Select(f => f.Id).ToHashSet();

        var stored = await db.Facilities
            .AsNoTracking()
            .Where(f => f.TenantId == facility.TenantId
                        && f.BranchId == branchId
                        && f.Id != facility.Id
                        && !pendingIds.Contains(f.Id))
            .ToListAsync(cancellationToken);

        var peers = stored
            .Concat(pendingFacilities.Where(f => f.TenantId == facility.TenantId && f.BranchId == branchId && f.Id != facility.Id))
            .Where(FacilityCells.IsRoutable);

        var links = new List<DirectoryLinkUpsertedPayload>();
        foreach (var peer in peers)
        {
            links.Add(DirectoryPayloads.SameTenantLink(facility, peer, status));
            links.Add(DirectoryPayloads.SameTenantLink(peer, facility, status));
        }

        return links;
    }

    public IReadOnlyList<DirectoryLinkUpsertedPayload> BuildAllSameBranchLinks(IEnumerable<Facility> facilities)
    {
        var links = new List<DirectoryLinkUpsertedPayload>();
        var groups = facilities
            .Where(f => f.BranchId is not null && FacilityCells.IsRoutable(f))
            .GroupBy(f => (f.TenantId, BranchId: f.BranchId!.Value));

        foreach (var group in groups)
        {
            var members = group.OrderBy(f => f.Id).ToList();
            for (var i = 0; i < members.Count; i++)
            {
                for (var j = 0; j < members.Count; j++)
                {
                    if (i != j) links.Add(DirectoryPayloads.SameTenantLink(members[i], members[j], LinkStatus.Active));
                }
            }
        }

        return links;
    }
}
