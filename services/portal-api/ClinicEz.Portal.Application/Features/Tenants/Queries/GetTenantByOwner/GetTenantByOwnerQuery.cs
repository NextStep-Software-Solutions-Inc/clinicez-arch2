using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Tenants.Queries.GetTenantByOwner;

public record GetTenantByOwnerQuery(string OwnerId, string? TenantSlug = null) : IRequest<TenantDto?>;

public record TenantDto(
    string TenantSlug, 
    string Name, 
    string TenantType, 
    string Role = "Owner", 
    string Status = "Active"
);

public class GetTenantByOwnerQueryHandler(IApplicationDbContext context) : IRequestHandler<GetTenantByOwnerQuery, TenantDto?>
{
    public async Task<TenantDto?> Handle(GetTenantByOwnerQuery request, CancellationToken cancellationToken)
    {
        // 1. If TenantSlug is specified, check owner first, then active staff member of that workspace
        if (!string.IsNullOrWhiteSpace(request.TenantSlug))
        {
            var slugLower = request.TenantSlug.Trim().ToLowerInvariant();

            var ownedTenant = await context.Tenants
                .FirstOrDefaultAsync(t => t.OwnerId == request.OwnerId && (t.TenantSlug.ToLower() == slugLower || t.Id.ToString() == slugLower), cancellationToken);

            if (ownedTenant != null)
            {
                return new TenantDto(ownedTenant.TenantSlug, ownedTenant.Name, ownedTenant.TenantType, "Owner", StatusOf(ownedTenant, "Active"));
            }

            var staffMember = await context.WorkspaceMembers
                .Include(m => m.Tenant)
                .FirstOrDefaultAsync(m => m.UserId == request.OwnerId && m.Status == MemberStatus.Active && (m.Tenant.TenantSlug.ToLower() == slugLower || m.TenantId.ToString() == slugLower), cancellationToken);

            if (staffMember != null && staffMember.Tenant != null)
            {
                return new TenantDto(staffMember.Tenant.TenantSlug, staffMember.Tenant.Name, staffMember.Tenant.TenantType, staffMember.Role.ToString(), StatusOf(staffMember.Tenant, "Active"));
            }

            return null;
        }

        // 2. Fallback: check any tenant owned by user
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.OwnerId == request.OwnerId, cancellationToken);

        if (tenant != null)
        {
            return new TenantDto(tenant.TenantSlug, tenant.Name, tenant.TenantType, "Owner", StatusOf(tenant, "Active"));
        }

        // 3. Fallback: check any active membership for user
        var anyStaff = await context.WorkspaceMembers
            .Include(m => m.Tenant)
            .FirstOrDefaultAsync(m => m.UserId == request.OwnerId && m.Status == MemberStatus.Active, cancellationToken);

        if (anyStaff != null && anyStaff.Tenant != null)
        {
            return new TenantDto(anyStaff.Tenant.TenantSlug, anyStaff.Tenant.Name, anyStaff.Tenant.TenantType, anyStaff.Role.ToString(), StatusOf(anyStaff.Tenant, "Active"));
        }

        return null;
    }

    /// <summary>An archived workspace reports "Archived" so clients can close it; otherwise the member's own status.</summary>
    private static string StatusOf(Domain.Entities.Tenant tenant, string memberStatus) =>
        tenant.ArchivedAt != null ? "Archived" : memberStatus;
}
