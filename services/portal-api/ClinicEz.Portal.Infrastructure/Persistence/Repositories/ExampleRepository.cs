using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Domain.Interfaces;
using Sieve.Services;

namespace ClinicEz.Portal.Infrastructure.Persistence.Repositories;

public class ExampleRepository(ApplicationDbContext context, ISieveProcessor sieveProcessor) : Repository<ExampleEntity>(context, sieveProcessor), IExampleRepository
{
    // Add any specific implementations for ExampleEntity here
}