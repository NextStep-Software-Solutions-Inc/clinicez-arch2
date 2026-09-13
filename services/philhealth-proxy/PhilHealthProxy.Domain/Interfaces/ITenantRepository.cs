using PhilHealthProxy.Domain.Entities;

namespace PhilHealthProxy.Domain.Interfaces;

public interface ITenantRepository
{
    Task<PhilHealthTenant?> GetByTenantIdAsync(Guid tenantId, CancellationToken cancellationToken = default);
}
