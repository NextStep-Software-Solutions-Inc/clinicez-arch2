using CLINICEZ.TenantManagement.Domain.Entities;
using CLINICEZ.TenantManagement.Domain.Interfaces;
using Sieve.Services;

namespace CLINICEZ.TenantManagement.Infrastructure.Persistence.Repositories;

public class TenantMemberRepository(ApplicationDbContext context, ISieveProcessor sieveProcessor) : Repository<TenantMember>(context, sieveProcessor), ITenantMemberRepository
{
}