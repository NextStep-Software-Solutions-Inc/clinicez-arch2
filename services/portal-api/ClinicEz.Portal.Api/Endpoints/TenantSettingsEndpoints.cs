using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Workspace;
using MediatR;
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
