using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Interfaces;
using Sieve.Services;

namespace ClinicEz.Laboratory.Infrastructure.Persistence.Repositories;

public class ProductRepository(ApplicationDbContext context, ISieveProcessor sieveProcessor) : Repository<Product>(context, sieveProcessor), IProductRepository
{

    // You can add product-specific methods here in the future.
    // For example:
    // public async Task<Product?> GetBySkuAsync(string sku)
    // {
    //     return await _context.Products.FirstOrDefaultAsync(p => p.Sku == sku);
    // }
}



