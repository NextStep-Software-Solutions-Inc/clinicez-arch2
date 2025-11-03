using Portal.Domain.Entities;
using Portal.Domain.Interfaces;
using Sieve.Services;

namespace Portal.Infrastructure.Persistence.Repositories;

public class ExampleRepository(ApplicationDbContext context, ISieveProcessor sieveProcessor) : Repository<ExampleEntity>(context, sieveProcessor), IExampleRepository
{
    // Add any specific implementations for ExampleEntity here
}