using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Api.Auth;
using ClinicEz.Portal.Application.Features.Integrations;
using ClinicEz.Portal.Application.Features.Workspace;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Api.Endpoints;

/// <summary>
/// Read-only endpoints for external systems, authenticated with a workspace API key (<c>X-Api-Key</c>) instead of a
/// Clerk session. They serve workspace and facility metadata only; each facility's own data stays in its service.
/// </summary>
public class IntegrationApiEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/integrations").WithTags("Integrations");

        group.MapGet("/workspace", async (HttpContext httpContext, ISender sender, CancellationToken ct) =>
        {
            var slug = httpContext.User.FindFirst(ApiKeyAuthenticationHandler.TenantSlugClaim)!.Value;
            var profile = await sender.Send(new GetWorkspaceProfileQuery(slug), ct);
            return profile is null ? Results.NotFound() : Results.Ok(profile);
        })
        .RequireAuthorization($"ApiKey:{IntegrationCatalog.ScopeWorkspaceRead}")
        .WithName("IntegrationGetWorkspace")
        .WithDescription("The workspace profile (brand, regional defaults, DPO and privacy notice). Needs the workspace:read scope.");

        group.MapGet("/facilities", async (HttpContext httpContext, ISender sender, CancellationToken ct) =>
        {
            var tenantId = Guid.Parse(httpContext.User.FindFirst(ApiKeyAuthenticationHandler.TenantIdClaim)!.Value);
            return Results.Ok(await sender.Send(new GetIntegrationFacilitiesQuery(tenantId), ct));
        })
        .RequireAuthorization($"ApiKey:{IntegrationCatalog.ScopeFacilitiesRead}")
        .WithName("IntegrationGetFacilities")
        .WithDescription("The workspace's facilities with branch, status and deployment mode. Needs the facilities:read scope.");
    }
}
