using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Admin.DTOs;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Features.Admin.Commands;

public record RevokeAdminInvitationCommand(Guid Id, string CurrentUser, string? CurrentClerkUserId = null) : IRequest<AdminUserDto>;

public class RevokeAdminInvitationCommandHandler(
    IApplicationDbContext context,
    IFrontendUrlProvider frontendUrlProvider,
    TimeProvider timeProvider
) : IRequestHandler<RevokeAdminInvitationCommand, AdminUserDto>
{
    public async Task<AdminUserDto> Handle(RevokeAdminInvitationCommand request, CancellationToken cancellationToken)
    {
        var user = await context.AdminUsers
            .Include(u => u.Role)
            .FirstOrDefaultAsync(u => u.Id == request.Id, cancellationToken)
            ?? throw new KeyNotFoundException($"Admin user with ID '{request.Id}' not found.");

        if (!string.IsNullOrEmpty(request.CurrentClerkUserId) && user.ClerkUserId == request.CurrentClerkUserId)
        {
            throw new InvalidOperationException("You cannot revoke your own admin account.");
        }

        var now = timeProvider.GetUtcNow().UtcDateTime;
        user.Status = AdminUserStatus.Revoked;
        user.IsActive = false;
        user.UpdatedAt = now;
        user.UpdatedBy = request.CurrentUser;

        await context.SaveChangesAsync(cancellationToken);

        var baseUrl = frontendUrlProvider.GetBaseUrl();
        return AdminUserMapping.ToDto(user, timeProvider, baseUrl);
    }
}
