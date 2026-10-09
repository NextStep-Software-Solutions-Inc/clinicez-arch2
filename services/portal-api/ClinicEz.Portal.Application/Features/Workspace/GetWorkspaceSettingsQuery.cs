using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Workspace;

/// <summary>Identity, contacts and locale defaults of the workspace.</summary>
public record WorkspaceGeneralDto(
    string Name,
    string? RepresentativeName,
    string Email,
    string? PhoneNumber,
    string TimeZoneId,
    string Locale,
    string DateFormat,
    string CurrencyCode
);

/// <summary>Brand identity override. Null values mean "not customised" (inherit defaults).</summary>
public record WorkspaceBrandingDto(string? BrandName, string? LogoUrl, string? AccentColorHex);

/// <summary>
/// Full workspace settings, grouped by section so later sections (security, ...) are added
/// as new properties without reshaping existing ones.
/// </summary>
public record WorkspaceSettingsDto(
    string TenantSlug,
    string TenantType,
    WorkspaceGeneralDto General,
    WorkspaceBrandingDto Branding
);

public record GetWorkspaceSettingsQuery(string TenantSlug) : IRequest<WorkspaceSettingsDto?>;

public class GetWorkspaceSettingsQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetWorkspaceSettingsQuery, WorkspaceSettingsDto?>
{
    public async Task<WorkspaceSettingsDto?> Handle(GetWorkspaceSettingsQuery request, CancellationToken cancellationToken)
    {
        var key = request.TenantSlug.Trim().ToLowerInvariant();
        var tenant = await context.Tenants
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == key || t.Id.ToString() == key, cancellationToken);

        if (tenant == null) return null;

        // Read-only: when no row exists yet, defaults are returned without persisting anything.
        var settings = await context.WorkspaceSettings
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.TenantId == tenant.Id, cancellationToken)
            ?? new WorkspaceSettings { TenantId = tenant.Id };

        return WorkspaceSettingsMapper.ToDto(tenant, settings);
    }
}

internal static class WorkspaceSettingsMapper
{
    public static WorkspaceSettingsDto ToDto(Tenant tenant, WorkspaceSettings settings) => new(
        tenant.TenantSlug,
        tenant.TenantType,
        ToGeneral(tenant, settings),
        ToBranding(settings));

    public static WorkspaceBrandingDto ToBranding(WorkspaceSettings settings) =>
        new(settings.BrandName, settings.LogoUrl, settings.AccentColorHex);

    public static WorkspaceGeneralDto ToGeneral(Tenant tenant, WorkspaceSettings settings)
    {
        var representative = $"{tenant.FirstName} {tenant.LastName}".Trim();
        return new WorkspaceGeneralDto(
            tenant.Name,
            string.IsNullOrEmpty(representative) ? null : representative,
            tenant.Email,
            tenant.PhoneNumber,
            settings.TimeZoneId,
            settings.Locale,
            settings.DateFormat,
            settings.CurrencyCode);
    }
}
