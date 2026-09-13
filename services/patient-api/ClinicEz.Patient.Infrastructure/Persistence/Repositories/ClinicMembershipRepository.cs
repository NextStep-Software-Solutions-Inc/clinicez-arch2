using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Infrastructure.Persistence;

namespace ClinicEz.Patient.Infrastructure.Persistence.Repositories;

public sealed class ClinicMembershipRepository
    : BaseRepository<ClinicMembership>, IClinicMembershipRepository
{
    public ClinicMembershipRepository(ApplicationDbContext context) : base(context) { }

    public Task<ClinicMembership?> GetByPatientAndClinicAsync(Guid patientId, Guid clinicId, CancellationToken ct = default)
        => DbSet.FirstOrDefaultAsync(m => m.PatientId == patientId && m.ClinicId == clinicId, ct);

    public Task<ClinicMembership?> GetByPatientAndClinicWithDeletedAsync(Guid patientId, Guid clinicId, CancellationToken ct = default)
        => DbSet.IgnoreQueryFilters().FirstOrDefaultAsync(m => m.PatientId == patientId && m.ClinicId == clinicId, ct);

    public async Task<IReadOnlyList<ClinicMembership>> GetByPatientAsync(Guid patientId, CancellationToken ct = default)
        => await DbSet.Include(m => m.Clinic)
            .Where(m => m.PatientId == patientId)
            .ToListAsync(ct);
}
