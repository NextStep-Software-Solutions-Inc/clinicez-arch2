using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Infrastructure.Services;

/// <summary>
/// Resolves workspaces (tenant + facility slugs) from the clinics this server was provisioned for. The control plane
/// announces slugs through the interop hub when it provisions a facility, so the lookup needs neither the portal
/// database nor an HTTP call to the portal.
/// </summary>
public class TenantLookupService : ITenantLookupService
{
    private readonly ApplicationDbContext _dbContext;

    public TenantLookupService(ApplicationDbContext dbContext) => _dbContext = dbContext;

    public async Task<TenantLookupDto?> LookupFacilityAsync(string facilityIdentifier, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(facilityIdentifier)) return null;

        var clean = facilityIdentifier.Trim().ToLowerInvariant();
        var query = Clinics();
        var settings = Guid.TryParse(clean, out var facilityId)
            ? await query.FirstOrDefaultAsync(s => s.ClinicId == facilityId, ct)
            : await query.FirstOrDefaultAsync(s => s.FacilitySlug != null && s.FacilitySlug.ToLower() == clean, ct);

        return settings == null ? null : ToDto(settings, includeFacility: true);
    }

    public async Task<TenantLookupDto?> LookupTenantAsync(string tenantIdentifier, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(tenantIdentifier) ||
            string.Equals(tenantIdentifier, "tenant_default", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var clean = tenantIdentifier.Trim().ToLowerInvariant();
        var settings = await Clinics().FirstOrDefaultAsync(
            s => s.TenantId.ToLower() == clean || (s.TenantSlug != null && s.TenantSlug.ToLower() == clean), ct);

        return settings == null ? null : ToDto(settings, includeFacility: false);
    }

    public async Task<TenantLookupDto?> LookupAsync(string identifier, CancellationToken ct = default)
    {
        return await LookupFacilityAsync(identifier, ct) ?? await LookupTenantAsync(identifier, ct);
    }

    private IQueryable<FacilitySettings> Clinics() =>
        _dbContext.Settings
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(s => !s.IsDeleted)
            .OrderBy(s => s.CreatedAt);

    private static TenantLookupDto ToDto(FacilitySettings settings, bool includeFacility)
    {
        var tenantId = Guid.TryParse(settings.TenantId, out var parsed) ? parsed : Guid.Empty;
        var tenantSlug = settings.TenantSlug ?? settings.TenantId;

        return includeFacility
            ? new TenantLookupDto(tenantId, tenantSlug, settings.ClinicName, settings.ClinicId, settings.FacilitySlug)
            : new TenantLookupDto(tenantId, tenantSlug, settings.ClinicName);
    }
}
