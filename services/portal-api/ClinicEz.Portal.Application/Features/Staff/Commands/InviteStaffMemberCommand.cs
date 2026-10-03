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
        "Biller", 
        "Viewer",
        "Facility Administrator", 
        "Attending Physician", 
        "Medical Technologist", 
        "Registered Pharmacist", 
        "Phlebotomist", 
        "Cashier/Billing Staff"
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
    ITenantFeatureGuard tenantFeatureGuard
) : IRequestHandler<InviteStaffMemberCommand, StaffMemberDto>
{
    public async Task<StaffMemberDto> Handle(InviteStaffMemberCommand request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == request.TenantSlug.ToLower() || t.Id.ToString() == request.TenantSlug, cancellationToken)
            ?? throw new KeyNotFoundException($"Workspace '{request.TenantSlug}' not found.");

        // Guard plan seat quotas & 14-day trial evaluation window
        await tenantFeatureGuard.EnsureCanCreateStaffAsync(tenant.Id.ToString(), cancellationToken);

        var emailLower = request.Email.Trim().ToLowerInvariant();
        var existing = await context.StaffMembers
            .FirstOrDefaultAsync(s => s.TenantId == tenant.Id && s.Email.ToLower() == emailLower, cancellationToken);

        if (existing != null)
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

        var newMember = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            Email = emailLower,
            FullName = request.FullName.Trim(),
            Role = request.Role,
            Status = "PendingInvitation",
            FacilityId = request.FacilityId,
            InvitationToken = Guid.NewGuid().ToString("N"),
            InvitationExpiresAt = DateTime.UtcNow.AddDays(7),
            CreatedAt = DateTime.UtcNow,
            CreatedBy = tenant.OwnerId
        };

        context.StaffMembers.Add(newMember);

        var currentStaffCount = await context.StaffMembers.CountAsync(s => s.TenantId == tenant.Id, cancellationToken);
        tenant.StaffAccountsCount = currentStaffCount + 1;

        await context.SaveChangesAsync(cancellationToken);

        return new StaffMemberDto(
            newMember.Id,
            newMember.UserId,
            newMember.Email,
            newMember.FullName,
            newMember.Role,
            newMember.Status,
            newMember.FacilityId,
            facilityName,
            newMember.JoinedAt,
            newMember.CreatedAt,
            newMember.InvitationToken,
            newMember.InvitationExpiresAt
        );
    }
}
