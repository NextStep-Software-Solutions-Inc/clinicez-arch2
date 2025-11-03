using CLINICEZ.TenantManagement.Domain.Entities;

namespace CLINICEZ.TenantManagement.Domain.Interfaces;

public interface ITenantSettingRepository : IRepository<TenantSetting>
{
    // You can add product-specific methods here in the future
    // For example: Task<Product?> GetBySkuAsync(string sku);
}