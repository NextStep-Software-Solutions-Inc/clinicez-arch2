using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Laboratory.Infrastructure.Auth;

public sealed record ResolvedWorkspace(LabSettings Settings, string TenantId, Guid LaboratoryId);

public interface IWorkspaceResolver
{
    /// <summary>
    /// Resolves the activated laboratory for a workspace identifier (tenant id or laboratory id).
    /// With no identifier (single-laboratory / on-prem installs) it resolves the configured or only activated laboratory.
    /// Purely local: needs no internet and no portal lookup.
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
        var all = _db.LabSettings.IgnoreQueryFilters().AsNoTracking().Where(s => !s.IsDeleted);
        LabSettings? settings = null;
        var ws = workspace?.Trim();

        if (!string.IsNullOrEmpty(ws) && !string.Equals(ws, "tenant_default", StringComparison.OrdinalIgnoreCase))
        {
            var lower = ws.ToLowerInvariant();
            var hasGuid = Guid.TryParse(ws, out var wsGuid);
            var matches = await all
                .Where(s => s.TenantId.ToLower() == lower || (hasGuid && s.LaboratoryId == wsGuid))
                .Take(2)
                .ToListAsync(ct);
            // Ambiguous (a tenant with several laboratories) is treated as not found.
            settings = matches.Count == 1 ? matches[0] : null;

            if (settings is null && matches.Count == 0)
            {
                // The portal's tenant slug is not known offline. On a single-laboratory install the hint is irrelevant:
                // credentials are still verified against the only laboratory's own user store.
                var only = await all.Take(2).ToListAsync(ct);
                settings = only.Count == 1 ? only[0] : null;
            }
        }
        else
        {
            if (Guid.TryParse(_configuration["LaboratorySettings:LaboratoryId"], out var configured) && configured != Guid.Empty)
            {
                settings = await all.FirstOrDefaultAsync(s => s.LaboratoryId == configured, ct);
            }

            if (settings is null)
            {
                var only = await all.Take(2).ToListAsync(ct);
                settings = only.Count == 1 ? only[0] : null;
            }
        }

        return settings is null ? null : new ResolvedWorkspace(settings, settings.TenantId, settings.LaboratoryId);
    }
}
