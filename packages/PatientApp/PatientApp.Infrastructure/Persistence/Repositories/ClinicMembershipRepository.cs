using Microsoft.EntityFrameworkCore;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Interfaces;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Persistence.Repositories;

public sealed class ClinicMembershipRepository
    : BaseRepository<ClinicMembership>, IClinicMembershipRepository
{
    public ClinicMembershipRepository(ApplicationDbContext context) : base(context) { }

    public Task<ClinicMembership?> GetByPatientAndClinicAsync(Guid patientId, Guid clinicId, CancellationToken ct = default)
        => DbSet.FirstOrDefaultAsync(m => m.PatientId == patientId && m.ClinicId == clinicId, ct);

    public async Task<IReadOnlyList<ClinicMembership>> GetByPatientAsync(Guid patientId, CancellationToken ct = default)
        => await DbSet.Include(m => m.Clinic)
            .Where(m => m.PatientId == patientId)
            .ToListAsync(ct);
}
