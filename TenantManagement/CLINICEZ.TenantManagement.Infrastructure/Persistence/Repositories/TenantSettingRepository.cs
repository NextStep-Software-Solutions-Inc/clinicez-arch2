using CLINICEZ.TenantManagement.Domain.Entities;
using CLINICEZ.TenantManagement.Domain.Interfaces;
using Sieve.Services;

namespace CLINICEZ.TenantManagement.Infrastructure.Persistence.Repositories;

public class TenantSettingRepository(ApplicationDbContext context, ISieveProcessor sieveProcessor) : Repository<TenantSetting>(context, sieveProcessor), ITenantSettingRepository
{

    // You can add tenant setting-specific methods here in the future.
    // For example:
    // public async Task<TenantSetting?> GetByKeyAsync(string key)
    // {
    //     return await _context.TenantSettings.FirstOrDefaultAsync(ts => ts.Key == key);
}