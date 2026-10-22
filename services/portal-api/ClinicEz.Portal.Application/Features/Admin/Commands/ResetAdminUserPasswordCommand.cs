using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Interoperability;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Features.Admin.Commands;

public sealed record ResetPortalPasswordResultDto(
    Guid UserId,
    string FullName,
    string Email,
    string Role,
    string TemporaryPassword,
    string Message,
    string? ResetToken = null,
    string? ResetUrl = null,
    bool EmailSent = false
);

public sealed record ResetAdminUserPasswordCommand(
    Guid UserId,
    string? TemporaryPassword = null,
    bool SendResetEmail = false,
    bool GenerateResetLink = false
) : IRequest<ResetPortalPasswordResultDto>;

public sealed class ResetAdminUserPasswordCommandHandler(
    IApplicationDbContext context,
    INotificationService notificationService,
    IFrontendUrlProvider frontendUrlProvider,
    TimeProvider timeProvider,
    IClerkPasswordService? clerkPasswordService = null
) : IRequestHandler<ResetAdminUserPasswordCommand, ResetPortalPasswordResultDto>
{
    public const string PasswordResetTokenPrefix = "pwdreset_";

    public async Task<ResetPortalPasswordResultDto> Handle(ResetAdminUserPasswordCommand request, CancellationToken cancellationToken)
    {
        var user = await context.AdminUsers
            .Include(u => u.Role)
            .FirstOrDefaultAsync(u => u.Id == request.UserId, cancellationToken)
            ?? throw new KeyNotFoundException("Platform user not found.");

        if (user.Status != AdminUserStatus.Active)
        {
            throw new InvalidOperationException("Only active platform users can have their password reset.");
        }

        var roleName = user.Role?.Name ?? "Administrator";
        var now = timeProvider.GetUtcNow().UtcDateTime;

        if (request.SendResetEmail || request.GenerateResetLink)
        {
            var resetToken = $"{PasswordResetTokenPrefix}{Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant()}";
            user.InvitationToken = resetToken;
            user.InvitationExpiresAt = now.AddDays(7);
            user.UpdatedAt = now;

            var baseUrl = (frontendUrlProvider.GetBaseUrl() ?? string.Empty).TrimEnd('/');
            var resetUrl = $"{baseUrl}/reset-password/{resetToken}";

            if (request.SendResetEmail)
            {
                notificationService.EnqueueEmail(new NotificationEmailRequestedPayload
                {
                    To = user.Email,
                    Subject = "Reset your Clinic EZ Platform Administration password",
                    TemplateKey = EmailTemplateKeys.PortalPasswordReset,
                    Model = new Dictionary<string, string>
                    {
                        ["recipientName"] = user.FullName,
                        ["inviteeName"] = user.FullName,
                        ["scopeName"] = "Clinic EZ Platform Administration",
                        ["role"] = roleName,
                        ["resetUrl"] = resetUrl,
                        ["inviteUrl"] = resetUrl
                    },
                    FromFacilityName = "Clinic EZ Platform"
                }, user.Id);
            }

            await context.SaveChangesAsync(cancellationToken);

            return new ResetPortalPasswordResultDto(
                user.Id,
                user.FullName,
                user.Email,
                roleName,
                string.Empty,
                request.SendResetEmail
                    ? "Password reset email sent. The user can set their new password using the link (valid for 7 days)."
                    : "Password reset link generated (valid for 7 days). Share this link with the user to set their new password.",
                ResetToken: resetToken,
                ResetUrl: resetUrl,
                EmailSent: request.SendResetEmail
            );
        }

        var tempPassword = string.IsNullOrWhiteSpace(request.TemporaryPassword)
            ? GenerateSecurePassword()
            : request.TemporaryPassword.Trim();

        if (tempPassword.Length < 8)
        {
            throw new InvalidOperationException("Temporary password must be at least 8 characters.");
        }

        if (clerkPasswordService != null)
        {
            await clerkPasswordService.SetUserPasswordAsync(user.ClerkUserId, user.Email, tempPassword, cancellationToken);
        }

        user.InvitationToken = null;
        user.InvitationExpiresAt = null;
        user.UpdatedAt = now;
        await context.SaveChangesAsync(cancellationToken);

        return new ResetPortalPasswordResultDto(
            user.Id,
            user.FullName,
            user.Email,
            roleName,
            tempPassword,
            "Temporary password set and active sessions signed out."
        );
    }

    internal static string GenerateSecurePassword()
    {
        const string upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        const string lower = "abcdefghijkmnopqrstuvwxyz";
        const string digits = "23456789";
        const string specials = "#!@$%";

        var sb = new StringBuilder();
        sb.Append(upper[RandomNumberGenerator.GetInt32(upper.Length)]);
        sb.Append(lower[RandomNumberGenerator.GetInt32(lower.Length)]);
        sb.Append(digits[RandomNumberGenerator.GetInt32(digits.Length)]);
        sb.Append(specials[RandomNumberGenerator.GetInt32(specials.Length)]);

        const string all = upper + lower + digits + specials;
        for (int i = 0; i < 6; i++)
        {
            sb.Append(all[RandomNumberGenerator.GetInt32(all.Length)]);
        }

        return sb.ToString();
    }
}
