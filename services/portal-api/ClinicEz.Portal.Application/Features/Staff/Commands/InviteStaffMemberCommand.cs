using ClinicEz.Portal.Application.Common;
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
    Guid? FacilityId = null,
    bool SendEmail = true
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
            .FirstOrDefaultAsync(m => m.TenantId == tenant.Id && m.Email.ToLower() == emailLower, cancellationToken);

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

        if (existing != null)
        {
            if (existing.Status == MemberStatus.Revoked)
            {
                // Reactivate / re-invite revoked member with fresh token and 7-day expiry
                existing.FullName = request.FullName.Trim();
                existing.Role = StaffMemberMapping.WorkspaceRoleFor(request.Role);
                existing.Status = MemberStatus.Invited;
                existing.InvitationToken = TokenGenerator.GenerateSecureToken();
                existing.InvitationExpiresAt = now.AddDays(7);
                existing.JoinedAt = null;

                StaffMember? existingProfile = await context.StaffMembers
                    .FirstOrDefaultAsync(s => s.WorkspaceMemberId == existing.Id, cancellationToken);

                if (StaffMemberMapping.NeedsProfile(request.Role, request.FacilityId))
                {
                    if (existingProfile != null)
                    {
                        existingProfile.FacilityId = request.FacilityId;
                        existingProfile.Role = request.Role;
                    }
                    else
                    {
                        existingProfile = new StaffMember
                        {
                            Id = Guid.NewGuid(),
                            TenantId = tenant.Id,
                            WorkspaceMemberId = existing.Id,
                            FacilityId = request.FacilityId,
                            Role = request.Role,
                            CreatedAt = now,
                            CreatedBy = tenant.OwnerId
                        };
                        context.StaffMembers.Add(existingProfile);
                    }
                }
                else if (existingProfile != null)
                {
                    context.StaffMembers.Remove(existingProfile);
                    existingProfile = null;
                }

                await context.SaveChangesAsync(cancellationToken);

                if (request.SendEmail)
                {
                    invitationNotifier.RequestInvitation(tenant, existing, StaffMemberMapping.RoleName(existing, existingProfile), facilityName);
                }

                return StaffMemberMapping.ToDto(existing, existingProfile, facilityName, now);
            }

            throw new InvalidOperationException($"A team member with email '{request.Email}' already exists or has an active invitation in this workspace.");
        }

        var newMember = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            Email = emailLower,
            FullName = request.FullName.Trim(),
            Role = StaffMemberMapping.WorkspaceRoleFor(request.Role),
            Status = MemberStatus.Invited,
            InvitationToken = TokenGenerator.GenerateSecureToken(),
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

        var currentMemberCount = await context.WorkspaceMembers.CountAsync(m => m.TenantId == tenant.Id && m.Status != MemberStatus.Revoked && m.Status != MemberStatus.Suspended, cancellationToken);
        tenant.StaffAccountsCount = currentMemberCount + 1;

        await context.SaveChangesAsync(cancellationToken);

        if (request.SendEmail)
        {
            invitationNotifier.RequestInvitation(tenant, newMember, StaffMemberMapping.RoleName(newMember, profile), facilityName);
        }

        return StaffMemberMapping.ToDto(newMember, profile, facilityName, now);
    }
}
