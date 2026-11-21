using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Admin.Services;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Features.DirectoryVerification;

public sealed record DirectoryVerificationResyncResult(
    int VerifiedFacilitiesEmitted,
    int VerifiedPractitionerAffiliationsEmitted);

public interface IDirectoryVerificationSyncService
{
    Task<DirectoryVerificationResyncResult> ResyncVerifiedDirectoryAsync(CancellationToken ct = default);
}

public sealed class DirectoryVerificationSyncService(
    IApplicationDbContext db,
    IFacilityProvisioningPublisher provisioningPublisher,
    IInteropPublisher interopPublisher) : IDirectoryVerificationSyncService
{
    public async Task<DirectoryVerificationResyncResult> ResyncVerifiedDirectoryAsync(CancellationToken ct = default)
    {
        var verifiedFacilities = await db.Facilities
            .Include(f => f.Tenant)
            .Include(f => f.Branch)
            .Where(f => !f.IsDeleted
                        && !f.Tenant.IsDeleted
                        && f.Tenant.ArchivedAt == null
                        && f.Status == FacilityStatus.Active
                        && f.PlatformVerificationStatus == PlatformVerificationStatus.Verified)
            .ToListAsync(ct);

        foreach (var facility in verifiedFacilities)
        {
            await provisioningPublisher.StageDirectoryUpdateAsync(facility.Tenant, facility, ct);
        }

        var activeVerifiedAffiliations = await db.PractitionerAffiliations
            .AsNoTracking()
            .Include(a => a.Practitioner)
            .Include(a => a.Facility)
                .ThenInclude(f => f.Tenant)
            .Where(a => !a.IsDeleted
                        && a.AffiliationStatus == "Active"
                        && !a.Practitioner.IsDeleted
                        && a.Practitioner.MergedIntoPractitionerId == null
                        && a.Practitioner.VerificationStatus == PractitionerVerificationLevel.Verified
                        && !a.Facility.IsDeleted
                        && !a.Facility.Tenant.IsDeleted
                        && a.Facility.Tenant.ArchivedAt == null
                        && a.Facility.Status == FacilityStatus.Active)
            .ToListAsync(ct);

        foreach (var affiliation in activeVerifiedAffiliations)
        {
            DirectoryVerificationHelper.StagePractitionerIdentityUpdated(
                interopPublisher,
                affiliation.Practitioner,
                affiliation,
                affiliation.Facility,
                affiliation.Id);
        }

        if (verifiedFacilities.Count > 0 || activeVerifiedAffiliations.Count > 0)
        {
            await db.SaveChangesAsync(ct);
        }

        return new DirectoryVerificationResyncResult(
            verifiedFacilities.Count,
            activeVerifiedAffiliations.Count);
    }
}
