using ClinicEz.Portal.Application.Features.Admin.Queries;
using System;
using System.Security.Claims;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Portal.Api.Endpoints;

public class FacilityEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        // 1. Create a new institutional facility
        app.MapPost("/facilities", async (
            CreateFacilityCommand command,
            HttpContext httpContext,
            IApplicationDbContext context,
            ISender sender) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId))
            {
                return Results.Unauthorized();
            }

            var tenant = await context.Tenants
                .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == command.TenantId.ToLower() || t.Id.ToString() == command.TenantId);

            if (tenant == null)
            {
                return Results.NotFound(new { Message = "Workspace not found." });
            }

            var isOwner = tenant.OwnerId == clerkUserId;
            var isAdmin = !isOwner && await context.StaffMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == "Admin" && s.Status == "Active");

            if (!isOwner && !isAdmin)
            {
                return Results.Forbid();
            }

            Console.WriteLine($"[API] Creating facility '{command.Name}' of type {command.FacilityType} for tenant {command.TenantId}");
            try
            {
                var success = await sender.Send(command);
                return success 
                    ? Results.Ok(new { Success = true, Message = "Facility created and provisioning event published" }) 
                    : Results.BadRequest(new { Message = "Failed to create facility. Verify tenant details and names." });
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { Message = ex.Message });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { Message = ex.Message });
            }
        })
        .RequireAuthorization()
        .WithName("CreateFacility")
        .WithDescription("Creates a new institutional facility (clinic, lab, pharmacy, org) and triggers provisioning event in the monorepo.")
        .WithTags("Facilities");

        // 2. Retrieve facilities with environment-aware subdomain console URLs
        app.MapGet("/facilities", async (
            string tenantSlug,
            HttpContext httpContext,
            IApplicationDbContext context,
            ISender sender) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId))
            {
                return Results.Unauthorized();
            }

            var tenant = await context.Tenants
                .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == tenantSlug.ToLower() || t.Id.ToString() == tenantSlug);

            if (tenant == null)
            {
                return Results.NotFound(new { Message = "Workspace not found." });
            }

            var isOwner = tenant.OwnerId == clerkUserId;
            var isStaff = !isOwner && await context.StaffMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Status == "Active");

            if (!isOwner && !isStaff)
            {
                return Results.Forbid();
            }

            var facilities = await sender.Send(new GetFacilitiesQuery(tenantSlug));
            return Results.Ok(facilities);
        })
        .RequireAuthorization()
        .WithName("GetFacilities")
        .WithDescription("Retrieves all created facilities for a tenant with console URLs.")
        .WithTags("Facilities");

        // 3. Resolve subdomain console URL for a specific facility
        app.MapGet("/facilities/{id:guid}/console-url", async (
            Guid id,
            string tenantSlug,
            HttpContext httpContext,
            IApplicationDbContext context,
            IConfiguration configuration) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId))
            {
                return Results.Unauthorized();
            }

            var tenant = await context.Tenants
                .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == tenantSlug.ToLower() || t.Id.ToString() == tenantSlug);

            if (tenant == null)
            {
                return Results.NotFound(new { Message = "Workspace not found." });
            }

            var isOwner = tenant.OwnerId == clerkUserId;
            var isStaff = !isOwner && await context.StaffMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Status == "Active");

            if (!isOwner && !isStaff)
            {
                return Results.Forbid();
            }

            var facility = await context.Facilities.FirstOrDefaultAsync(f => f.Id == id && f.TenantId == tenant.Id);
            if (facility == null)
            {
                return Results.NotFound(new { Message = "Facility not found." });
            }

            var slug = GetFacilitiesQueryHandler.GenerateFacilitySlug(facility.Name);
            var consoleUrl = GetFacilitiesQueryHandler.ResolveConsoleUrl(
                configuration,
                facility.FacilityType,
                facility.Status,
                facility.Id,
                tenant.TenantSlug);

            return Results.Ok(new 
            { 
                Slug = slug, 
                ConsoleUrl = consoleUrl, 
                Status = facility.Status.ToString(),
                FacilityType = facility.FacilityType.ToString() 
            });
        })
        .RequireAuthorization()
        .WithName("GetFacilityConsoleUrl")
        .WithDescription("Resolves environment-aware subdomain console URL for a specific facility.")
        .WithTags("Facilities");

        // 4. Update an existing facility
        app.MapPut("/facilities/{id:guid}", async (
            Guid id,
            UpdateFacilityRequest request,
            HttpContext httpContext,
            IApplicationDbContext context,
            ISender sender) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId)) return Results.Unauthorized();

            var tenant = await context.Tenants
                .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == request.TenantSlug.ToLower() || t.Id.ToString() == request.TenantSlug);

            if (tenant == null) return Results.NotFound(new { Message = "Workspace not found." });

            var isOwner = tenant.OwnerId == clerkUserId;
            var isAdmin = !isOwner && await context.StaffMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == "Admin" && s.Status == "Active");

            if (!isOwner && !isAdmin) return Results.Forbid();

            var success = await sender.Send(new UpdateFacilityCommand(id, tenant.TenantSlug, request.Name, request.Status));
            return success ? Results.Ok(new { Success = true }) : Results.NotFound(new { Message = "Facility not found." });
        })
        .RequireAuthorization()
        .WithName("UpdateFacility")
        .WithDescription("Updates an existing facility name or operational status.")
        .WithTags("Facilities");

        // 5. Delete / archive a facility (Owner only)
        app.MapDelete("/facilities/{id:guid}", async (
            Guid id,
            string tenantSlug,
            HttpContext httpContext,
            IApplicationDbContext context,
            ISender sender) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId)) return Results.Unauthorized();

            var tenant = await context.Tenants
                .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == tenantSlug.ToLower() || t.Id.ToString() == tenantSlug);

            if (tenant == null) return Results.NotFound(new { Message = "Workspace not found." });

            if (tenant.OwnerId != clerkUserId) return Results.Forbid();

            var success = await sender.Send(new DeleteFacilityCommand(id, tenant.TenantSlug));
            return success ? Results.Ok(new { Success = true }) : Results.NotFound(new { Message = "Facility not found." });
        })
        .RequireAuthorization()
        .WithName("DeleteFacility")
        .WithDescription("Permanently deletes/archives a facility from the workspace (Owner only).")
        .WithTags("Facilities");

        // 6. Force-activate a facility and re-publish provisioning event
        app.MapPost("/facilities/{id:guid}/activate", async (
            Guid id,
            string tenantSlug,
            HttpContext httpContext,
            IApplicationDbContext context,
            MassTransit.IPublishEndpoint publishEndpoint) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId)) return Results.Unauthorized();

            var tenant = await context.Tenants
                .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == tenantSlug.ToLower() || t.Id.ToString() == tenantSlug);

            if (tenant == null) return Results.NotFound(new { Message = "Workspace not found." });

            var isOwner = tenant.OwnerId == clerkUserId;
            var isAdmin = !isOwner && await context.StaffMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == "Admin" && s.Status == "Active");

            if (!isOwner && !isAdmin) return Results.Forbid();

            var facility = await context.Facilities.FirstOrDefaultAsync(f => f.Id == id && f.TenantId == tenant.Id);
            if (facility == null) return Results.NotFound(new { Message = "Facility not found." });

            facility.Status = ClinicEz.Portal.Domain.Entities.FacilityStatus.Active;
            facility.UpdatedAt = DateTime.UtcNow;

            await publishEndpoint.Publish(new FacilityCreatedEvent
            {
                TenantId = tenant.Id.ToString(),
                FacilityType = facility.FacilityType,
                ResourceId = facility.Id,
                Name = facility.Name
            });

            await context.SaveChangesAsync(default);

            return Results.Ok(new { Success = true, Message = "Facility activated successfully." });
        })
        .RequireAuthorization()
        .WithName("ActivateFacility")
        .WithDescription("Activates a facility and re-publishes the provisioning event.")
        .WithTags("Facilities");
    }
}

public record UpdateFacilityRequest(string TenantSlug, string Name, ClinicEz.Portal.Domain.Entities.FacilityStatus? Status = null);
