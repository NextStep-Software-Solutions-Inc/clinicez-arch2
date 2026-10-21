using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Features.Staff.Commands;
using ClinicEz.Portal.Application.Features.Staff.Queries;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Application.Features.Entitlements;
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
            var isStaffMember = !isOwner && await context.WorkspaceMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Status == MemberStatus.Active);

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
            var isAdmin = !isOwner && await context.WorkspaceMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == WorkspaceMemberRole.Admin && s.Status == MemberStatus.Active);

            if (!isOwner && !isAdmin)
            {
                return Results.Forbid();
            }

            try
            {
                var createdMember = await sender.Send(command);
                return Results.Ok(createdMember);
            }
            catch (InvalidOperationException ex) when (ex is not EntitlementException)
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
            var isAdmin = !isOwner && await context.WorkspaceMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == WorkspaceMemberRole.Admin && s.Status == MemberStatus.Active);

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
            catch (InvalidOperationException ex) when (ex is not EntitlementException)
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

        // 4. Get public invitation details by token
        app.MapGet("/staff/invitations/{token}", async (
            string token,
            ISender sender) =>
        {
            try
            {
                var result = await sender.Send(new GetInvitationDetailsQuery(token));
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
        .AllowAnonymous()
        .WithName("GetInvitationDetails")
        .WithDescription("Retrieves workspace and invitee details for a staff invitation token.")
        .WithTags("Staff");

        // 5. Accept an invitation and link Clerk user identity
        app.MapPost("/staff/invitations/{token}/accept", async (
            string token,
            HttpContext httpContext,
            ISender sender) =>
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId))
            {
                return Results.Unauthorized();
            }

            var email = httpContext.User.FindFirst(ClaimTypes.Email)?.Value;

            try
            {
                var result = await sender.Send(new AcceptInvitationCommand(token, clerkUserId, email));
                return Results.Ok(result);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { Message = ex.Message });
            }
            catch (InvalidOperationException ex) when (ex is not EntitlementException)
            {
                return Results.BadRequest(new { Message = ex.Message });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { Message = ex.Message });
            }
        })
        .RequireAuthorization()
        .WithName("AcceptStaffInvitation")
        .WithDescription("Accepts an invitation to join a workspace using an authenticated user identity.")
        .WithTags("Staff");

        // 6. Resend or refresh a staff invitation token
        app.MapPost("/staff/invitations/{id:guid}/resend", async (
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
            var isAdmin = !isOwner && await context.WorkspaceMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == WorkspaceMemberRole.Admin && s.Status == MemberStatus.Active);

            if (!isOwner && !isAdmin)
            {
                return Results.Forbid();
            }

            try
            {
                var result = await sender.Send(new ResendStaffInvitationCommand(tenantSlug, id));
                return Results.Ok(result);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { Message = ex.Message });
            }
            catch (InvalidOperationException ex) when (ex is not EntitlementException)
            {
                return Results.BadRequest(new { Message = ex.Message });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { Message = ex.Message });
            }
        })
        .RequireAuthorization()
        .WithName("ResendStaffInvitation")
        .WithDescription("Refreshes the cryptographic invitation token and resets expiration for a pending staff invite.")
        .WithTags("Staff");

        // 6b. Resend alias: POST /staff/{id:guid}/resend
        app.MapPost("/staff/{id:guid}/resend", async (
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
            var isAdmin = !isOwner && await context.WorkspaceMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == WorkspaceMemberRole.Admin && s.Status == MemberStatus.Active);

            if (!isOwner && !isAdmin)
            {
                return Results.Forbid();
            }

            try
            {
                var result = await sender.Send(new ResendStaffInvitationCommand(tenantSlug, id));
                return Results.Ok(result);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { Message = ex.Message });
            }
            catch (InvalidOperationException ex) when (ex is not EntitlementException)
            {
                return Results.BadRequest(new { Message = ex.Message });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { Message = ex.Message });
            }
        })
        .RequireAuthorization()
        .WithName("ResendStaffInvitationAlias")
        .WithTags("Staff");

        // 7. Suspend a staff member
        app.MapPost("/staff/{id:guid}/suspend", async (
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
            var isAdmin = !isOwner && await context.WorkspaceMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == WorkspaceMemberRole.Admin && s.Status == MemberStatus.Active);

            if (!isOwner && !isAdmin)
            {
                return Results.Forbid();
            }

            try
            {
                var result = await sender.Send(new SuspendStaffMemberCommand(tenantSlug, id));
                return Results.Ok(result);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { Message = ex.Message });
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
        .WithName("SuspendStaffMember")
        .WithDescription("Suspends a staff member account in the workspace.")
        .WithTags("Staff");

        // 8. Reactivate a suspended staff member
        app.MapPost("/staff/{id:guid}/reactivate", async (
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
            var isAdmin = !isOwner && await context.WorkspaceMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == WorkspaceMemberRole.Admin && s.Status == MemberStatus.Active);

            if (!isOwner && !isAdmin)
            {
                return Results.Forbid();
            }

            try
            {
                var result = await sender.Send(new ReactivateStaffMemberCommand(tenantSlug, id));
                return Results.Ok(result);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { Message = ex.Message });
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
        .WithName("ReactivateStaffMember")
        .WithDescription("Reactivates a suspended staff member account subject to subscription quotas.")
        .WithTags("Staff");

        // 9. Update staff member details
        app.MapPut("/staff/{id:guid}", async (
            Guid id,
            string tenantSlug,
            UpdateStaffMemberRequest request,
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
            var isAdmin = !isOwner && await context.WorkspaceMembers.AnyAsync(s => 
                s.TenantId == tenant.Id && s.UserId == clerkUserId && s.Role == WorkspaceMemberRole.Admin && s.Status == MemberStatus.Active);

            if (!isOwner && !isAdmin)
            {
                return Results.Forbid();
            }

            try
            {
                var result = await sender.Send(new UpdateStaffMemberCommand(tenantSlug, id, request.FullName, request.Role, request.FacilityId));
                return Results.Ok(result);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { Message = ex.Message });
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
        .WithName("UpdateStaffMember")
        .WithDescription("Updates staff member details including full name, role, and facility assignment.")
        .WithTags("Staff");
    }
}

public record UpdateStaffMemberRequest(string FullName, string Role, Guid? FacilityId = null);
