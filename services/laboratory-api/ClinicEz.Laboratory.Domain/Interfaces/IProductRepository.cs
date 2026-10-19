using ClinicEz.Laboratory.Domain.Entities;

namespace ClinicEz.Laboratory.Domain.Interfaces;

public interface IProductRepository : IRepository<Product>
{
    // You can add product-specific methods here in the future
    // For example: Task<Product?> GetBySkuAsync(string sku);
}



