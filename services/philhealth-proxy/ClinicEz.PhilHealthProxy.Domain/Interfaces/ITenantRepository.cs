using ClinicEz.PhilHealthProxy.Domain.Entities;

namespace ClinicEz.PhilHealthProxy.Domain.Interfaces;

public interface ITenantRepository
{
    Task<PhilHealthTenant?> GetByTenantIdAsync(Guid tenantId, CancellationToken cancellationToken = default);
    Task<PhilHealthTenant?> GetByBranchIdAsync(Guid branchId, CancellationToken cancellationToken = default);
    Task<PhilHealthTenant> UpsertTenantAsync(PhilHealthTenant tenant, CancellationToken cancellationToken = default);

    /// <summary>
    /// Explicitly evicts cached credentials for a tenant and optional branch upon credential rotation.
    /// </summary>
    void InvalidateCache(Guid tenantId, Guid? branchId = null);
}
