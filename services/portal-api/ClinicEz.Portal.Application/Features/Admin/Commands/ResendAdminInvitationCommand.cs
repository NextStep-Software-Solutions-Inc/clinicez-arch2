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

public record ResendAdminInvitationCommand(Guid Id, string CurrentUser) : IRequest<AdminUserDto>;

public class ResendAdminInvitationCommandHandler(
    IApplicationDbContext context,
    IAdminInvitationNotifier invitationNotifier,
    IFrontendUrlProvider frontendUrlProvider,
    TimeProvider timeProvider
) : IRequestHandler<ResendAdminInvitationCommand, AdminUserDto>
{
    public async Task<AdminUserDto> Handle(ResendAdminInvitationCommand request, CancellationToken cancellationToken)
    {
        var user = await context.AdminUsers
            .Include(u => u.Role)
            .FirstOrDefaultAsync(u => u.Id == request.Id, cancellationToken)
            ?? throw new KeyNotFoundException($"Admin user with ID '{request.Id}' not found.");

        if (user.Status == AdminUserStatus.Suspended)
        {
            throw new InvalidOperationException("Cannot resend invitation for a suspended account.");
        }

        if (user.Status == AdminUserStatus.Revoked)
        {
            throw new InvalidOperationException("Cannot resend a revoked invitation.");
        }

        if (user.Status == AdminUserStatus.Active)
        {
            throw new InvalidOperationException("Cannot resend invitation for an active user.");
        }

        if (user.Status != AdminUserStatus.Invited)
        {
            throw new InvalidOperationException("Cannot resend invitation for this account status.");
        }

        var now = timeProvider.GetUtcNow().UtcDateTime;
        user.InvitationToken = TokenGenerator.GenerateSecureToken(32);
        user.InvitationExpiresAt = now.AddDays(7);
        user.Status = AdminUserStatus.Invited;
        user.UpdatedAt = now;
        user.UpdatedBy = request.CurrentUser;

        invitationNotifier.RequestInvitation(user, user.Role?.Name ?? "Admin", request.CurrentUser);

        await context.SaveChangesAsync(cancellationToken);

        var baseUrl = frontendUrlProvider.GetBaseUrl();
        return AdminUserMapping.ToDto(user, timeProvider, baseUrl);
    }
}
