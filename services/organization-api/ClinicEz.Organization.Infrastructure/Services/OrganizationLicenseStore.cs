using ClinicEz.Organization.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop.Facility;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Organization.Infrastructure.Services;

/// <summary>
/// Organization side of the shared entitlement machinery, on <c>OrganizationFacilities</c>. Facilities are addressed by
/// explicit tenant and facility id, because this runs inside message handlers and background jobs where there is no
/// ambient request scope.
/// </summary>
public sealed class OrganizationLicenseStore : IFacilityLicenseStore, IFacilityRegistry
{
    private readonly ApplicationDbContext _db;

    public OrganizationLicenseStore(ApplicationDbContext db) => _db = db;

    public async Task<HeldFacilityLicense?> GetAsync(string tenantId, Guid facilityId, CancellationToken ct)
    {
        var facility = await _db.OrganizationFacilities.AsNoTracking()
            .FirstOrDefaultAsync(f => f.TenantId == tenantId && f.FacilityId == facilityId && !f.IsDeleted, ct);

        return facility is null ? null : new HeldFacilityLicense(facility.LicenseToken, facility.EntitlementVersion);
    }

    public async Task SaveAsync(string tenantId, Guid facilityId, FacilityLicenseUpdate update, CancellationToken ct)
    {
        var facility = await _db.OrganizationFacilities
            .FirstOrDefaultAsync(f => f.TenantId == tenantId && f.FacilityId == facilityId && !f.IsDeleted, ct)
            ?? throw new InvalidOperationException($"Organization {facilityId} of tenant {tenantId} is not provisioned.");

        facility.LicenseToken = update.LicenseToken;
        facility.EntitlementVersion = update.License.EntitlementVersion;
        facility.PlanTier = update.License.PlanTier;
        facility.LicenseExpiresAt = update.License.ExpiresAtUtc;
        facility.UpdatedAt = DateTime.UtcNow;
        facility.UpdatedBy = "SystemEntitlements";

        await _db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<FacilityRegistryEntry>> ListAsync(CancellationToken ct) =>
        await _db.OrganizationFacilities.AsNoTracking()
            .Where(f => !f.IsDeleted)
            .Select(f => new FacilityRegistryEntry(f.TenantId, f.FacilityId, FacilityType.Organization, f.LicenseExpiresAt))
            .ToListAsync(ct);
}
