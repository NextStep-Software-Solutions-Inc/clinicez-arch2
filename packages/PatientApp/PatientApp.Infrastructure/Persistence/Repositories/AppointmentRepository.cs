using PatientApp.Domain.Entities;
using PatientApp.Domain.Interfaces;

namespace PatientApp.Infrastructure.Persistence.Repositories;

public sealed class AppointmentRepository : BaseRepository<Appointment>, IAppointmentRepository
{
    public AppointmentRepository(ApplicationDbContext context) : base(context)
    {
    }
}
