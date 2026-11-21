using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Staff.Commands;

public record RevokeStaffMemberCommand(
    string TenantSlug,
    Guid StaffMemberId,
    string? CurrentUserId = null
) : IRequest<bool>;

public class RevokeStaffMemberCommandValidator : AbstractValidator<RevokeStaffMemberCommand>
{
    public RevokeStaffMemberCommandValidator()
    {
        RuleFor(x => x.TenantSlug).NotEmpty();
        RuleFor(x => x.StaffMemberId).NotEmpty();
    }
}

public class RevokeStaffMemberCommandHandler(
    IApplicationDbContext context,
    IClerkMetadataSync clerkMetadata) : IRequestHandler<RevokeStaffMemberCommand, bool>
{
    public async Task<bool> Handle(RevokeStaffMemberCommand request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == request.TenantSlug.ToLower() || t.Id.ToString() == request.TenantSlug, cancellationToken)
            ?? throw new KeyNotFoundException($"Workspace '{request.TenantSlug}' not found.");

        var member = await context.WorkspaceMembers
            .FirstOrDefaultAsync(m => m.Id == request.StaffMemberId && m.TenantId == tenant.Id, cancellationToken)
            ?? throw new KeyNotFoundException("Staff member not found in this workspace.");

        if (member.Role == WorkspaceMemberRole.Owner)
        {
            throw new InvalidOperationException("The primary workspace owner cannot be revoked or removed.");
        }

        if (!string.IsNullOrWhiteSpace(request.CurrentUserId) &&
            !string.IsNullOrWhiteSpace(member.UserId) &&
            string.Equals(member.UserId.Trim(), request.CurrentUserId.Trim(), StringComparison.Ordinal))
        {
            throw new InvalidOperationException("You cannot revoke your own workspace access.");
        }

        member.Status = MemberStatus.Revoked;

        var currentMemberCount = await context.WorkspaceMembers.CountAsync(
            m => m.TenantId == tenant.Id && m.Status != MemberStatus.Revoked && m.Status != MemberStatus.Suspended, cancellationToken);
        tenant.StaffAccountsCount = Math.Max(1, currentMemberCount);

        await context.SaveChangesAsync(cancellationToken);

        if (member.UserId is not null)
        {
            await clerkMetadata.SyncAsync(member.UserId, cancellationToken);
        }
        return true;
    }
}
