using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Portal.Domain.Entities;
using MediatR;
using System;
using System.Collections.Generic;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Api.Endpoints;

/// <summary>Body of PUT /tenants/{slug}/settings/general. The whole section is replaced.</summary>
public record UpdateWorkspaceGeneralRequest(
    string Name,
    string? RepresentativeName,
    string Email,
    string? PhoneNumber,
    string TimeZoneId,
    string Locale,
    string DateFormat,
    string CurrencyCode);

/// <summary>Body of PUT /tenants/{slug}/settings/branding. The whole section is replaced.</summary>
public record UpdateWorkspaceBrandingRequest(string? BrandName, string? LogoUrl, string? AccentColorHex);

/// <summary>Body of PUT /tenants/{slug}/settings/security. The whole section is replaced.</summary>
public record UpdateWorkspaceSecurityRequest(bool RequireMfa, int IdleTimeoutMinutes, List<string>? AllowedInviteDomains);

/// <summary>Body of PUT /tenants/{slug}/settings/compliance. The whole section is replaced.</summary>
public record UpdateWorkspaceComplianceRequest(string? DpoName, string? DpoEmail, string? PrivacyNoticeUrl);

/// <summary>Body of PUT /tenants/{slug}/facilities/{facilityId}/deployment.</summary>
public record UpdateFacilityDeploymentRequest(FacilityDeploymentMode DeploymentMode, string? ConsoleBaseUrl);

