using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Infrastructure.Persistence.Repositories;

public sealed class AppointmentRepository : BaseRepository<Appointment>, IAppointmentRepository
{
    public AppointmentRepository(ApplicationDbContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<Appointment>> GetByPatientAsync(Guid patientId, CancellationToken ct = default)
    {
        return await DbSet
            .Where(x => x.PatientId == patientId && !x.IsDeleted)
            .OrderByDescending(x => x.ScheduledAt)
            .ToListAsync(ct);
    }
}
