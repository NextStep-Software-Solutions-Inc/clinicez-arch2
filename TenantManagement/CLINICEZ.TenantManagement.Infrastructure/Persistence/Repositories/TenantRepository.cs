using CLINICEZ.TenantManagement.Domain.Entities;
using CLINICEZ.TenantManagement.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;
using Sieve.Services;

namespace CLINICEZ.TenantManagement.Infrastructure.Persistence.Repositories;

public class TenantRepository(ApplicationDbContext context, ISieveProcessor sieveProcessor) : Repository<Tenant>(context, sieveProcessor), ITenantRepository
{
    // You can add tenant-specific methods here in the future
    // For example: Task<Tenant?> GetByDomainAsync(string domain);
}