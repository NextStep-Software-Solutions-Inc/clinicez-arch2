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

            var baseDomain = configuration["Console:BaseDomain"] ?? "clinicez.ph";
            var isDev = string.Equals(configuration["ASPNETCORE_ENVIRONMENT"], "Development", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(configuration["Environment"], "Development", StringComparison.OrdinalIgnoreCase) ||
                        (bool.TryParse(configuration["Console:ForceLocal"], out var forceLocal) && forceLocal);

            var slug = GetFacilitiesQueryHandler.GenerateFacilitySlug(facility.Name);
            var devPort = facility.FacilityType switch
            {
                FacilityType.Clinic => configuration["Console:DevPorts:Clinic"] ?? "5245",
                FacilityType.Laboratory => configuration["Console:DevPorts:Laboratory"] ?? "5245",
                FacilityType.Pharmacy => configuration["Console:DevPorts:Pharmacy"] ?? "5245",
                FacilityType.Organization => configuration["Console:DevPorts:Organization"] ?? "5245",
                _ => "5245"
            };

            var consoleUrl = isDev ? $"http://localhost:{devPort}" : $"https://{slug}.{baseDomain}";
            return Results.Ok(new { Slug = slug, ConsoleUrl = consoleUrl, FacilityType = facility.FacilityType.ToString() });
        })
        .RequireAuthorization()
        .WithName("GetFacilityConsoleUrl")
        .WithDescription("Resolves environment-aware subdomain console URL for a specific facility.")
        .WithTags("Facilities");
    }
}
