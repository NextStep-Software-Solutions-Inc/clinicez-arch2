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

        // 3. Revoke or permanently remove a staff member / invitation
        app.MapDelete("/staff/{id:guid}", async (
            Guid id,
            string tenantSlug,
            bool? permanent,
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
                if (permanent == true)
                {
                    var deleted = await sender.Send(new DeleteStaffMemberCommand(tenantSlug, id));
                    return deleted
                        ? Results.Ok(new { Success = true, Message = "Staff member permanently removed from workspace." })
                        : Results.BadRequest(new { Message = "Failed to remove staff member." });
                }

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
        .WithDescription("Revokes an invitation/member or permanently removes a revoked member from the workspace.")
        .WithTags("Staff");

        // 3b. Permanently remove a revoked staff member from the workspace
        app.MapDelete("/staff/{id:guid}/permanent", async (
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
                var deleted = await sender.Send(new DeleteStaffMemberCommand(tenantSlug, id));
                return deleted
                    ? Results.Ok(new { Success = true, Message = "Staff member permanently removed from workspace." })
                    : Results.BadRequest(new { Message = "Failed to remove staff member." });
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
        .WithName("DeleteStaffMemberPermanently")
        .WithDescription("Permanently removes a revoked staff member record from the workspace.")
        .WithTags("Staff");

        // 3.5. Authoritative Pending Self-Invitation Lookup for authenticated user
        async Task<IResult> HandlePendingSelfInvitation(
            HttpContext httpContext,
            ISender sender,
            CancellationToken cancellationToken)
        {
            var clerkUserId = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(clerkUserId))
            {
                return Results.Unauthorized();
            }

            var emails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            void CollectClaim(string type)
            {
                foreach (var c in httpContext.User.FindAll(type))
                {
                    if (!string.IsNullOrWhiteSpace(c.Value))
                    {
                        emails.Add(c.Value.Trim());
                    }
                }
            }

            CollectClaim(ClaimTypes.Email);
            CollectClaim("email");
            CollectClaim("emails");
            CollectClaim("email_address");
            CollectClaim("primary_email_address");

            var query = new GetPendingSelfInvitationQuery(clerkUserId, emails.ToList());
            var result = await sender.Send(query, cancellationToken);

            return result != null
                ? Results.Ok(result)
                : Results.NotFound(new { Message = "No pending invitations found." });
        }

        app.MapGet("/staff/invitations/pending-self", HandlePendingSelfInvitation)
            .RequireAuthorization()
            .WithName("GetPendingSelfInvitation")
            .WithDescription("Retrieves the latest valid, unexpired pending invitation (workspace or platform admin) matching the authenticated user's verified identity.")
            .WithTags("Staff");

        app.MapGet("/invitations/pending-self", HandlePendingSelfInvitation)
            .RequireAuthorization()
            .WithName("GetPendingSelfInvitationAlias")
            .WithDescription("Alias for pending self-invitation lookup.")
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

        // 10. Reset workspace member password
        app.MapPost("/staff/{id:guid}/reset-password", async (
            Guid id,
            string tenantSlug,
            ResetPortalPasswordRequest? request,
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
                var sendResetEmail = (request?.SendResetEmail ?? false) ||
                                     string.Equals(request?.DeliveryMode, "email", StringComparison.OrdinalIgnoreCase);
                var generateResetLink = (request?.GenerateResetLink ?? false) ||
                                        string.Equals(request?.DeliveryMode, "link", StringComparison.OrdinalIgnoreCase);

                var result = await sender.Send(new ResetStaffMemberPasswordCommand(
                    tenantSlug,
                    id,
                    request?.TemporaryPassword,
                    sendResetEmail,
                    generateResetLink));
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
        .WithName("ResetStaffMemberPassword")
        .WithDescription("Resets a workspace team member's password via email reset link, copyable reset link, or direct temporary password.")
        .WithTags("Staff");

        // 11. Public password reset token details & completion
        app.MapGet("/public/password-reset/{token}", async (string token, ISender sender) =>
        {
            try
            {
                var result = await sender.Send(new ClinicEz.Portal.Application.Features.Notifications.GetPortalPasswordResetDetailsQuery(token));
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
        .AllowAnonymous()
        .WithName("GetPortalPasswordResetDetails")
        .WithDescription("Retrieves user details and expiration status for a portal password reset token.")
        .WithTags("Staff");

        app.MapPost("/public/password-reset/{token}", async (
            string token,
            CompletePortalPasswordResetRequest request,
            ISender sender) =>
        {
            try
            {
                await sender.Send(new ClinicEz.Portal.Application.Features.Notifications.CompletePortalPasswordResetCommand(token, request.NewPassword));
                return Results.Ok(new { Message = "Password has been reset successfully. You can now sign in with your new password." });
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
        .AllowAnonymous()
        .WithName("CompletePortalPasswordReset")
        .WithDescription("Completes a portal password reset using a valid reset token.")
        .WithTags("Staff");
    }
}

public record UpdateStaffMemberRequest(string FullName, string Role, Guid? FacilityId = null);

public record CompletePortalPasswordResetRequest(string NewPassword);
