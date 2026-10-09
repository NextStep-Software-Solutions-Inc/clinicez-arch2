using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Features.Links;
using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace ClinicEz.Portal.Api.Endpoints;

/// <summary>Body of POST /tenants/{slug}/links. <c>Scopes</c> names are LabOrder, Prescription, Referral, Result; empty means all.</summary>
public record RequestFacilityLinkRequest(Guid SourceFacilityId, Guid TargetFacilityId, IReadOnlyList<string>? Scopes);

/// <summary>Body of POST /tenants/{slug}/links/{linkId}/approve. Optional <c>Scopes</c> narrow what was requested.</summary>
public record ApproveFacilityLinkRequest(IReadOnlyList<string>? Scopes);

/// <summary>Body of PUT /tenants/{slug}/facilities/{facilityId}/visibility. <c>Visibility</c> is Private, Network or Public.</summary>
public record SetFacilityVisibilityRequest(string Visibility, bool AcceptsExternalRequests);

/// <summary>Cross-tenant facility links, facility visibility and the directory search of a workspace. All of it is workspace-admin only.</summary>
public class FacilityLinkEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/tenants/{tenantSlug}")
            .RequireAuthorization()
            .WithTags("Facility Links");

        group.MapGet("/links", async (
            string tenantSlug,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            ISender sender,
            CancellationToken ct) =>
        {
            var denied = await TenantSettingsEndpoints.Authorize(access, httpContext, tenantSlug, WorkspaceRole.Admin, ct);
            if (denied.Result != null) return denied.Result;

            return Results.Ok(await sender.Send(new GetFacilityLinksQuery(denied.Access!.Tenant.TenantSlug), ct));
        })
        .WithName("GetFacilityLinks")
        .WithDescription("Every cross-tenant link the workspace takes part in. Direction is outgoing when the workspace's facility asked, incoming when it was asked.");

        group.MapPost("/links", async (
            string tenantSlug,
            RequestFacilityLinkRequest body,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            ISender sender,
            CancellationToken ct) =>
        {
            var denied = await TenantSettingsEndpoints.Authorize(access, httpContext, tenantSlug, WorkspaceRole.Admin, ct);
            if (denied.Result != null) return denied.Result;

            if (!TryParseScopes(body.Scopes, out var scopes)) return InvalidScopes();

            var link = await sender.Send(new RequestFacilityLinkCommand(
                denied.Access!.Tenant.TenantSlug,
                TenantSettingsEndpoints.Actor(httpContext, denied.Access),
                body.SourceFacilityId,
                body.TargetFacilityId,
                scopes), ct);
            return Results.Ok(link);
        })
        .WithName("RequestFacilityLink")
        .WithDescription("Asks a public facility of another workspace for a link (needs feature.cross_tenant_interop). Active at once when the target accepts external requests, otherwise Pending until the target's admin approves. 409 link_already_exists when one is pending or active.");

        group.MapPost("/links/{linkId:guid}/approve", async (
            string tenantSlug,
            Guid linkId,
            ApproveFacilityLinkRequest? body,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            ISender sender,
            CancellationToken ct) =>
        {
            var denied = await TenantSettingsEndpoints.Authorize(access, httpContext, tenantSlug, WorkspaceRole.Admin, ct);
            if (denied.Result != null) return denied.Result;

            LinkScopes? narrowed = null;
            if (body?.Scopes is { Count: > 0 })
            {
                if (!TryParseScopes(body.Scopes, out var parsed)) return InvalidScopes();
                narrowed = parsed;
            }

            var link = await sender.Send(new ApproveFacilityLinkCommand(
                denied.Access!.Tenant.TenantSlug,
                TenantSettingsEndpoints.Actor(httpContext, denied.Access),
                linkId,
                narrowed), ct);
            return Results.Ok(link);
        })
        .WithName("ApproveFacilityLink")
        .WithDescription("The target workspace's admin approves a pending link request, optionally narrowing its scopes. Approving an active link is a no-op.");

        group.MapPost("/links/{linkId:guid}/reject", async (
            string tenantSlug,
            Guid linkId,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            ISender sender,
            CancellationToken ct) =>
        {
            var denied = await TenantSettingsEndpoints.Authorize(access, httpContext, tenantSlug, WorkspaceRole.Admin, ct);
            if (denied.Result != null) return denied.Result;

            var link = await sender.Send(new RejectFacilityLinkCommand(
                denied.Access!.Tenant.TenantSlug,
                TenantSettingsEndpoints.Actor(httpContext, denied.Access),
                linkId), ct);
            return Results.Ok(link);
        })
        .WithName("RejectFacilityLink")
        .WithDescription("The target workspace's admin declines a pending link request.");

        group.MapDelete("/links/{linkId:guid}", async (
            string tenantSlug,
            Guid linkId,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            ISender sender,
            CancellationToken ct) =>
        {
            var denied = await TenantSettingsEndpoints.Authorize(access, httpContext, tenantSlug, WorkspaceRole.Admin, ct);
            if (denied.Result != null) return denied.Result;

            var link = await sender.Send(new RevokeFacilityLinkCommand(
                denied.Access!.Tenant.TenantSlug,
                TenantSettingsEndpoints.Actor(httpContext, denied.Access),
                linkId), ct);
            return Results.Ok(link);
        })
        .WithName("RevokeFacilityLink")
        .WithDescription("Either side ends a pending or active link (the requester withdraws it, the target cuts it off). Always allowed, whatever the plan.");

        group.MapPut("/facilities/{facilityId:guid}/visibility", async (
            string tenantSlug,
            Guid facilityId,
            SetFacilityVisibilityRequest body,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            ISender sender,
            CancellationToken ct) =>
        {
            var denied = await TenantSettingsEndpoints.Authorize(access, httpContext, tenantSlug, WorkspaceRole.Admin, ct);
            if (denied.Result != null) return denied.Result;

            if (!Enum.TryParse<FacilityVisibility>(body.Visibility, ignoreCase: true, out var visibility) || !Enum.IsDefined(visibility))
            {
                return Results.BadRequest(new { Message = "Visibility must be Private, Network or Public." });
            }

            var result = await sender.Send(new SetFacilityVisibilityCommand(
                denied.Access!.Tenant.TenantSlug,
                TenantSettingsEndpoints.Actor(httpContext, denied.Access),
                facilityId,
                visibility,
                body.AcceptsExternalRequests), ct);
            return Results.Ok(result);
        })
        .WithName("SetFacilityVisibility")
        .WithDescription("Sets who may find a facility (Private, Network, Public) and whether links to it are accepted automatically. Anything above Private needs feature.cross_tenant_interop; AcceptsExternalRequests needs Public.");

        group.MapGet("/directory/facilities", async (
            string tenantSlug,
            string? type,
            string? q,
            string? city,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            ISender sender,
            ILogger<FacilityLinkEndpoints> logger,
            CancellationToken ct) =>
        {
            var denied = await TenantSettingsEndpoints.Authorize(access, httpContext, tenantSlug, WorkspaceRole.Admin, ct);
            if (denied.Result != null) return denied.Result;

            FacilityType? facilityType = null;
            if (!string.IsNullOrWhiteSpace(type))
            {
                if (!Enum.TryParse<FacilityType>(type, ignoreCase: true, out var parsed) || !Enum.IsDefined(parsed))
                {
                    return Results.BadRequest(new { Message = "Unknown facility type." });
                }

                facilityType = parsed;
            }

            try
            {
                var facilities = await sender.Send(new SearchDirectoryQuery(
                    denied.Access!.Tenant.TenantSlug,
                    new DirectorySearchCriteria(facilityType, q, city)), ct);
                return Results.Ok(facilities);
            }
            catch (HttpRequestException ex)
            {
                logger.LogWarning(ex, "Directory search for workspace {TenantSlug} failed.", tenantSlug);
                return Results.Json(new { Message = "The directory could not be reached. Try again shortly." }, statusCode: StatusCodes.Status502BadGateway);
            }
        })
        .WithName("SearchDirectoryFacilities")
        .WithDescription("Searches the hub directory as this workspace: its own facilities, public facilities and those it is linked to, with the link status of each.");
    }

    private static bool TryParseScopes(IReadOnlyList<string>? names, out LinkScopes scopes)
    {
        scopes = LinkScopes.None;
        if (names is null) return true;

        foreach (var name in names)
        {
            if (!Enum.TryParse<LinkScopes>(name, ignoreCase: true, out var scope) || scope == LinkScopes.None || !Enum.IsDefined(scope))
            {
                return false;
            }

            scopes |= scope;
        }

        return true;
    }

    private static IResult InvalidScopes() =>
        Results.BadRequest(new { Message = "Scopes must be LabOrder, Prescription, Referral or Result." });
}
