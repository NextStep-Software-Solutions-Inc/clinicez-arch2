using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ClinicEz.Portal.Infrastructure.Hub;

public sealed class HubDirectoryResyncService(
    ApplicationDbContext db,
    IFacilityLinkService links,
    IOptions<HubOptions> options) : IHubDirectoryResyncService
{
    public async Task<HubResyncResult> ResyncAsync(CancellationToken cancellationToken)
    {
        var cloudCellId = options.Value.CloudCellId;

        // Deleted facilities are included on purpose: they are sent as inactive so the hub forgets them.
        var facilities = await db.Facilities.IgnoreQueryFilters().AsNoTracking().ToListAsync(cancellationToken);

        var edgeTenantIds = facilities
            .Where(f => !f.IsDeleted && f.DeploymentMode == FacilityDeploymentMode.OnPremise)
            .Select(f => f.TenantId)
            .Distinct()
            .ToList();
        var edgeTenants = await db.Tenants.AsNoTracking().Where(t => edgeTenantIds.Contains(t.Id)).ToListAsync(cancellationToken);

        var writer = new DirectoryFeedWriter(db);
        writer.Cell(DirectoryPayloads.CloudCell(cloudCellId));
        foreach (var tenant in edgeTenants) writer.Cell(DirectoryPayloads.EdgeCell(tenant));
        var cells = 1 + edgeTenants.Count;

        foreach (var facility in facilities) writer.Facility(DirectoryPayloads.Facility(facility, cloudCellId));

        var allLinks = links.BuildAllSameBranchLinks(facilities);
        foreach (var link in allLinks) writer.Link(link);

        var crossTenantLinks = await db.FacilityLinks.IgnoreQueryFilters().AsNoTracking().ToListAsync(cancellationToken);
        foreach (var link in crossTenantLinks)
        {
            writer.Link(new DirectoryLinkUpsertedPayload
            {
                LinkId = link.Id,
                SourceTenantId = link.SourceTenantId.ToString(),
                SourceFacilityId = link.SourceFacilityId.ToString(),
                TargetTenantId = link.TargetTenantId.ToString(),
                TargetFacilityId = link.TargetFacilityId.ToString(),
                Status = link.IsDeleted ? LinkStatus.Revoked : link.Status,
                Scopes = link.Scopes
            });
        }

        writer.Flush();
        await db.SaveChangesAsync(cancellationToken);

        return new HubResyncResult(cells, facilities.Count, allLinks.Count + crossTenantLinks.Count);
    }
}
