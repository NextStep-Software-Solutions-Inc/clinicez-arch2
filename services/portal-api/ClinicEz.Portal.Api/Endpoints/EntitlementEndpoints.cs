using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Licensing;
using ClinicEz.Portal.Application.Features.Workspace;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace ClinicEz.Portal.Api.Endpoints;

/// <summary>Body of PUT /tenants/{slug}/facilities/{facilityId}/allocation. A null value means "automatic share of the pool".</summary>
public record SetFacilityAllocationRequest(int? MaxStaff, int? MaxStorageMb, int? ConcurrentTerminals);

/// <summary>What a workspace is entitled to, and how its staff/storage/terminal pools are divided among its facilities.</summary>
public class EntitlementEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/tenants/{tenantSlug}")
            .RequireAuthorization()
            .WithTags("Entitlements");

        group.MapGet("/entitlements", async (
            string tenantSlug,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            ISender sender,
            CancellationToken ct) =>
        {
            var denied = await TenantSettingsEndpoints.Authorize(access, httpContext, tenantSlug, WorkspaceRole.Admin, ct);
            if (denied.Result != null) return denied.Result;

            return Results.Ok(await sender.Send(new GetWorkspaceEntitlementsQuery(denied.Access!.Tenant.TenantSlug), ct));
        })
        .WithName("GetWorkspaceEntitlements")
        .WithDescription("The plan's limits and features in force for the workspace, the staff/storage/terminal pools, and each facility's share of them.");

        group.MapPut("/facilities/{facilityId:guid}/allocation", async (
            string tenantSlug,
            Guid facilityId,
            SetFacilityAllocationRequest body,
            HttpContext httpContext,
            IWorkspaceAccessService access,
            ISender sender,
            CancellationToken ct) =>
        {
            var denied = await TenantSettingsEndpoints.Authorize(access, httpContext, tenantSlug, WorkspaceRole.Admin, ct);
            if (denied.Result != null) return denied.Result;

            var result = await sender.Send(new SetFacilityAllocationCommand(
                denied.Access!.Tenant.TenantSlug, facilityId, body.MaxStaff, body.MaxStorageMb, body.ConcurrentTerminals), ct);
            return Results.Ok(result);
        })
        .WithName("SetFacilityAllocation")
        .WithDescription("Sets a facility's explicit share of the workspace pools (null = automatic). 409 allocation_exceeds_pool when shares would exceed a pool. The facility's license is re-issued and entitlements.changed is sent.");
    }
}
