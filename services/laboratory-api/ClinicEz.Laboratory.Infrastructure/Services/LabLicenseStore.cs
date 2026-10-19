using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Laboratory.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop.Facility;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Laboratory.Infrastructure.Services;

/// <summary>
/// Laboratory side of the shared entitlement machinery, on <c>LabSettings</c>. Looks laboratories up by explicit tenant AND
/// laboratory id with the ambient scope filter bypassed, because it runs inside message handlers and background jobs where no
/// request scope exists; writes enter the facility scope of exactly that laboratory so the save guard still applies.
/// </summary>
public sealed class LabLicenseStore : IFacilityLicenseStore, IFacilityRegistry
{
    private readonly ApplicationDbContext _db;
    private readonly ILabContext _labContext;

    public LabLicenseStore(ApplicationDbContext db, ILabContext labContext)
    {
        _db = db;
        _labContext = labContext;
    }

    public async Task<HeldFacilityLicense?> GetAsync(string tenantId, Guid facilityId, CancellationToken ct)
    {
        var settings = await _db.LabSettings.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(s => s.TenantId == tenantId && s.LaboratoryId == facilityId && !s.IsDeleted, ct);

        return settings is null ? null : new HeldFacilityLicense(settings.LicenseToken, settings.EntitlementVersion);
    }

    public async Task SaveAsync(string tenantId, Guid facilityId, FacilityLicenseUpdate update, CancellationToken ct)
    {
        var settings = await _db.LabSettings.IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.TenantId == tenantId && s.LaboratoryId == facilityId && !s.IsDeleted, ct)
            ?? throw new InvalidOperationException($"Laboratory {facilityId} of tenant {tenantId} is not provisioned.");

        settings.LicenseToken = update.LicenseToken;
        settings.EntitlementVersion = update.License.EntitlementVersion;
        settings.PlanTier = update.License.PlanTier;
        settings.MaxStaffLimit = update.License.Limits.MaxStaff;
        settings.MaxAnalyzersLimit = update.License.Limits.MaxAnalyzers;
        settings.LicenseExpiresAt = update.License.ExpiresAtUtc;
        settings.UpdatedAt = DateTime.UtcNow;
        settings.UpdatedBy = "SystemEntitlements";

        using var facility = _labContext.BeginFacilityScope(tenantId, facilityId);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<FacilityRegistryEntry>> ListAsync(CancellationToken ct) =>
        await _db.LabSettings.IgnoreQueryFilters().AsNoTracking()
            .Where(s => !s.IsDeleted)
            .Select(s => new FacilityRegistryEntry(s.TenantId, s.LaboratoryId, FacilityType.Laboratory, s.LicenseExpiresAt))
            .ToListAsync(ct);
}
