using PatientApp.Domain.Entities;
using PatientApp.Domain.Interfaces;

namespace PatientApp.Infrastructure.Persistence.Repositories;

public sealed class ProviderAvailabilityRepository : BaseRepository<ProviderAvailability>, IProviderAvailabilityRepository
{
    public ProviderAvailabilityRepository(ApplicationDbContext context) : base(context)
    {
    }
}
