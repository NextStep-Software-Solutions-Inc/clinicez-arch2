using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Application.Features.Staff.Queries;
using ClinicEz.Portal.Application.Features.Workspace;
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

public record InviteStaffMemberCommand(
    string TenantSlug,
    string Email,
    string FullName,
    string Role,
    Guid? FacilityId = null
) : IRequest<StaffMemberDto>;

public class InviteStaffMemberCommandValidator : AbstractValidator<InviteStaffMemberCommand>
{
    private static readonly string[] AllowedRoles = [
        "Admin", 
        "Billing",
        "Biller", 
        "Viewer",
        "Facility Administrator"
    ];

    public InviteStaffMemberCommandValidator()
    {
        RuleFor(x => x.TenantSlug).NotEmpty().WithMessage("Tenant identifier is required.");
        RuleFor(x => x.Email).NotEmpty().EmailAddress().WithMessage("A valid email address is required.");
        RuleFor(x => x.FullName).NotEmpty().MinimumLength(2).WithMessage("Full name must be at least 2 characters.");
        RuleFor(x => x.Role).Must(r => AllowedRoles.Contains(r))
            .WithMessage($"Role must be one of: {string.Join(", ", AllowedRoles)}");
    }
}

public class InviteStaffMemberCommandHandler(
    IApplicationDbContext context,
    IEntitlementGuard entitlementGuard,
    IStaffInvitationNotifier invitationNotifier,
    TimeProvider timeProvider
) : IRequestHandler<InviteStaffMemberCommand, StaffMemberDto>
{
    public async Task<StaffMemberDto> Handle(InviteStaffMemberCommand request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == request.TenantSlug.ToLower() || t.Id.ToString() == request.TenantSlug, cancellationToken)
            ?? throw new KeyNotFoundException($"Workspace '{request.TenantSlug}' not found.");

        // Guard the plan's member limit and the subscription state
        await entitlementGuard.EnsureCanAddMemberAsync(tenant.Id, cancellationToken);

        var emailLower = request.Email.Trim().ToLowerInvariant();

        var allowedDomains = await context.WorkspaceSettings
            .AsNoTracking()
            .Where(s => s.TenantId == tenant.Id)
            .Select(s => s.AllowedInviteDomains)
            .FirstOrDefaultAsync(cancellationToken);
        if (!InviteDomains.IsAllowed(allowedDomains, emailLower))
        {
            throw new InvalidOperationException(
                $"Invitations are limited to these email domains: {string.Join(", ", InviteDomains.Parse(allowedDomains))}.");
        }
        var existing = await context.WorkspaceMembers
            .AnyAsync(m => m.TenantId == tenant.Id && m.Email.ToLower() == emailLower, cancellationToken);

        if (existing)
        {
            throw new InvalidOperationException($"A team member with email '{request.Email}' already exists or has an active invitation in this workspace.");
        }

        string? facilityName = null;
        if (request.FacilityId.HasValue)
        {
            var facility = await context.Facilities
                .FirstOrDefaultAsync(f => f.Id == request.FacilityId.Value && f.TenantId == tenant.Id, cancellationToken);
            if (facility == null)
            {
                throw new InvalidOperationException("Selected facility does not exist within this workspace.");
            }
            facilityName = facility.Name;
        }

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var newMember = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            Email = emailLower,
            FullName = request.FullName.Trim(),
            Role = StaffMemberMapping.WorkspaceRoleFor(request.Role),
            Status = MemberStatus.Invited,
            InvitationToken = Guid.NewGuid().ToString("N"),
            InvitationExpiresAt = now.AddDays(7),
            CreatedAt = now,
            CreatedBy = tenant.OwnerId
        };
        context.WorkspaceMembers.Add(newMember);

        StaffMember? profile = null;
        if (StaffMemberMapping.NeedsProfile(request.Role, request.FacilityId))
        {
            profile = new StaffMember
            {
                Id = Guid.NewGuid(),
                TenantId = tenant.Id,
                WorkspaceMemberId = newMember.Id,
                FacilityId = request.FacilityId,
                Role = request.Role,
                CreatedAt = now,
                CreatedBy = tenant.OwnerId
            };
            context.StaffMembers.Add(profile);
        }

        var currentMemberCount = await context.WorkspaceMembers.CountAsync(m => m.TenantId == tenant.Id, cancellationToken);
        tenant.StaffAccountsCount = currentMemberCount + 1;

        // The email request commits atomically with the invitation; delivery happens later and is retried.
        invitationNotifier.RequestInvitation(tenant, newMember, StaffMemberMapping.RoleName(newMember, profile), facilityName);

        await context.SaveChangesAsync(cancellationToken);

        return StaffMemberMapping.ToDto(newMember, profile, facilityName);
    }
}
