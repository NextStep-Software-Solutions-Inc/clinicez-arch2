using ClinicEz.Portal.Application.Features.Staff.Queries;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Staff.Commands;

public record SuspendStaffMemberCommand(
    string TenantSlug,
    Guid StaffMemberId
) : IRequest<StaffMemberDto>;

public class SuspendStaffMemberCommandValidator : AbstractValidator<SuspendStaffMemberCommand>
{
    public SuspendStaffMemberCommandValidator()
    {
        RuleFor(x => x.TenantSlug).NotEmpty().WithMessage("Tenant identifier is required.");
        RuleFor(x => x.StaffMemberId).NotEmpty().WithMessage("Staff member identifier is required.");
    }
}

public class SuspendStaffMemberCommandHandler(
    IApplicationDbContext context,
    IClerkMetadataSync clerkMetadata,
    TimeProvider timeProvider
) : IRequestHandler<SuspendStaffMemberCommand, StaffMemberDto>
{
    public async Task<StaffMemberDto> Handle(SuspendStaffMemberCommand request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == request.TenantSlug.ToLower() || t.Id.ToString() == request.TenantSlug, cancellationToken)
            ?? throw new KeyNotFoundException($"Workspace '{request.TenantSlug}' not found.");

        var member = await context.WorkspaceMembers
            .FirstOrDefaultAsync(m => m.Id == request.StaffMemberId && m.TenantId == tenant.Id, cancellationToken)
            ?? throw new KeyNotFoundException("Staff member was not found in this workspace.");

        if (member.Role == WorkspaceMemberRole.Owner)
        {
            throw new InvalidOperationException("The primary workspace owner cannot be suspended.");
        }

        member.Status = MemberStatus.Suspended;

        await context.SaveChangesAsync(cancellationToken);

        if (member.UserId is not null)
        {
            await clerkMetadata.SyncAsync(member.UserId, cancellationToken);
        }

        var profile = await context.StaffMembers
            .Include(s => s.Facility)
            .FirstOrDefaultAsync(s => s.WorkspaceMemberId == member.Id, cancellationToken);

        var now = timeProvider.GetUtcNow().UtcDateTime;
        return StaffMemberMapping.ToDto(member, profile, profile?.Facility?.Name, now);
    }
}
