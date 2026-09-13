using Microsoft.EntityFrameworkCore;
using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Infrastructure.Persistence;

namespace ClinicEz.PhilHealthProxy.Infrastructure.Persistence.Repositories;

public sealed class TenantRepository(ApplicationDbContext dbContext) : ITenantRepository
{
    public Task<PhilHealthTenant?> GetByTenantIdAsync(
        Guid tenantId,
        CancellationToken cancellationToken = default)
        => dbContext.PhilHealthTenants
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.TenantId == tenantId && t.IsActive, cancellationToken);
}
