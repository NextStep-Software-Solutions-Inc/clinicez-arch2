using ClinicEz.Portal.Application.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Staff.Commands;

public record RevokeStaffMemberCommand(
    string TenantSlug,
    Guid StaffMemberId
) : IRequest<bool>;

public class RevokeStaffMemberCommandValidator : AbstractValidator<RevokeStaffMemberCommand>
{
    public RevokeStaffMemberCommandValidator()
    {
        RuleFor(x => x.TenantSlug).NotEmpty();
        RuleFor(x => x.StaffMemberId).NotEmpty();
    }
}

public class RevokeStaffMemberCommandHandler(IApplicationDbContext context) : IRequestHandler<RevokeStaffMemberCommand, bool>
{
    public async Task<bool> Handle(RevokeStaffMemberCommand request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == request.TenantSlug.ToLower() || t.Id.ToString() == request.TenantSlug, cancellationToken)
            ?? throw new KeyNotFoundException($"Workspace '{request.TenantSlug}' not found.");

        var member = await context.StaffMembers
            .FirstOrDefaultAsync(s => s.Id == request.StaffMemberId && s.TenantId == tenant.Id, cancellationToken)
            ?? throw new KeyNotFoundException("Staff member not found in this workspace.");

        if (string.Equals(member.Role, "Owner", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("The primary workspace owner cannot be revoked or removed.");
        }

        context.StaffMembers.Remove(member);

        var currentStaffCount = await context.StaffMembers.CountAsync(s => s.TenantId == tenant.Id, cancellationToken);
        tenant.StaffAccountsCount = Math.Max(1, currentStaffCount - 1);

        await context.SaveChangesAsync(cancellationToken);
        return true;
    }
}
