using PatientAppBE.Domain.Entities;

namespace PatientAppBE.Domain.Interfaces;

public interface IPatientStorageProfileRepository : IBaseRepository<PatientStorageProfile>
{
    Task<PatientStorageProfile?> GetByPatientIdAsync(Guid patientId, CancellationToken cancellationToken = default);
}
