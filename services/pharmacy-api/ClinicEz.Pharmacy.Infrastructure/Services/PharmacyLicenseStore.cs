using ClinicEz.Pharmacy.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop.Facility;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Pharmacy.Infrastructure.Services;

/// <summary>
/// Pharmacy side of the shared entitlement machinery, on <c>PharmacySettings</c>. Looks pharmacies up by explicit tenant and
/// pharmacy id with the scope filter bypassed, because it runs inside message handlers and background jobs before any
/// pharmacy scope has been entered.
/// </summary>
public sealed class PharmacyLicenseStore : IFacilityLicenseStore, IFacilityRegistry
{
    private readonly ApplicationDbContext _db;

    public PharmacyLicenseStore(ApplicationDbContext db) => _db = db;

    public async Task<HeldFacilityLicense?> GetAsync(string tenantId, Guid facilityId, CancellationToken ct)
    {
        var settings = await _db.PharmacySettings.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(s => s.TenantId == tenantId && s.PharmacyId == facilityId && !s.IsDeleted, ct);

        return settings is null ? null : new HeldFacilityLicense(settings.LicenseToken, settings.EntitlementVersion);
    }

    public async Task SaveAsync(string tenantId, Guid facilityId, FacilityLicenseUpdate update, CancellationToken ct)
    {
        var settings = await _db.PharmacySettings.IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.TenantId == tenantId && s.PharmacyId == facilityId && !s.IsDeleted, ct)
            ?? throw new InvalidOperationException($"Pharmacy {facilityId} of tenant {tenantId} is not provisioned.");

        settings.LicenseToken = update.LicenseToken;
        settings.EntitlementVersion = update.License.EntitlementVersion;
        settings.PlanTier = update.License.PlanTier;
        settings.MaxStaffLimit = update.License.Limits.MaxStaff;
        settings.LicenseExpiresAt = update.License.ExpiresAtUtc;
        settings.UpdatedAt = DateTime.UtcNow;
        settings.UpdatedBy = "SystemEntitlements";

        await _db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<FacilityRegistryEntry>> ListAsync(CancellationToken ct) =>
        await _db.PharmacySettings.IgnoreQueryFilters().AsNoTracking()
            .Where(s => !s.IsDeleted)
            .Select(s => new FacilityRegistryEntry(s.TenantId, s.PharmacyId, FacilityType.Pharmacy, s.LicenseExpiresAt))
            .ToListAsync(ct);
}
