using CLINICEZ.TenantManagement.Domain.Entities;

namespace CLINICEZ.TenantManagement.Domain.Interfaces;

public interface ITenantSubscriptionRepository : IRepository<TenantSubscription>
{
    // You can add product-specific methods here in the future
    // For example: Task<Product?> GetBySkuAsync(string sku);
}