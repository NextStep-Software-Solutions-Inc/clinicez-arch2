using PatientApp.Domain.Entities;

namespace PatientApp.Domain.Interfaces;

public interface IAppointmentRepository : IBaseRepository<Appointment>
{
    Task<IReadOnlyList<Appointment>> GetByPatientAsync(Guid patientId, CancellationToken ct = default);
}
