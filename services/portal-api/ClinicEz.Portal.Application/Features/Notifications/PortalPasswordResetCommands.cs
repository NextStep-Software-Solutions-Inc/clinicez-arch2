using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Application.Features.Staff;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Features.Notifications;

public sealed record PortalPasswordResetDetailsDto(
    string FullName,
    string Email,
    string Role,
    string ScopeName,
    bool IsExpired,
    DateTime? ExpiresAt
);

public sealed record GetPortalPasswordResetDetailsQuery(string Token) : IRequest<PortalPasswordResetDetailsDto>;

public sealed class GetPortalPasswordResetDetailsQueryHandler(
    IApplicationDbContext context,
    TimeProvider timeProvider
) : IRequestHandler<GetPortalPasswordResetDetailsQuery, PortalPasswordResetDetailsDto>
{
    public async Task<PortalPasswordResetDetailsDto> Handle(GetPortalPasswordResetDetailsQuery request, CancellationToken cancellationToken)
    {
        var token = request.Token?.Trim();
        if (string.IsNullOrWhiteSpace(token) || !token.StartsWith(ResetAdminUserPasswordCommandHandler.PasswordResetTokenPrefix, StringComparison.OrdinalIgnoreCase))
        {
            throw new KeyNotFoundException("Password reset link was not found or is invalid.");
        }

        var now = timeProvider.GetUtcNow().UtcDateTime;

        var adminUser = await context.AdminUsers
            .Include(u => u.Role)
            .FirstOrDefaultAsync(u => u.InvitationToken != null && u.InvitationToken.ToLower() == token.ToLower(), cancellationToken);

        if (adminUser != null)
        {
            if (adminUser.Status != AdminUserStatus.Active)
            {
                throw new InvalidOperationException("This account is not active.");
            }

            var isExpired = adminUser.InvitationExpiresAt.HasValue && adminUser.InvitationExpiresAt.Value < now;
            return new PortalPasswordResetDetailsDto(
                adminUser.FullName,
                adminUser.Email,
                adminUser.Role?.Name ?? "Administrator",
                "Clinic EZ Platform Administration",
                isExpired,
                adminUser.InvitationExpiresAt
            );
        }

        var member = await context.WorkspaceMembers
            .Include(m => m.Tenant)
            .FirstOrDefaultAsync(m => m.InvitationToken != null && m.InvitationToken.ToLower() == token.ToLower(), cancellationToken);

        if (member != null)
        {
            if (member.Status != MemberStatus.Active)
            {
                throw new InvalidOperationException("This account is not active.");
            }

            var profile = await context.StaffMembers
                .AsNoTracking()
                .FirstOrDefaultAsync(s => s.WorkspaceMemberId == member.Id, cancellationToken);

            var isExpired = member.InvitationExpiresAt.HasValue && member.InvitationExpiresAt.Value < now;
            return new PortalPasswordResetDetailsDto(
                member.FullName,
                member.Email,
                StaffMemberMapping.RoleName(member, profile),
                member.Tenant.Name,
                isExpired,
                member.InvitationExpiresAt
            );
        }

        throw new KeyNotFoundException("Password reset link was not found or has already been used.");
    }
}

public sealed record CompletePortalPasswordResetCommand(
    string Token,
    string NewPassword
) : IRequest<bool>;

public sealed class CompletePortalPasswordResetCommandHandler(
    IApplicationDbContext context,
    TimeProvider timeProvider,
    IClerkPasswordService? clerkPasswordService = null
) : IRequestHandler<CompletePortalPasswordResetCommand, bool>
{
    public async Task<bool> Handle(CompletePortalPasswordResetCommand request, CancellationToken cancellationToken)
    {
        var token = request.Token?.Trim();
        if (string.IsNullOrWhiteSpace(token) || !token.StartsWith(ResetAdminUserPasswordCommandHandler.PasswordResetTokenPrefix, StringComparison.OrdinalIgnoreCase))
        {
            throw new KeyNotFoundException("Password reset link was not found or is invalid.");
        }

        if (string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Trim().Length < 8)
        {
            throw new InvalidOperationException("Password must be at least 8 characters long.");
        }

        var now = timeProvider.GetUtcNow().UtcDateTime;

        var adminUser = await context.AdminUsers
            .FirstOrDefaultAsync(u => u.InvitationToken != null && u.InvitationToken.ToLower() == token.ToLower(), cancellationToken);

        if (adminUser != null)
        {
            if (adminUser.Status != AdminUserStatus.Active)
            {
                throw new InvalidOperationException("This account is not active.");
            }

            if (adminUser.InvitationExpiresAt.HasValue && adminUser.InvitationExpiresAt.Value < now)
            {
                throw new InvalidOperationException("This password reset link has expired.");
            }

            if (clerkPasswordService != null)
            {
                await clerkPasswordService.SetUserPasswordAsync(adminUser.ClerkUserId, adminUser.Email, request.NewPassword.Trim(), cancellationToken);
            }

            adminUser.InvitationToken = null;
            adminUser.InvitationExpiresAt = null;
            adminUser.UpdatedAt = now;
            await context.SaveChangesAsync(cancellationToken);
            return true;
        }

        var member = await context.WorkspaceMembers
            .FirstOrDefaultAsync(m => m.InvitationToken != null && m.InvitationToken.ToLower() == token.ToLower(), cancellationToken);

        if (member != null)
        {
            if (member.Status != MemberStatus.Active)
            {
                throw new InvalidOperationException("This account is not active.");
            }

            if (member.InvitationExpiresAt.HasValue && member.InvitationExpiresAt.Value < now)
            {
                throw new InvalidOperationException("This password reset link has expired.");
            }

            if (clerkPasswordService != null)
            {
                await clerkPasswordService.SetUserPasswordAsync(member.UserId, member.Email, request.NewPassword.Trim(), cancellationToken);
            }

            member.InvitationToken = null;
            member.InvitationExpiresAt = null;
            member.UpdatedAt = now;
            await context.SaveChangesAsync(cancellationToken);
            return true;
        }

        throw new KeyNotFoundException("Password reset link was not found or has already been used.");
    }
}
