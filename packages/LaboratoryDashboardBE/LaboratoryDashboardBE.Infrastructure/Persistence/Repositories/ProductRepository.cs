using LaboratoryDashboardBE.Domain.Entities;
using LaboratoryDashboardBE.Domain.Interfaces;
using Sieve.Services;

namespace LaboratoryDashboardBE.Infrastructure.Persistence.Repositories;

public class ProductRepository(ApplicationDbContext context, ISieveProcessor sieveProcessor) : Repository<Product>(context, sieveProcessor), IProductRepository
{

    // You can add product-specific methods here in the future.
    // For example:
    // public async Task<Product?> GetBySkuAsync(string sku)
    // {
    //     return await _context.Products.FirstOrDefaultAsync(p => p.Sku == sku);
    // }
}



