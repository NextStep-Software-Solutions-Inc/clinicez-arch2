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

public sealed record ResolvedWorkspace(ClinicSettings Settings, string TenantId, Guid ClinicId);

public interface IWorkspaceResolver
{
    /// <summary>
    /// Resolves the activated clinic for a workspace identifier (tenant slug/id or facility slug/id).
    /// With no identifier (single-clinic / on-prem installs) it resolves the configured or only activated clinic.
    /// Works with no internet: the portal HTTP lookup is only a best-effort enhancement for SaaS.
    /// </summary>
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

    public async Task<ResolvedWorkspace?> ResolveAsync(string? workspace, CancellationToken ct = default)
    {
        var all = _db.ClinicSettings.IgnoreQueryFilters().AsNoTracking().Where(s => !s.IsDeleted);
        ClinicSettings? settings = null;
        var ws = workspace?.Trim();

        if (!string.IsNullOrEmpty(ws) && !string.Equals(ws, "tenant_default", StringComparison.OrdinalIgnoreCase))
        {
            TenantLookupDto? tenant = null;
            try
            {
                tenant = await _tenantLookup.LookupAsync(ws, ct);
            }
            catch (Exception ex)
            {
                // Offline/LAN: the shared portal tables and portal-api are not reachable. Fall back to local settings only.
                _logger.LogDebug(ex, "[Workspace] Tenant lookup unavailable for '{Workspace}'; using local settings.", ws);
            }

            var lower = ws.ToLowerInvariant();
            if (tenant?.FacilityId is { } facilityId)
            {
                settings = await all.FirstOrDefaultAsync(s => s.ClinicId == facilityId, ct);
            }

            if (settings is null)
            {
                var tenantGuid = tenant?.Id.ToString().ToLowerInvariant();
                var tenantSlug = tenant?.Slug?.ToLowerInvariant();
                var matches = await all
                    .Where(s => s.TenantId.ToLower() == lower
                                || (tenantGuid != null && s.TenantId.ToLower() == tenantGuid)
                                || (tenantSlug != null && s.TenantId.ToLower() == tenantSlug))
                    .Take(2)
                    .ToListAsync(ct);
                // Ambiguous (a tenant with several clinics and no facility slug) is treated as not found.
                settings = matches.Count == 1 ? matches[0] : null;
            }
        }
        else
        {
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
        }

        return settings is null ? null : new ResolvedWorkspace(settings, settings.TenantId, settings.ClinicId);
    }
}
