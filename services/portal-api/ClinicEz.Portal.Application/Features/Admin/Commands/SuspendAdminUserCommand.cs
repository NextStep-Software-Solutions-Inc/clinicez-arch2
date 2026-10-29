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

public record SuspendAdminUserCommand(Guid Id, string CurrentUser, string? CurrentClerkUserId = null) : IRequest<AdminUserDto>;

public class SuspendAdminUserCommandHandler(
    IApplicationDbContext context,
    IFrontendUrlProvider frontendUrlProvider,
    TimeProvider timeProvider
) : IRequestHandler<SuspendAdminUserCommand, AdminUserDto>
{
    public async Task<AdminUserDto> Handle(SuspendAdminUserCommand request, CancellationToken cancellationToken)
    {
        var user = await context.AdminUsers
            .Include(u => u.Role)
            .FirstOrDefaultAsync(u => u.Id == request.Id, cancellationToken)
            ?? throw new KeyNotFoundException($"Admin user with ID '{request.Id}' not found.");

        if (!string.IsNullOrEmpty(request.CurrentClerkUserId) && user.ClerkUserId == request.CurrentClerkUserId)
        {
            throw new InvalidOperationException("You cannot suspend your own account.");
        }

        var now = timeProvider.GetUtcNow().UtcDateTime;
        user.Status = AdminUserStatus.Suspended;
        user.IsActive = false;
        user.UpdatedAt = now;
        user.UpdatedBy = request.CurrentUser;

        await context.SaveChangesAsync(cancellationToken);

        var baseUrl = frontendUrlProvider.GetAdminBaseUrl() ?? frontendUrlProvider.GetBaseUrl();
        return AdminUserMapping.ToDto(user, timeProvider, baseUrl);
    }
}
