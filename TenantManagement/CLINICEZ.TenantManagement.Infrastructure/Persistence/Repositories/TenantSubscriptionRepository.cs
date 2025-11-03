using CLINICEZ.TenantManagement.Domain.Entities;
using CLINICEZ.TenantManagement.Domain.Interfaces;
using Sieve.Services;

namespace CLINICEZ.TenantManagement.Infrastructure.Persistence.Repositories;

public class TenantSubscriptionRepository(ApplicationDbContext context, ISieveProcessor sieveProcessor) : Repository<TenantSubscription>(context, sieveProcessor), ITenantSubscriptionRepository
{

    // You can add tenant subscription-specific methods here in the future.
    // For example:
    // public async Task<TenantSubscription?> GetBySubscriptionCodeAsync(string subscriptionCode)
    // {
    //     return await _context.TenantSubscriptions.FirstOrDefaultAsync(ts => ts.SubscriptionCode == subscriptionCode);
}