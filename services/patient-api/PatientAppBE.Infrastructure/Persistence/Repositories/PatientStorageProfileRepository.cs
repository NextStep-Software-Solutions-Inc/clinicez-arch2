using Microsoft.EntityFrameworkCore;
using PatientAppBE.Domain.Entities;
using PatientAppBE.Domain.Interfaces;

namespace PatientAppBE.Infrastructure.Persistence.Repositories;

internal sealed class PatientStorageProfileRepository : BaseRepository<PatientStorageProfile>, IPatientStorageProfileRepository
{
    public PatientStorageProfileRepository(ApplicationDbContext context) : base(context)
    {
    }

    public async Task<PatientStorageProfile?> GetByPatientIdAsync(Guid patientId, CancellationToken cancellationToken = default)
    {
        return await Context.PatientStorageProfiles
            .FirstOrDefaultAsync(p => p.PatientId == patientId, cancellationToken);
    }
}
