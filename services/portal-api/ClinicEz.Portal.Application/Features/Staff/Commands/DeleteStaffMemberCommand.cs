using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Staff.Commands;

public record DeleteStaffMemberCommand(
    string TenantSlug,
    Guid StaffMemberId
) : IRequest<bool>;

public class DeleteStaffMemberCommandValidator : AbstractValidator<DeleteStaffMemberCommand>
{
    public DeleteStaffMemberCommandValidator()
    {
        RuleFor(x => x.TenantSlug).NotEmpty();
        RuleFor(x => x.StaffMemberId).NotEmpty();
    }
}

public class DeleteStaffMemberCommandHandler(
    IApplicationDbContext context,
    IClerkMetadataSync clerkMetadata) : IRequestHandler<DeleteStaffMemberCommand, bool>
{
    public async Task<bool> Handle(DeleteStaffMemberCommand request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == request.TenantSlug.ToLower() || t.Id.ToString() == request.TenantSlug, cancellationToken)
            ?? throw new KeyNotFoundException($"Workspace '{request.TenantSlug}' not found.");

        var member = await context.WorkspaceMembers
            .FirstOrDefaultAsync(m => m.Id == request.StaffMemberId && m.TenantId == tenant.Id, cancellationToken)
            ?? throw new KeyNotFoundException("Staff member not found in this workspace.");

        if (member.Role == WorkspaceMemberRole.Owner)
        {
            throw new InvalidOperationException("The primary workspace owner cannot be removed.");
        }

        if (member.Status != MemberStatus.Revoked)
        {
            throw new InvalidOperationException("Only revoked workspace members can be permanently deleted. Please revoke their access first.");
        }

        var profiles = await context.StaffMembers
            .Where(s => s.WorkspaceMemberId == member.Id)
            .ToListAsync(cancellationToken);

        if (profiles.Count > 0)
        {
            context.StaffMembers.RemoveRange(profiles);
        }

        var clerkUserId = member.UserId;
        context.WorkspaceMembers.Remove(member);

        var currentMemberCount = await context.WorkspaceMembers.CountAsync(
            m => m.TenantId == tenant.Id && m.Id != member.Id && m.Status != MemberStatus.Revoked && m.Status != MemberStatus.Suspended,
            cancellationToken);
        tenant.StaffAccountsCount = Math.Max(1, currentMemberCount);

        await context.SaveChangesAsync(cancellationToken);

        if (clerkUserId is not null)
        {
            await clerkMetadata.SyncAsync(clerkUserId, cancellationToken);
        }

        return true;
    }
}
