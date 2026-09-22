using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Constants;
using ClinicEz.Portal.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Staff.Queries;

public record StaffMemberDto(
    Guid Id,
    string? UserId,
    string Email,
    string FullName,
    string Role,
    string Status,
    Guid? FacilityId,
    string? FacilityName,
    DateTime? JoinedAt,
    DateTime CreatedAt,
    string? InvitationToken = null,
    DateTime? InvitationExpiresAt = null
);

public record StaffQuotaDto(
    int CurrentCount,
    int MaxAllowed,
    string PlanTitle,
    bool IsQuotaReached
);

public record TenantStaffResultDto(
    List<StaffMemberDto> Members,
    StaffQuotaDto Quota
);

public record GetTenantStaffQuery(string TenantSlug) : IRequest<TenantStaffResultDto>;

public class GetTenantStaffQueryHandler(IApplicationDbContext context) : IRequestHandler<GetTenantStaffQuery, TenantStaffResultDto>
{
    public async Task<TenantStaffResultDto> Handle(GetTenantStaffQuery request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == request.TenantSlug.ToLower() || t.Id.ToString() == request.TenantSlug, cancellationToken)
            ?? throw new KeyNotFoundException($"Tenant with slug '{request.TenantSlug}' was not found.");

        var members = await context.StaffMembers
            .Include(s => s.Facility)
            .Where(s => s.TenantId == tenant.Id)
            .OrderBy(s => s.Role == "Owner" ? 0 : 1)
            .ThenByDescending(s => s.CreatedAt)
            .ToListAsync(cancellationToken);

        // Auto-provision initial Owner StaffMember if this workspace has not seeded it yet
        if (members.Count == 0)
        {
            var fullName = $"{tenant.FirstName} {tenant.LastName}".Trim();
            if (string.IsNullOrWhiteSpace(fullName))
            {
                fullName = string.IsNullOrWhiteSpace(tenant.Name) ? "Workspace Administrator" : tenant.Name;
            }

            var ownerStaff = new StaffMember
            {
                TenantId = tenant.Id,
                UserId = tenant.OwnerId,
                Email = string.IsNullOrWhiteSpace(tenant.Email) ? "admin@clinicez.ph" : tenant.Email,
                FullName = fullName,
                Role = "Owner",
                Status = "Active",
                JoinedAt = tenant.CreatedAt,
                CreatedAt = tenant.CreatedAt,
                CreatedBy = tenant.OwnerId
            };

            context.StaffMembers.Add(ownerStaff);
            tenant.StaffAccountsCount = 1;
            await context.SaveChangesAsync(cancellationToken);
            members = new List<StaffMember> { ownerStaff };
        }

        var effectivePlanId = tenant.SubscriptionPlanId;
        if (string.IsNullOrEmpty(effectivePlanId) && tenant.SubscriptionStatus == "TRIALING")
        {
            effectivePlanId = "starter";
        }

        var limits = PlanFeaturesConfig.GetLimitsForPlan(effectivePlanId);
        var maxAllowed = limits?.MaxStaff ?? 3;
        var planTitle = limits?.PlanTitle ?? "Starter";

        var memberDtos = members.Select(m => new StaffMemberDto(
            m.Id,
            m.UserId,
            m.Email,
            m.FullName,
            m.Role,
            m.Status,
            m.FacilityId,
            m.Facility != null ? m.Facility.Name : null,
            m.JoinedAt,
            m.CreatedAt,
            m.InvitationToken,
            m.InvitationExpiresAt
        )).ToList();

        var quotaDto = new StaffQuotaDto(
            members.Count,
            maxAllowed,
            planTitle,
            members.Count >= maxAllowed
        );

        return new TenantStaffResultDto(memberDtos, quotaDto);
    }
}
