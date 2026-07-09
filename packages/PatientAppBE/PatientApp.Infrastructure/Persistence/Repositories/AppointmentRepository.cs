using Microsoft.EntityFrameworkCore;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Interfaces;

namespace PatientApp.Infrastructure.Persistence.Repositories;

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
