using MainPortalBE.Application.Features.Admin.Queries;
using System;
using System.Security.Claims;
using System.Threading.Tasks;
using MainPortalBE.Api.Abstractions;
using MainPortalBE.Application.Features.Admin.Commands;
using MainPortalBE.Domain.Interfaces;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace MainPortalBE.Api.Endpoints;

public class FacilityEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/facilities", async (
            CreateFacilityCommand command,
            HttpContext httpContext,
            IUnitOfWork unitOfWork,
            ISender sender) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId))
            {
                return Results.Unauthorized();
            }

            var tenant = await unitOfWork.TenantRepository.FindAsync(t => t.TenantSlug == command.TenantId);
            if (tenant == null || tenant.OwnerId != clerkUserId)
            {
                return Results.Forbid();
            }

            Console.WriteLine($"[API] Creating facility '{command.Name}' of type {command.FacilityType} for tenant {command.TenantId}");
            var success = await sender.Send(command);
            return success 
                ? Results.Ok(new { Success = true, Message = "Facility created and provisioning event published" }) 
                : Results.BadRequest(new { Message = "Failed to create facility. Verify tenant details and names." });
        })
        .RequireAuthorization()
        .WithName("CreateFacility")
        .WithDescription("Creates a new institutional facility (clinic, lab, pharmacy, org) and triggers provisioning event in the monorepo.")
        .WithTags("Facilities");

        app.MapGet("/facilities", async (
            string tenantSlug,
            HttpContext httpContext,
            IUnitOfWork unitOfWork,
            ISender sender) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId))
            {
                return Results.Unauthorized();
            }

            var tenant = await unitOfWork.TenantRepository.FindAsync(t => t.TenantSlug == tenantSlug);
            if (tenant == null || tenant.OwnerId != clerkUserId)
            {
                return Results.Forbid();
            }

            var facilities = await sender.Send(new GetFacilitiesQuery(tenantSlug));
            return Results.Ok(facilities);
        })
        .RequireAuthorization()
        .WithName("GetFacilities")
        .WithDescription("Retrieves all created facilities for a tenant.")
        .WithTags("Facilities");
    }
}
