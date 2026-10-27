using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Common;
using ClinicEz.Portal.Application.Features.Admin.DTOs;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Features.Admin.Commands;

public record AcceptAdminInvitationCommand(
    string Token,
    string ClerkUserId,
    string? Email = null,
    IReadOnlyList<string>? VerifiedEmails = null
) : IRequest<AdminUserDto>;

public class AcceptAdminInvitationCommandHandler(
    IApplicationDbContext context,
    IFrontendUrlProvider frontendUrlProvider,
    TimeProvider timeProvider,
    IClerkUserLookup? clerkLookup = null
) : IRequestHandler<AcceptAdminInvitationCommand, AdminUserDto>
{
    public async Task<AdminUserDto> Handle(AcceptAdminInvitationCommand request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Token))
        {
            throw new KeyNotFoundException("Invitation token is required.");
        }

        if (string.IsNullOrWhiteSpace(request.ClerkUserId))
        {
            throw new InvalidOperationException("Authenticated user identity is required.");
        }

        var tokenLower = request.Token.Trim().ToLowerInvariant();

        var user = await context.AdminUsers
            .Include(u => u.Role)
            .FirstOrDefaultAsync(u => u.InvitationToken != null && u.InvitationToken.ToLower() == tokenLower, cancellationToken)
            ?? throw new KeyNotFoundException("Invitation not found.");

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var baseUrl = frontendUrlProvider.GetBaseUrl();

        if (user.Status == AdminUserStatus.Revoked)
        {
            throw new InvalidOperationException("This invitation has been revoked.");
        }

        if (user.Status == AdminUserStatus.Suspended)
        {
            throw new InvalidOperationException("This administrative account is suspended.");
        }

        if (user.InvitationExpiresAt.HasValue && user.InvitationExpiresAt.Value < now)
        {
            throw new InvalidOperationException("This invitation has expired.");
        }

        if (user.Status == AdminUserStatus.Active)
        {
            if (user.ClerkUserId == request.ClerkUserId)
            {
                return AdminUserMapping.ToDto(user, timeProvider, baseUrl);
            }

            throw new InvalidOperationException("This invitation has already been accepted.");
        }

        if (user.Status != AdminUserStatus.Invited)
        {
            throw new InvalidOperationException("This invitation is not valid for acceptance.");
        }

        await InvitationEmailVerifier.EnsureEmailMatchesAsync(
            user.Email,
            request.Email,
            request.VerifiedEmails,
            request.ClerkUserId,
            clerkLookup,
            cancellationToken);

        var alreadyAdmin = await context.AdminUsers.AnyAsync(
            u => u.ClerkUserId == request.ClerkUserId && u.Id != user.Id && u.Status != AdminUserStatus.Revoked,
            cancellationToken);
        if (alreadyAdmin)
        {
            throw new InvalidOperationException("This account is already linked to an administrative profile.");
        }

        user.ClerkUserId = request.ClerkUserId;
        user.Status = AdminUserStatus.Active;
        user.IsActive = true;
        user.JoinedAt = now;
        user.UpdatedAt = now;
        user.UpdatedBy = user.FullName;

        await context.SaveChangesAsync(cancellationToken);

        return AdminUserMapping.ToDto(user, timeProvider, baseUrl);
    }
}
