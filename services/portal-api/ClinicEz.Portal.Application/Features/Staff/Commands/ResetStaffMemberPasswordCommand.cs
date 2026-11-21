using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Interoperability;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Features.Staff.Commands;

public sealed record ResetStaffMemberPasswordCommand(
    string TenantSlug,
    Guid MemberId,
    string? TemporaryPassword = null,
    bool SendResetEmail = false,
    bool GenerateResetLink = false
) : IRequest<ResetPortalPasswordResultDto>;

public sealed class ResetStaffMemberPasswordCommandHandler(
    IApplicationDbContext context,
    INotificationService notificationService,
    IFrontendUrlProvider frontendUrlProvider,
    TimeProvider timeProvider,
    IClerkPasswordService? clerkPasswordService = null
) : IRequestHandler<ResetStaffMemberPasswordCommand, ResetPortalPasswordResultDto>
{
    public async Task<ResetPortalPasswordResultDto> Handle(ResetStaffMemberPasswordCommand request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == request.TenantSlug.ToLower() || t.Id.ToString() == request.TenantSlug, cancellationToken)
            ?? throw new KeyNotFoundException("Workspace not found.");

        var member = await context.WorkspaceMembers
            .FirstOrDefaultAsync(m => m.Id == request.MemberId && m.TenantId == tenant.Id, cancellationToken)
            ?? throw new KeyNotFoundException("Team member not found in this workspace.");

        if (member.Status != MemberStatus.Active)
        {
            throw new InvalidOperationException("Only active workspace members can have their password reset.");
        }

        var profile = await context.StaffMembers
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.WorkspaceMemberId == member.Id, cancellationToken);

        var roleName = StaffMemberMapping.RoleName(member, profile);
        var now = timeProvider.GetUtcNow().UtcDateTime;

        if (request.SendResetEmail || request.GenerateResetLink)
        {
            var resetToken = $"{ResetAdminUserPasswordCommandHandler.PasswordResetTokenPrefix}{Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant()}";
            member.InvitationToken = resetToken;
            member.InvitationExpiresAt = now.AddDays(7);
            member.UpdatedAt = now;

            var baseUrl = (frontendUrlProvider.GetBaseUrl() ?? string.Empty).TrimEnd('/');
            var resetUrl = $"{baseUrl}/reset-password/{resetToken}";

            if (request.SendResetEmail)
            {
                notificationService.EnqueueEmail(new NotificationEmailRequestedPayload
                {
                    To = member.Email,
                    Subject = $"Reset your password for {tenant.Name} on Clinic EZ",
                    TemplateKey = EmailTemplateKeys.PortalPasswordReset,
                    Model = new Dictionary<string, string>
                    {
                        ["recipientName"] = member.FullName,
                        ["inviteeName"] = member.FullName,
                        ["scopeName"] = tenant.Name,
                        ["role"] = roleName,
                        ["resetUrl"] = resetUrl,
                        ["inviteUrl"] = resetUrl
                    },
                    FromFacilityName = tenant.Name
                }, member.Id);
            }

            await context.SaveChangesAsync(cancellationToken);

            return new ResetPortalPasswordResultDto(
                member.Id,
                member.FullName,
                member.Email,
                roleName,
                string.Empty,
                request.SendResetEmail
                    ? "Password reset email sent. The team member can set their new password using the link (valid for 7 days)."
                    : "Password reset link generated (valid for 7 days). Share this link with the team member to set their new password.",
                ResetToken: resetToken,
                ResetUrl: resetUrl,
                EmailSent: request.SendResetEmail
            );
        }

        var tempPassword = string.IsNullOrWhiteSpace(request.TemporaryPassword)
            ? ResetAdminUserPasswordCommandHandler.GenerateSecurePassword()
            : request.TemporaryPassword.Trim();

        if (tempPassword.Length < 8)
        {
            throw new InvalidOperationException("Temporary password must be at least 8 characters.");
        }

        if (clerkPasswordService != null)
        {
            await clerkPasswordService.SetUserPasswordAsync(member.UserId, member.Email, tempPassword, cancellationToken);
        }

        member.InvitationToken = null;
        member.InvitationExpiresAt = null;
        member.UpdatedAt = now;
        await context.SaveChangesAsync(cancellationToken);

        return new ResetPortalPasswordResultDto(
            member.Id,
            member.FullName,
            member.Email,
            roleName,
            tempPassword,
            "Temporary password set and active sessions signed out."
        );
    }
}
