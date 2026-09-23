using ClinicEz.Portal.Application.Interfaces;
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
                return new TenantDto(ownedTenant.TenantSlug, ownedTenant.Name, ownedTenant.TenantType, "Owner", "Active");
            }

            var staffMember = await context.StaffMembers
                .Include(s => s.Tenant)
                .FirstOrDefaultAsync(s => s.UserId == request.OwnerId && s.Status == "Active" && (s.Tenant.TenantSlug.ToLower() == slugLower || s.TenantId.ToString() == slugLower), cancellationToken);

            if (staffMember != null && staffMember.Tenant != null)
            {
                return new TenantDto(staffMember.Tenant.TenantSlug, staffMember.Tenant.Name, staffMember.Tenant.TenantType, staffMember.Role, staffMember.Status);
            }

            return null;
        }

        // 2. Fallback: check any tenant owned by user
        var tenant = await context.Tenants
            .FirstOrDefaultAsync(t => t.OwnerId == request.OwnerId, cancellationToken);

        if (tenant != null)
        {
            return new TenantDto(tenant.TenantSlug, tenant.Name, tenant.TenantType, "Owner", "Active");
        }

        // 3. Fallback: check any active staff membership for user
        var anyStaff = await context.StaffMembers
            .Include(s => s.Tenant)
            .FirstOrDefaultAsync(s => s.UserId == request.OwnerId && s.Status == "Active", cancellationToken);

        if (anyStaff != null && anyStaff.Tenant != null)
        {
            return new TenantDto(anyStaff.Tenant.TenantSlug, anyStaff.Tenant.Name, anyStaff.Tenant.TenantType, anyStaff.Role, anyStaff.Status);
        }

        return null;
    }
}
