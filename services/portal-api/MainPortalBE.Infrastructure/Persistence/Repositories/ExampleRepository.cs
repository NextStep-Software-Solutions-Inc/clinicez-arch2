using MainPortalBE.Domain.Entities;
using MainPortalBE.Domain.Interfaces;
using Sieve.Services;

namespace MainPortalBE.Infrastructure.Persistence.Repositories;

public class ExampleRepository(ApplicationDbContext context, ISieveProcessor sieveProcessor) : Repository<ExampleEntity>(context, sieveProcessor), IExampleRepository
{
    // Add any specific implementations for ExampleEntity here
}