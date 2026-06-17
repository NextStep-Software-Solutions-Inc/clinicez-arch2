using PatientApp.Domain.Entities;

namespace PatientApp.Domain.Interfaces;

public interface IClinicMembershipRepository : IBaseRepository<ClinicMembership>
{
    Task<ClinicMembership?> GetByPatientAndClinicAsync(Guid patientId, Guid clinicId, CancellationToken ct = default);
    Task<IReadOnlyList<ClinicMembership>> GetByPatientAsync(Guid patientId, CancellationToken ct = default);
}
