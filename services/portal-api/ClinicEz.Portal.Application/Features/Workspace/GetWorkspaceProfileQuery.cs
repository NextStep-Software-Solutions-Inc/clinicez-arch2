using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Workspace;

/// <summary>
/// The workspace-level identity every facility inherits: brand (name/logo/accent), regional defaults and the
/// DPO / privacy notice. Deliberately contains no workspace contact details or anything private - it is served
/// anonymously and cached by facility services (which may be on another server, cloud or on-prem). The DPO and
/// privacy notice are published to data subjects by design (RA 10173).
/// </summary>
public record WorkspaceProfileDto(
    string TenantSlug,
    long Version,
    string DisplayName,
    string? LogoUrl,
    string? AccentColorHex,
    string TimeZoneId,
    string Locale,
    string DateFormat,
    string CurrencyCode,
    string? DpoName,
    string? DpoEmail,
    string? PrivacyNoticeUrl
);

public record GetWorkspaceProfileQuery(string TenantSlug) : IRequest<WorkspaceProfileDto?>;

public static class WorkspaceProfileMapper
{
    public static WorkspaceProfileDto From(Tenant tenant, WorkspaceSettings settings) => new(
        tenant.TenantSlug,
        settings.ProfileVersion,
        settings.BrandName ?? tenant.Name,
        settings.LogoUrl,
        settings.AccentColorHex,
        settings.TimeZoneId,
        settings.Locale,
        settings.DateFormat,
        settings.CurrencyCode,
        settings.DpoName,
        settings.DpoEmail,
        settings.PrivacyNoticeUrl);
}

public class GetWorkspaceProfileQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetWorkspaceProfileQuery, WorkspaceProfileDto?>
{
    public async Task<WorkspaceProfileDto?> Handle(GetWorkspaceProfileQuery request, CancellationToken cancellationToken)
    {
        var key = request.TenantSlug.Trim().ToLowerInvariant();
        var tenant = await context.Tenants
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == key || t.Id.ToString() == key, cancellationToken);
        if (tenant == null) return null;

        var settings = await context.WorkspaceSettings
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.TenantId == tenant.Id, cancellationToken)
            ?? new WorkspaceSettings { TenantId = tenant.Id };

        return WorkspaceProfileMapper.From(tenant, settings);
    }
}
