using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Staff.Commands;
using ClinicEz.Portal.Application.Features.Staff.Queries;
using ClinicEz.Portal.Application.Interfaces;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using System;
using System.Security.Claims;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Api.Endpoints;

public class StaffEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        // 1. Get all staff members & quota status for a workspace
        app.MapGet("/staff", async (
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
                .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == tenantSlug.ToLower());

            if (tenant == null)
            {
                return Results.NotFound(new { Message = "Workspace not found." });
            }

            // Verify access: caller must be workspace owner or an active staff member
            var isOwner = tenant.OwnerId == clerkUserId;
            var isStaffMember = !isOwner && await context.StaffMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Status == "Active");

            if (!isOwner && !isStaffMember)
            {
                return Results.Forbid();
            }

            try
            {
                var result = await sender.Send(new GetTenantStaffQuery(tenantSlug));
                return Results.Ok(result);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { Message = ex.Message });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { Message = ex.Message });
            }
        })
        .RequireAuthorization()
        .WithName("GetTenantStaff")
        .WithDescription("Retrieves all internal team members, pending invitations, and seat quota for a workspace.")
        .WithTags("Staff");

        // 2. Invite a new staff member to the workspace
        app.MapPost("/staff/invite", async (
            InviteStaffMemberCommand command,
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
                .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == command.TenantSlug.ToLower());

            if (tenant == null)
            {
                return Results.NotFound(new { Message = "Workspace not found." });
            }

            // Inviting staff is restricted to Workspace Owner or Admins
            var isOwner = tenant.OwnerId == clerkUserId;
            var isAdmin = !isOwner && await context.StaffMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == "Admin" && s.Status == "Active");

            if (!isOwner && !isAdmin)
            {
                return Results.Forbid();
            }

            try
            {
                var createdMember = await sender.Send(command);
                return Results.Ok(createdMember);
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
        .WithName("InviteStaffMember")
        .WithDescription("Invites a new staff member to the workspace with role assignment, subject to subscription quotas.")
        .WithTags("Staff");

        // 3. Revoke or remove a staff member / invitation
        app.MapDelete("/staff/{id:guid}", async (
            Guid id,
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
                .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == tenantSlug.ToLower());

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

            try
            {
                var success = await sender.Send(new RevokeStaffMemberCommand(tenantSlug, id));
                return success 
                    ? Results.Ok(new { Success = true, Message = "Staff member / invitation revoked successfully." }) 
                    : Results.BadRequest(new { Message = "Failed to revoke staff member." });
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { Message = ex.Message });
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { Message = ex.Message });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { Message = ex.Message });
            }
        })
        .RequireAuthorization()
        .WithName("RevokeStaffMember")
        .WithDescription("Revokes an invitation or removes a staff member from the workspace.")
        .WithTags("Staff");
    }
}
