using ClinicEz.Patient.Domain.Entities;

namespace ClinicEz.Patient.Domain.Interfaces;

public interface IPatientStorageProfileRepository : IBaseRepository<PatientStorageProfile>
{
    Task<PatientStorageProfile?> GetByPatientIdAsync(Guid patientId, CancellationToken cancellationToken = default);
}
