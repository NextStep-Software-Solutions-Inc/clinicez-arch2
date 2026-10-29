using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop.Facility;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Infrastructure.Services;

/// <summary>
/// Clinic side of the shared entitlement machinery, on <c>ClinicSettings</c>. Looks clinics up by explicit tenant AND clinic id
/// with the ambient clinic filter bypassed, because it runs inside message handlers and background jobs where no request scope
/// exists. A clinic of the same tenant is never touched by a license meant for another one.
/// </summary>
public sealed class ClinicLicenseStore : IFacilityLicenseStore, IFacilityRegistry
{
    private readonly ApplicationDbContext _db;

    public ClinicLicenseStore(ApplicationDbContext db)
    {
        _db = db;
    }

    public async Task<HeldFacilityLicense?> GetAsync(string tenantId, Guid facilityId, CancellationToken ct)
    {
        var settings = await _db.Settings.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(s => s.TenantId == tenantId && s.ClinicId == facilityId && !s.IsDeleted, ct);

        return settings is null ? null : new HeldFacilityLicense(settings.LicenseToken, settings.EntitlementVersion);
    }

    public async Task SaveAsync(string tenantId, Guid facilityId, FacilityLicenseUpdate update, CancellationToken ct)
    {
        var settings = await _db.Settings.IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.TenantId == tenantId && s.ClinicId == facilityId && !s.IsDeleted, ct)
            ?? throw new InvalidOperationException($"Clinic {facilityId} of tenant {tenantId} is not provisioned.");

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
        await _db.Settings.IgnoreQueryFilters().AsNoTracking()
            .Where(s => !s.IsDeleted)
            .Select(s => new FacilityRegistryEntry(s.TenantId, s.ClinicId, FacilityType.Clinic, s.LicenseExpiresAt, s.IsWorkspaceEligible))
            .ToListAsync(ct);
}
