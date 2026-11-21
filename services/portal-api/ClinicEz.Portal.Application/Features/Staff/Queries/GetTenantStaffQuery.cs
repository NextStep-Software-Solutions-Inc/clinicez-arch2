using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Interfaces;
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

public class GetTenantStaffQueryHandler(
    IApplicationDbContext context,
    IEntitlementService entitlements) : IRequestHandler<GetTenantStaffQuery, TenantStaffResultDto>
{
    public async Task<TenantStaffResultDto> Handle(GetTenantStaffQuery request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.TenantSlug.ToLower() == request.TenantSlug.ToLower() || t.Id.ToString() == request.TenantSlug, cancellationToken)
            ?? throw new KeyNotFoundException($"Tenant with slug '{request.TenantSlug}' was not found.");

        var members = await context.WorkspaceMembers
            .Where(m => m.TenantId == tenant.Id)
            .OrderBy(m => m.Role == WorkspaceMemberRole.Owner ? 0 : 1)
            .ThenByDescending(m => m.CreatedAt)
            .ToListAsync(cancellationToken);

        var profiles = await context.StaffMembers
            .Include(s => s.Facility)
            .Where(s => s.TenantId == tenant.Id)
            .ToListAsync(cancellationToken);
        var profileByMember = profiles.ToDictionary(p => p.WorkspaceMemberId);

        var now = DateTime.UtcNow;
        var memberDtos = members.Select(m =>
        {
            profileByMember.TryGetValue(m.Id, out var profile);
            return StaffMemberMapping.ToDto(m, profile, profile?.Facility?.Name, now);
        }).ToList();

        var snapshot = await entitlements.ResolveAsync(tenant.Id, cancellationToken);
        var limit = snapshot.Limit(EntitlementKeys.LimitMembers);
        var maxAllowed = limit >= int.MaxValue ? int.MaxValue : (int)limit;
        var counted = members.Count(m => m.Status != MemberStatus.Suspended && m.Status != MemberStatus.Revoked);

        var quotaDto = new StaffQuotaDto(
            counted,
            maxAllowed,
            snapshot.PlanName,
            counted >= maxAllowed
        );

        return new TenantStaffResultDto(memberDtos, quotaDto);
    }
}
