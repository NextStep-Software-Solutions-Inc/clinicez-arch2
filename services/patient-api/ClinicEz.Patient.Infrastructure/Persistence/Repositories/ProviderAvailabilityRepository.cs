using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Infrastructure.Persistence.Repositories;

public sealed class ProviderAvailabilityRepository : BaseRepository<ProviderAvailability>, IProviderAvailabilityRepository
{
    public ProviderAvailabilityRepository(ApplicationDbContext context) : base(context)
    {
    }
}
