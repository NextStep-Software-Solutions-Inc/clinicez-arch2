using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Workspace;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Workspace;

public record GetWorkspaceProfileQuery(string TenantSlug) : IRequest<WorkspaceProfile?>;

/// <summary>
/// Projects a workspace onto the identity every facility inherits: brand (name/logo/accent), regional defaults and the
/// DPO / privacy notice. Deliberately contains no workspace contact details or anything private - it is served
/// anonymously and pushed to facility services (which may be on another server, cloud or on-prem). The DPO and
/// privacy notice are published to data subjects by design (RA 10173).
/// </summary>
public static class WorkspaceProfileMapper
{
    /// <summary>The <c>workspace.profile.updated</c> payload: the notification and the complete profile at the same version.</summary>
    public static WorkspaceProfileUpdatedEvent ToEvent(Tenant tenant, WorkspaceSettings settings) => new()
    {
        TenantId = tenant.Id.ToString(),
        TenantSlug = tenant.TenantSlug,
        Version = settings.ProfileVersion,
        Profile = From(tenant, settings)
    };

    public static WorkspaceProfile From(Tenant tenant, WorkspaceSettings settings) => new(
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
    : IRequestHandler<GetWorkspaceProfileQuery, WorkspaceProfile?>
{
    public async Task<WorkspaceProfile?> Handle(GetWorkspaceProfileQuery request, CancellationToken cancellationToken)
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
