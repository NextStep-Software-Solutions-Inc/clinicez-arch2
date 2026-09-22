using ClinicEz.Portal.Application.Features.Staff.Queries;
using ClinicEz.Portal.Application.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Staff.Commands;

public record ResendStaffInvitationCommand(
    string TenantSlug,
    Guid StaffMemberId
) : IRequest<StaffMemberDto>;

public class ResendStaffInvitationCommandValidator : AbstractValidator<ResendStaffInvitationCommand>
{
    public ResendStaffInvitationCommandValidator()
    {
        RuleFor(x => x.TenantSlug).NotEmpty().WithMessage("Tenant identifier is required.");
        RuleFor(x => x.StaffMemberId).NotEmpty().WithMessage("Staff member identifier is required.");
    }
}

public class ResendStaffInvitationCommandHandler(IApplicationDbContext context) : IRequestHandler<ResendStaffInvitationCommand, StaffMemberDto>
{
    public async Task<StaffMemberDto> Handle(ResendStaffInvitationCommand request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == request.TenantSlug.ToLower() || t.Id.ToString() == request.TenantSlug, cancellationToken)
            ?? throw new KeyNotFoundException($"Workspace '{request.TenantSlug}' not found.");

        var member = await context.StaffMembers
            .Include(s => s.Facility)
            .FirstOrDefaultAsync(s => s.Id == request.StaffMemberId && s.TenantId == tenant.Id, cancellationToken)
            ?? throw new KeyNotFoundException("Staff member was not found in this workspace.");

        if (member.Status.Equals("Active", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("This team member is already an active member of this workspace.");
        }

        // Generate a new secure cryptographic token and reset expiry for 7 days
        member.InvitationToken = Guid.NewGuid().ToString("N");
        member.InvitationExpiresAt = DateTime.UtcNow.AddDays(7);
        member.Status = "PendingInvitation";

        await context.SaveChangesAsync(cancellationToken);

        return new StaffMemberDto(
            member.Id,
            member.UserId,
            member.Email,
            member.FullName,
            member.Role,
            member.Status,
            member.FacilityId,
            member.Facility?.Name,
            member.JoinedAt,
            member.CreatedAt,
            member.InvitationToken,
            member.InvitationExpiresAt
        );
    }
}
