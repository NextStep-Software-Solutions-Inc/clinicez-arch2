using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Application.Features.Staff.Queries;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
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

public class ResendStaffInvitationCommandHandler(
    IApplicationDbContext context,
    IStaffInvitationNotifier invitationNotifier,
    TimeProvider timeProvider) : IRequestHandler<ResendStaffInvitationCommand, StaffMemberDto>
{
    public async Task<StaffMemberDto> Handle(ResendStaffInvitationCommand request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == request.TenantSlug.ToLower() || t.Id.ToString() == request.TenantSlug, cancellationToken)
            ?? throw new KeyNotFoundException($"Workspace '{request.TenantSlug}' not found.");

        var member = await context.WorkspaceMembers
            .FirstOrDefaultAsync(m => m.Id == request.StaffMemberId && m.TenantId == tenant.Id, cancellationToken)
            ?? throw new KeyNotFoundException("Staff member was not found in this workspace.");

        if (member.Status == MemberStatus.Active)
        {
            throw new InvalidOperationException("This team member is already an active member of this workspace.");
        }

        var profile = await context.StaffMembers
            .Include(s => s.Facility)
            .FirstOrDefaultAsync(s => s.WorkspaceMemberId == member.Id, cancellationToken);

        // Generate a new secure cryptographic token and reset expiry for 7 days
        member.InvitationToken = Guid.NewGuid().ToString("N");
        member.InvitationExpiresAt = timeProvider.GetUtcNow().UtcDateTime.AddDays(7);
        member.Status = MemberStatus.Invited;

        // Commits atomically with the new token; delivery happens later and is retried.
        invitationNotifier.RequestInvitation(tenant, member, StaffMemberMapping.RoleName(member, profile), profile?.Facility?.Name);

        await context.SaveChangesAsync(cancellationToken);

        return StaffMemberMapping.ToDto(member, profile, profile?.Facility?.Name);
    }
}