/// <summary>Workspace (tenant-wide) settings. Facility-specific configuration is owned by each facility service.</summary>
public class TenantSettingsEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/tenants/{tenantSlug}/settings")
            .RequireAuthorization()
            .WithTags("Workspace Settings");

        group.MapGet("", async (
            string tenantSlug,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            ISender sender,
            CancellationToken ct) =>
        {
            var denied = await Authorize(access, httpContext, tenantSlug, WorkspaceRole.Admin, ct);
            if (denied.Result != null) return denied.Result;

            var settings = await sender.Send(new GetWorkspaceSettingsQuery(denied.Access!.Tenant.TenantSlug), ct);
            return settings is null ? Results.NotFound(new { Message = "Workspace not found." }) : Results.Ok(settings);
        })
        .WithName("GetWorkspaceSettings")
        .WithDescription("Returns the workspace settings (general identity, contacts and locale defaults).");

        group.MapPut("/general", async (
            string tenantSlug,
            UpdateWorkspaceGeneralRequest body,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            ISender sender,
            CancellationToken ct) =>
        {
            var denied = await Authorize(access, httpContext, tenantSlug, WorkspaceRole.Admin, ct);
            if (denied.Result != null) return denied.Result;

            var result = await sender.Send(new UpdateWorkspaceGeneralCommand(
                denied.Access!.Tenant.TenantSlug,
                Actor(httpContext, denied.Access),
                body.Name,
                body.RepresentativeName,
                body.Email,
                body.PhoneNumber,
                body.TimeZoneId,
                body.Locale,
                body.DateFormat,
                body.CurrencyCode), ct);

            return Results.Ok(result);
        })
        .WithName("UpdateWorkspaceGeneralSettings")
        .WithDescription("Replaces the general section: workspace name, representative, contact email/phone and locale defaults.");

        group.MapPut("/branding", async (
            string tenantSlug,
            UpdateWorkspaceBrandingRequest body,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            ISender sender,
            CancellationToken ct) =>
        {
            var denied = await Authorize(access, httpContext, tenantSlug, WorkspaceRole.Admin, ct);
            if (denied.Result != null) return denied.Result;

            var result = await sender.Send(new UpdateWorkspaceBrandingCommand(
                denied.Access!.Tenant.TenantSlug,
                Actor(httpContext, denied.Access),
                body.BrandName,
                body.LogoUrl,
                body.AccentColorHex), ct);

            return Results.Ok(result);
        })
        .WithName("UpdateWorkspaceBrandingSettings")
        .WithDescription("Replaces the brand identity (display name, https logo URL, accent color) that facilities inherit.");

        group.MapPut("/security", async (
            string tenantSlug,
            UpdateWorkspaceSecurityRequest body,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            ISender sender,
            CancellationToken ct) =>
        {
            var denied = await Authorize(access, httpContext, tenantSlug, WorkspaceRole.Admin, ct);
            if (denied.Result != null) return denied.Result;

            var result = await sender.Send(new UpdateWorkspaceSecurityCommand(
                denied.Access!.Tenant.TenantSlug,
                Actor(httpContext, denied.Access),
                body.RequireMfa,
                body.IdleTimeoutMinutes,
                body.AllowedInviteDomains), ct);

            return Results.Ok(result);
        })
        .WithName("UpdateWorkspaceSecuritySettings")
        .WithDescription("Replaces the security section: MFA requirement, idle session timeout and the staff invite email-domain allow-list.");

        group.MapPut("/compliance", async (
            string tenantSlug,
            UpdateWorkspaceComplianceRequest body,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            ISender sender,
            CancellationToken ct) =>
        {
            var denied = await Authorize(access, httpContext, tenantSlug, WorkspaceRole.Admin, ct);
            if (denied.Result != null) return denied.Result;

            var result = await sender.Send(new UpdateWorkspaceComplianceCommand(
                denied.Access!.Tenant.TenantSlug,
                Actor(httpContext, denied.Access),
                body.DpoName,
                body.DpoEmail,
                body.PrivacyNoticeUrl), ct);

            return Results.Ok(result);
        })
        .WithName("UpdateWorkspaceComplianceSettings")
        .WithDescription("Replaces the compliance section: Data Protection Officer and public privacy notice URL.");

        var workspace = app.MapGroup("/tenants/{tenantSlug}")
            .RequireAuthorization()
            .WithTags("Workspace Settings");

        workspace.MapGet("/session-policy", async (
            string tenantSlug,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            ISender sender,
            CancellationToken ct) =>
        {
            var denied = await Authorize(access, httpContext, tenantSlug, WorkspaceRole.Staff, ct);
            if (denied.Result != null) return denied.Result;

            var policy = await sender.Send(new GetWorkspaceSessionPolicyQuery(denied.Access!.Tenant.TenantSlug), ct);
            return policy is null ? Results.NotFound(new { Message = "Workspace not found." }) : Results.Ok(policy);
        })
        .WithName("GetWorkspaceSessionPolicy")
        .WithDescription("MFA requirement and idle timeout that apply to the signed-in member of this workspace.");

        workspace.MapPut("/facilities/{facilityId:guid}/deployment", async (
            string tenantSlug,
            Guid facilityId,
            UpdateFacilityDeploymentRequest body,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            ISender sender,
            CancellationToken ct) =>
        {
            var denied = await Authorize(access, httpContext, tenantSlug, WorkspaceRole.Admin, ct);
            if (denied.Result != null) return denied.Result;

            var result = await sender.Send(new UpdateFacilityDeploymentCommand(
                denied.Access!.Tenant.TenantSlug,
                Actor(httpContext, denied.Access),
                facilityId,
                body.DeploymentMode,
                body.ConsoleBaseUrl), ct);

            return Results.Ok(result);
        })
        .WithName("UpdateFacilityDeployment")
        .WithDescription("Sets whether a facility service runs in the shared cloud or on-premise and, for on-premise, its https console address.");
    }

    internal readonly record struct AuthResult(IResult? Result, WorkspaceAccess? Access);

    internal static async Task<AuthResult> Authorize(
        IWorkspaceAccessService access,
        HttpContext httpContext,
        string tenantSlug,
        WorkspaceRole required,
        CancellationToken ct)
    {
        var userId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId)) return new AuthResult(Results.Unauthorized(), null);

        var resolved = await access.ResolveAsync(tenantSlug, userId, ct);
        if (resolved == null) return new AuthResult(Results.NotFound(new { Message = "Workspace not found." }), null);
        if (!resolved.HasAtLeast(required)) return new AuthResult(Results.Forbid(), null);

        return new AuthResult(null, resolved);
    }

    internal static WorkspaceActor Actor(HttpContext httpContext, WorkspaceAccess access)
    {
        var user = httpContext.User;
        var name = user.FindFirst("name")?.Value
                   ?? user.FindFirst(ClaimTypes.Name)?.Value
                   ?? user.FindFirst(ClaimTypes.Email)?.Value
                   ?? access.UserId;
        return new WorkspaceActor(access.UserId, name, access.RoleName);
    }
}
