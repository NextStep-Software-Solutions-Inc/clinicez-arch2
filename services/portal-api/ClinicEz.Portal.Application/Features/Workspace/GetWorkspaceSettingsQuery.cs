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

/// <summary>Portal sign-in policy. 0 idle timeout = disabled; empty domain list = any domain may be invited.</summary>
public record WorkspaceSecurityDto(bool RequireMfa, int IdleTimeoutMinutes, IReadOnlyList<string> AllowedInviteDomains);

/// <summary>Data Protection Officer and public privacy notice (RA 10173).</summary>
public record WorkspaceComplianceDto(string? DpoName, string? DpoEmail, string? PrivacyNoticeUrl);

/// <summary>
/// Full workspace settings, grouped by section so later sections (security, ...) are added
/// as new properties without reshaping existing ones.
/// </summary>
public record WorkspaceSettingsDto(
    string TenantSlug,
    string TenantType,
    WorkspaceGeneralDto General,
    WorkspaceBrandingDto Branding,
    WorkspaceSecurityDto Security,
    WorkspaceComplianceDto Compliance
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
        ToBranding(settings),
        ToSecurity(settings),
        ToCompliance(settings));

    public static WorkspaceBrandingDto ToBranding(WorkspaceSettings settings) =>
        new(settings.BrandName, settings.LogoUrl, settings.AccentColorHex);

    public static WorkspaceSecurityDto ToSecurity(WorkspaceSettings settings) =>
        new(settings.RequireMfa, settings.IdleTimeoutMinutes, InviteDomains.Parse(settings.AllowedInviteDomains));

    public static WorkspaceComplianceDto ToCompliance(WorkspaceSettings settings) =>
        new(settings.DpoName, settings.DpoEmail, settings.PrivacyNoticeUrl);

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
