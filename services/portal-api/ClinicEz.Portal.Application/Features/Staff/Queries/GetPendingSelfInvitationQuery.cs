using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Features.Staff.Queries;

public record PendingSelfInvitationDto(
    string InvitationType,      // "Workspace" | "Admin"
    string Token,
    string? TenantSlug,         // Slug for workspace; null for Admin
    string? WorkspaceName,      // Tenant Name or "Platform Administration"
    string Role,                // Role name string (e.g. "Admin", "Member", "SuperAdmin")
    string Email,               // Invited email address
    DateTime? ExpiresAt,
    string RedirectUrl          // "/invitations/{token}" or "/admin/invitations/{token}"
);

public record GetPendingSelfInvitationQuery(
    string ClerkUserId,
    IReadOnlyList<string> VerifiedEmails
) : IRequest<PendingSelfInvitationDto?>;

public class GetPendingSelfInvitationQueryHandler(
    IApplicationDbContext context,
    IClerkUserLookup clerkLookup,
    TimeProvider timeProvider) : IRequestHandler<GetPendingSelfInvitationQuery, PendingSelfInvitationDto?>
{
    public async Task<PendingSelfInvitationDto?> Handle(GetPendingSelfInvitationQuery request, CancellationToken cancellationToken)
    {
        var emails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (request.VerifiedEmails != null)
        {
            foreach (var email in request.VerifiedEmails)
            {
                if (!string.IsNullOrWhiteSpace(email))
                {
                    emails.Add(email.Trim());
                }
            }
        }

        // Fallback to authoritative Clerk Backend API lookup if no email claims were provided
        if (emails.Count == 0 && !string.IsNullOrWhiteSpace(request.ClerkUserId))
        {
            try
            {
                var clerkEmails = await clerkLookup.GetVerifiedEmailsAsync(request.ClerkUserId, cancellationToken);
                if (clerkEmails != null)
                {
                    foreach (var email in clerkEmails)
                    {
                        if (!string.IsNullOrWhiteSpace(email))
                        {
                            emails.Add(email.Trim());
                        }
                    }
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                return null;
            }
        }

        if (emails.Count == 0)
        {
            return null;
        }

        var normalizedEmails = emails
            .Select(e => e.ToLowerInvariant())
            .Distinct()
            .ToList();

        var now = timeProvider.GetUtcNow().UtcDateTime;

        // 1. Check pending Workspace Team invitations
        var pendingWorkspace = await context.WorkspaceMembers
            .Include(m => m.Tenant)
            .Where(m => m.Status == MemberStatus.Invited &&
                        m.InvitationToken != null &&
                        m.InvitationToken != "" &&
                        m.Tenant.ArchivedAt == null &&
                        normalizedEmails.Contains(m.Email.ToLower()) &&
                        (!m.InvitationExpiresAt.HasValue || m.InvitationExpiresAt.Value > now))
            .OrderByDescending(m => m.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (pendingWorkspace != null)
        {
            var profile = await context.StaffMembers
                .FirstOrDefaultAsync(s => s.WorkspaceMemberId == pendingWorkspace.Id, cancellationToken);
            var role = StaffMemberMapping.RoleName(pendingWorkspace, profile);

            return new PendingSelfInvitationDto(
                InvitationType: "Workspace",
                Token: pendingWorkspace.InvitationToken!,
                TenantSlug: pendingWorkspace.Tenant.TenantSlug,
                WorkspaceName: pendingWorkspace.Tenant.Name,
                Role: role,
                Email: pendingWorkspace.Email,
                ExpiresAt: pendingWorkspace.InvitationExpiresAt,
                RedirectUrl: $"/invitations/{pendingWorkspace.InvitationToken}"
            );
        }

        // 2. Check pending Platform Admin invitations
        var pendingAdmin = await context.AdminUsers
            .Include(u => u.Role)
            .Where(u => u.Status == AdminUserStatus.Invited &&
                        u.InvitationToken != null &&
                        u.InvitationToken != "" &&
                        u.IsActive &&
                        normalizedEmails.Contains(u.Email.ToLower()) &&
                        (!u.InvitationExpiresAt.HasValue || u.InvitationExpiresAt.Value > now))
            .OrderByDescending(u => u.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (pendingAdmin != null)
        {
            return new PendingSelfInvitationDto(
                InvitationType: "Admin",
                Token: pendingAdmin.InvitationToken!,
                TenantSlug: null,
                WorkspaceName: "Platform Administration",
                Role: pendingAdmin.Role?.Name ?? "Platform Admin",
                Email: pendingAdmin.Email,
                ExpiresAt: pendingAdmin.InvitationExpiresAt,
                RedirectUrl: $"/admin/invitations/{pendingAdmin.InvitationToken}"
            );
        }

        return null;
    }
}
