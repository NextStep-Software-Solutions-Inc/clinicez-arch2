using Microsoft.EntityFrameworkCore;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Interfaces;

namespace PatientApp.Infrastructure.Persistence.Repositories;

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
