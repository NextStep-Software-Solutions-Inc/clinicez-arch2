using PatientApp.Domain.Entities;

namespace PatientApp.Domain.Interfaces;

public interface IPatientStorageProfileRepository : IBaseRepository<PatientStorageProfile>
{
    Task<PatientStorageProfile?> GetByPatientIdAsync(Guid patientId, CancellationToken cancellationToken = default);
}
