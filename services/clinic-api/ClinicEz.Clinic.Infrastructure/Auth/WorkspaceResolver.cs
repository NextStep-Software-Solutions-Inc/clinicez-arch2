using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Licensing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Auth;

public sealed record ResolvedWorkspace(FacilitySettings Settings, string TenantId, Guid ClinicId);

public interface IWorkspaceResolver
{
    Task<ResolvedWorkspace?> ResolveFacilityAsync(string facilitySlug, CancellationToken ct = default);
    Task<ResolvedWorkspace?> ResolveTenantAsync(string tenantSlug, CancellationToken ct = default);
    Task<ResolvedWorkspace?> ResolveAsync(string? workspace, CancellationToken ct = default);
}

public sealed class WorkspaceResolver : IWorkspaceResolver
{
    private static readonly Guid LegacyDefaultClinicId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    private readonly ApplicationDbContext _db;
    private readonly ITenantLookupService _tenantLookup;
    private readonly IConfiguration _configuration;
    private readonly ILogger<WorkspaceResolver> _logger;

    public WorkspaceResolver(
        ApplicationDbContext db,
        ITenantLookupService tenantLookup,
        IConfiguration configuration,
        ILogger<WorkspaceResolver> logger)
    {
        _db = db;
        _tenantLookup = tenantLookup;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<ResolvedWorkspace?> ResolveFacilityAsync(string facilitySlug, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(facilitySlug)) return null;
        var clean = facilitySlug.Trim().ToLowerInvariant();
        var all = _db.Settings.IgnoreQueryFilters().AsNoTracking().Where(s => !s.IsDeleted);

        var isGuid = Guid.TryParse(facilitySlug, out var facGuid);
        if (isGuid && facGuid != Guid.Empty && facGuid != LegacyDefaultClinicId)
        {
            var byGuid = await all.FirstOrDefaultAsync(s => s.ClinicId == facGuid, ct);
            if (byGuid != null) return new ResolvedWorkspace(byGuid, byGuid.TenantId, byGuid.ClinicId);
        }

        TenantLookupDto? facility = null;
        try
        {
            facility = await _tenantLookup.LookupFacilityAsync(clean, ct);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "[Workspace] Facility lookup unavailable for '{Slug}'; using local settings.", clean);
        }

        if (facility?.FacilityId is { } facilityId && facilityId != Guid.Empty)
        {
            var settings = await all.FirstOrDefaultAsync(s => s.ClinicId == facilityId, ct);
            if (settings != null) return new ResolvedWorkspace(settings, settings.TenantId, settings.ClinicId);
        }

        return null;
    }

    public async Task<ResolvedWorkspace?> ResolveTenantAsync(string tenantSlug, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(tenantSlug) || string.Equals(tenantSlug, "tenant_default", StringComparison.OrdinalIgnoreCase))
            return null;

        var clean = tenantSlug.Trim().ToLowerInvariant();
        var all = _db.Settings.IgnoreQueryFilters().AsNoTracking().Where(s => !s.IsDeleted);

        TenantLookupDto? tenant = null;
        try
        {
            tenant = await _tenantLookup.LookupTenantAsync(clean, ct);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "[Workspace] Tenant lookup unavailable for '{Slug}'; using local settings.", clean);
        }

        var tenantGuid = tenant?.Id.ToString().ToLowerInvariant();
        var tSlug = tenant?.Slug?.ToLowerInvariant();

        var matches = await all
            .Where(s => s.TenantId.ToLower() == clean
                        || (tenantGuid != null && s.TenantId.ToLower() == tenantGuid)
                        || (tSlug != null && s.TenantId.ToLower() == tSlug))
            .Take(2)
            .ToListAsync(ct);

        var settings = matches.Count == 1 ? matches[0] : null;
        return settings != null ? new ResolvedWorkspace(settings, settings.TenantId, settings.ClinicId) : null;
    }

    public async Task<ResolvedWorkspace?> ResolveAsync(string? workspace, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(workspace) || string.Equals(workspace, "tenant_default", StringComparison.OrdinalIgnoreCase))
        {
            var all = _db.Settings.IgnoreQueryFilters().AsNoTracking().Where(s => !s.IsDeleted);
            FacilitySettings? settings = null;
            if (Guid.TryParse(_configuration["ClinicSettings:ClinicId"], out var configured) &&
                configured != Guid.Empty && configured != LegacyDefaultClinicId)
            {
                settings = await all.FirstOrDefaultAsync(s => s.ClinicId == configured, ct);
            }

            if (settings is null)
            {
                var only = await all.Take(2).ToListAsync(ct);
                settings = only.Count == 1 ? only[0] : null;
            }

            return settings is null ? null : new ResolvedWorkspace(settings, settings.TenantId, settings.ClinicId);
        }

        return await ResolveFacilityAsync(workspace, ct) ?? await ResolveTenantAsync(workspace, ct);
    }
}
