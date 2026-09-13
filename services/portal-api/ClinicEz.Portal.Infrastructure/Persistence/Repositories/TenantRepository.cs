using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Domain.Interfaces;
using ClinicEz.Portal.Infrastructure.Persistence;
using Sieve.Services;

namespace ClinicEz.Portal.Infrastructure.Persistence.Repositories;

public class TenantRepository : Repository<Tenant>, ITenantRepository
{
    public TenantRepository(ApplicationDbContext dbContext, ISieveProcessor sieveProcessor) : base(dbContext, sieveProcessor)
    {
    }
}
