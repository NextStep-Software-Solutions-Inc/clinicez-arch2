using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Pharmacy.Infrastructure.Auth;

public sealed record ResolvedWorkspace(PharmacySettings Settings, string TenantId, Guid PharmacyId);

public interface IWorkspaceResolver
{
    /// <summary>
    /// Resolves the activated pharmacy for a workspace identifier (tenant id/slug or pharmacy id).
    /// With no identifier (single-pharmacy / on-prem installs) it resolves the configured or only activated pharmacy.
    /// Purely local: reads the pharmacy database only, so it works with no internet.
    /// </summary>
    Task<ResolvedWorkspace?> ResolveAsync(string? workspace, CancellationToken ct = default);
}

public sealed class WorkspaceResolver : IWorkspaceResolver
{
    private readonly ApplicationDbContext _db;
    private readonly IConfiguration _configuration;

    public WorkspaceResolver(ApplicationDbContext db, IConfiguration configuration)
    {
        _db = db;
        _configuration = configuration;
    }

    public async Task<ResolvedWorkspace?> ResolveAsync(string? workspace, CancellationToken ct = default)
    {
        var all = _db.PharmacySettings.IgnoreQueryFilters().AsNoTracking().Where(s => !s.IsDeleted);
        PharmacySettings? settings = null;
        var ws = workspace?.Trim();

        if (!string.IsNullOrEmpty(ws) && !string.Equals(ws, "default", StringComparison.OrdinalIgnoreCase))
        {
            var lower = ws.ToLowerInvariant();
            var asGuid = Guid.TryParse(ws, out var pharmacyGuid) ? pharmacyGuid : Guid.Empty;
            var matches = await all
                .Where(s => s.TenantId.ToLower() == lower || (asGuid != Guid.Empty && s.PharmacyId == asGuid))
                .Take(2)
                .ToListAsync(ct);
            // Ambiguous (a tenant with several pharmacies and no facility id) is treated as not found.
            settings = matches.Count == 1 ? matches[0] : null;
        }
        else
        {
            if (Guid.TryParse(_configuration["PharmacySettings:PharmacyId"], out var configured) && configured != Guid.Empty)
            {
                settings = await all.FirstOrDefaultAsync(s => s.PharmacyId == configured, ct);
            }

            if (settings is null)
            {
                var only = await all.Take(2).ToListAsync(ct);
                settings = only.Count == 1 ? only[0] : null;
            }
        }

        return settings is null ? null : new ResolvedWorkspace(settings, settings.TenantId, settings.PharmacyId);
    }
}