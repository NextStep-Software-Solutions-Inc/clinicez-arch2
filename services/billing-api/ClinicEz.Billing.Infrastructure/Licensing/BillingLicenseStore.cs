using ClinicEz.Billing.Infrastructure.Persistence;
using ClinicEz.Shared.Interop.Facility;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Billing.Infrastructure.Licensing;

/// <summary>
/// Billing's side of the shared entitlement machinery, on <c>BillingFacility</c>. Facility ids are the strings facilities send; the
/// shared machinery speaks Guids, so a facility is matched by the Guid's text, ignoring case. It looks facilities up by explicit
/// tenant and facility id with the tenant filter bypassed, because it runs inside message handlers and background jobs where no
/// request scope exists. Only facilities holding a license are gated and heartbeated: a facility billing merely learned about from an
/// invoice request has no license to enforce.
/// </summary>
public sealed class BillingLicenseStore : IFacilityLicenseStore, IFacilityRegistry
{
    private readonly ApplicationDbContext _db;

    public BillingLicenseStore(ApplicationDbContext db) => _db = db;

    public async Task<HeldFacilityLicense?> GetAsync(string tenantId, Guid facilityId, CancellationToken ct)
    {
        var id = facilityId.ToString();
        var facility = await _db.BillingFacilities.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(f => f.TenantId == tenantId && f.FacilityId.ToLower() == id, ct);

        return facility is null ? null : new HeldFacilityLicense(facility.LicenseToken, facility.EntitlementVersion);
    }

    public async Task SaveAsync(string tenantId, Guid facilityId, FacilityLicenseUpdate update, CancellationToken ct)
    {
        var id = facilityId.ToString();
        var facility = await _db.BillingFacilities.IgnoreQueryFilters()
            .FirstOrDefaultAsync(f => f.TenantId == tenantId && f.FacilityId.ToLower() == id, ct)
            ?? throw new InvalidOperationException($"Facility {facilityId} of tenant {tenantId} is not known to billing.");

        facility.LicenseToken = update.LicenseToken;
        facility.EntitlementVersion = update.License.EntitlementVersion;
        facility.PlanTier = update.License.PlanTier;
        facility.LicenseExpiresAt = update.License.ExpiresAtUtc;

        await _db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<FacilityRegistryEntry>> ListAsync(CancellationToken ct)
    {
        var licensed = await _db.BillingFacilities.IgnoreQueryFilters().AsNoTracking()
            .Where(f => f.LicenseToken != null)
            .ToListAsync(ct);

        return licensed
            .Where(f => Guid.TryParse(f.FacilityId, out _))
            .Select(f => new FacilityRegistryEntry(f.TenantId, Guid.Parse(f.FacilityId), f.FacilityType, f.LicenseExpiresAt))
            .ToList();
    }
}
