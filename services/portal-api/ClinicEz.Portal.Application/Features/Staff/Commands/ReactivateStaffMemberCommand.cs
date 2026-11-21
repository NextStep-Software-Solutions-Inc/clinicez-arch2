using ClinicEz.Portal.Application.Features.Entitlements;
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

public record ReactivateStaffMemberCommand(
    string TenantSlug,
    Guid StaffMemberId
) : IRequest<StaffMemberDto>;

public class ReactivateStaffMemberCommandValidator : AbstractValidator<ReactivateStaffMemberCommand>
{
    public ReactivateStaffMemberCommandValidator()
    {
        RuleFor(x => x.TenantSlug).NotEmpty().WithMessage("Tenant identifier is required.");
        RuleFor(x => x.StaffMemberId).NotEmpty().WithMessage("Staff member identifier is required.");
    }
}

public class ReactivateStaffMemberCommandHandler(
    IApplicationDbContext context,
    IEntitlementGuard entitlementGuard,
    IClerkMetadataSync clerkMetadata,
    TimeProvider timeProvider
) : IRequestHandler<ReactivateStaffMemberCommand, StaffMemberDto>
{
    public async Task<StaffMemberDto> Handle(ReactivateStaffMemberCommand request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == request.TenantSlug.ToLower() || t.Id.ToString() == request.TenantSlug, cancellationToken)
            ?? throw new KeyNotFoundException($"Workspace '{request.TenantSlug}' not found.");

        var member = await context.WorkspaceMembers
            .FirstOrDefaultAsync(m => m.Id == request.StaffMemberId && m.TenantId == tenant.Id, cancellationToken)
            ?? throw new KeyNotFoundException("Staff member was not found in this workspace.");

        // Check subscription member limits before reactivating
        await entitlementGuard.EnsureCanAddMemberAsync(tenant.Id, cancellationToken);

        member.Status = MemberStatus.Active;

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
