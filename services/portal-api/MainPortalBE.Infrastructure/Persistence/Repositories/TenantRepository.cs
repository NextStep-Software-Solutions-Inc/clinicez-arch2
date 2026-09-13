using MainPortalBE.Domain.Entities;
using MainPortalBE.Domain.Interfaces;
using MainPortalBE.Infrastructure.Persistence;
using Sieve.Services;

namespace MainPortalBE.Infrastructure.Persistence.Repositories;

public class TenantRepository : Repository<Tenant>, ITenantRepository
{
    public TenantRepository(ApplicationDbContext dbContext, ISieveProcessor sieveProcessor) : base(dbContext, sieveProcessor)
    {
    }
}
