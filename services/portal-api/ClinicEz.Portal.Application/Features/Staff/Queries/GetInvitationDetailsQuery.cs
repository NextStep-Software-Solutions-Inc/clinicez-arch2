using ClinicEz.Portal.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Staff.Queries;

public record InvitationDetailsDto(
    Guid Id,
    string TenantName,
    string TenantSlug,
    string InviteeFullName,
    string InviteeEmail,
    string Role,
    string? FacilityName,
    bool IsExpired,
    bool IsAlreadyAccepted,
    DateTime? ExpiresAt
);

public record GetInvitationDetailsQuery(string Token) : IRequest<InvitationDetailsDto>;

public class GetInvitationDetailsQueryHandler(IApplicationDbContext context) : IRequestHandler<GetInvitationDetailsQuery, InvitationDetailsDto>
{
    public async Task<InvitationDetailsDto> Handle(GetInvitationDetailsQuery request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Token))
        {
            throw new KeyNotFoundException("Invitation token cannot be empty.");
        }

        var member = await context.StaffMembers
            .Include(s => s.Tenant)
            .Include(s => s.Facility)
            .FirstOrDefaultAsync(s => s.InvitationToken == request.Token, cancellationToken)
            ?? throw new KeyNotFoundException("Invitation was not found or is invalid.");

        var isExpired = member.InvitationExpiresAt.HasValue && member.InvitationExpiresAt.Value < DateTime.UtcNow;
        var isAlreadyAccepted = member.Status.Equals("Active", StringComparison.OrdinalIgnoreCase);

        return new InvitationDetailsDto(
            member.Id,
            member.Tenant.Name,
            member.Tenant.TenantSlug,
            member.FullName,
            member.Email,
            member.Role,
            member.Facility?.Name,
            isExpired,
            isAlreadyAccepted,
            member.InvitationExpiresAt
        );
    }
}
