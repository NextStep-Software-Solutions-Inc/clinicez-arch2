using ClinicEz.PhilHealthProxy.Domain.Entities;

namespace ClinicEz.PhilHealthProxy.Domain.Interfaces;

public interface ITenantRepository
{
    Task<PhilHealthTenant?> GetByTenantIdAsync(Guid tenantId, CancellationToken cancellationToken = default);
    Task<PhilHealthTenant?> GetByBranchIdAsync(Guid branchId, CancellationToken cancellationToken = default);
    Task<PhilHealthTenant> UpsertTenantAsync(PhilHealthTenant tenant, CancellationToken cancellationToken = default);
}
