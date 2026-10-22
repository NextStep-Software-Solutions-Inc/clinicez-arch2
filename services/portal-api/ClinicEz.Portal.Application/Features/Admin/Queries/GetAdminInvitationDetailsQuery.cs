using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Admin.DTOs;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Features.Admin.Queries;

public record GetAdminInvitationDetailsQuery(string Token) : IRequest<AdminInvitationDetailsDto?>;

public class GetAdminInvitationDetailsQueryHandler(
    IApplicationDbContext context,
    TimeProvider timeProvider
) : IRequestHandler<GetAdminInvitationDetailsQuery, AdminInvitationDetailsDto?>
{
    public async Task<AdminInvitationDetailsDto?> Handle(GetAdminInvitationDetailsQuery request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Token)) return null;

        var tokenLower = request.Token.Trim().ToLowerInvariant();

        var user = await context.AdminUsers
            .Include(u => u.Role)
            .FirstOrDefaultAsync(u => u.InvitationToken != null && u.InvitationToken.ToLower() == tokenLower, cancellationToken);

        if (user == null) return null;

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var isExpired = user.InvitationExpiresAt.HasValue && user.InvitationExpiresAt.Value < now;
        var isAlreadyAccepted = user.Status == AdminUserStatus.Active && !string.IsNullOrEmpty(user.ClerkUserId);
        var isSuspended = user.Status == AdminUserStatus.Suspended;
        var isRevoked = user.Status == AdminUserStatus.Revoked || isSuspended;

        return new AdminInvitationDetailsDto(
            user.Email,
            user.FullName,
            user.Role?.Name ?? "Admin",
            user.Role?.Description ?? "Platform administrative role",
            user.InvitationExpiresAt,
            isExpired,
            isAlreadyAccepted,
            isRevoked,
            isSuspended
        );
    }
}
