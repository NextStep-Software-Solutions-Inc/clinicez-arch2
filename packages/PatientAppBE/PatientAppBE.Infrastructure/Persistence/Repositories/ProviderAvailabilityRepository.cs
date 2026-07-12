using PatientAppBE.Domain.Entities;
using PatientAppBE.Domain.Interfaces;

namespace PatientAppBE.Infrastructure.Persistence.Repositories;

public sealed class ProviderAvailabilityRepository : BaseRepository<ProviderAvailability>, IProviderAvailabilityRepository
{
    public ProviderAvailabilityRepository(ApplicationDbContext context) : base(context)
    {
    }
}
