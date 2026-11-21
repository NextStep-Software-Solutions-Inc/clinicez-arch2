using ClinicEz.Portal.Application.Features.Staff.Queries;
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

public record UpdateStaffMemberCommand(
    string TenantSlug,
    Guid StaffMemberId,
    string FullName,
    string Role,
    Guid? FacilityId = null
) : IRequest<StaffMemberDto>;

public class UpdateStaffMemberCommandValidator : AbstractValidator<UpdateStaffMemberCommand>
{
    private static readonly string[] AllowedRoles = [
        "Admin",
        "Billing",
        "Biller",
        "Viewer",
        "Facility Administrator",
        "Owner"
    ];

    public UpdateStaffMemberCommandValidator()
    {
        RuleFor(x => x.TenantSlug).NotEmpty().WithMessage("Tenant identifier is required.");
        RuleFor(x => x.StaffMemberId).NotEmpty().WithMessage("Staff member identifier is required.");
        RuleFor(x => x.FullName).NotEmpty().MinimumLength(2).WithMessage("Full name must be at least 2 characters.");
        RuleFor(x => x.Role).Must(r => AllowedRoles.Contains(r))
            .WithMessage($"Role must be one of: {string.Join(", ", AllowedRoles)}");
    }
}

public class UpdateStaffMemberCommandHandler(
    IApplicationDbContext context,
    IClerkMetadataSync clerkMetadata,
    TimeProvider timeProvider
) : IRequestHandler<UpdateStaffMemberCommand, StaffMemberDto>
{
    public async Task<StaffMemberDto> Handle(UpdateStaffMemberCommand request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == request.TenantSlug.ToLower() || t.Id.ToString() == request.TenantSlug, cancellationToken)
            ?? throw new KeyNotFoundException($"Workspace '{request.TenantSlug}' not found.");

        var member = await context.WorkspaceMembers
            .FirstOrDefaultAsync(m => m.Id == request.StaffMemberId && m.TenantId == tenant.Id, cancellationToken)
            ?? throw new KeyNotFoundException("Staff member was not found in this workspace.");

        if (member.Role == WorkspaceMemberRole.Owner && request.Role != "Owner")
        {
            throw new InvalidOperationException("The workspace owner role cannot be changed.");
        }

        if (member.Role != WorkspaceMemberRole.Owner && request.Role == "Owner")
        {
            throw new InvalidOperationException("Ownership cannot be assigned via staff update.");
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
        member.FullName = request.FullName.Trim();
        if (member.Role != WorkspaceMemberRole.Owner)
        {
            member.Role = StaffMemberMapping.WorkspaceRoleFor(request.Role);
        }

        var profile = await context.StaffMembers
            .Include(s => s.Facility)
            .FirstOrDefaultAsync(s => s.WorkspaceMemberId == member.Id, cancellationToken);

        if (StaffMemberMapping.NeedsProfile(request.Role, request.FacilityId))
        {
            if (profile != null)
            {
                profile.Role = request.Role;
                profile.FacilityId = request.FacilityId;
            }
            else
            {
                profile = new StaffMember
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenant.Id,
                    WorkspaceMemberId = member.Id,
                    FacilityId = request.FacilityId,
                    Role = request.Role,
                    CreatedAt = now,
                    CreatedBy = tenant.OwnerId
                };
                context.StaffMembers.Add(profile);
            }
        }
        else if (profile != null)
        {
            context.StaffMembers.Remove(profile);
            profile = null;
        }

        await context.SaveChangesAsync(cancellationToken);

        if (member.UserId is not null)
        {
            await clerkMetadata.SyncAsync(member.UserId, cancellationToken);
        }

        return StaffMemberMapping.ToDto(member, profile, facilityName ?? profile?.Facility?.Name, now);
    }
}
