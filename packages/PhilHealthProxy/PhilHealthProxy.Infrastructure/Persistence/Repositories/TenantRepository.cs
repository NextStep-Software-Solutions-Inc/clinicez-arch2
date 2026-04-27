using Microsoft.EntityFrameworkCore;
using PhilHealthProxy.Domain.Entities;
using PhilHealthProxy.Domain.Interfaces;
using PhilHealthProxy.Infrastructure.Persistence;

namespace PhilHealthProxy.Infrastructure.Persistence.Repositories;

public sealed class TenantRepository(ApplicationDbContext dbContext) : ITenantRepository
{
    public Task<PhilHealthTenant?> GetByTenantIdAsync(
        Guid tenantId,
        CancellationToken cancellationToken = default)
        => dbContext.PhilHealthTenants
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.TenantId == tenantId && t.IsActive, cancellationToken);
}
