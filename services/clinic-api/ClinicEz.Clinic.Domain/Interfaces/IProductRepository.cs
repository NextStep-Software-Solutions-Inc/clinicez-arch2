using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Domain.Interfaces;

public interface IProductRepository : IRepository<Product>
{
    // You can add product-specific methods here in the future
    // For example: Task<Product?> GetBySkuAsync(string sku);
}


