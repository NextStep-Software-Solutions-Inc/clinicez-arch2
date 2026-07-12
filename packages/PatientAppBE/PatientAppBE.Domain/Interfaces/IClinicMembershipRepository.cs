using PatientAppBE.Domain.Entities;

namespace PatientAppBE.Domain.Interfaces;

public interface IClinicMembershipRepository : IBaseRepository<ClinicMembership>
{
    Task<ClinicMembership?> GetByPatientAndClinicAsync(Guid patientId, Guid clinicId, CancellationToken ct = default);
    Task<ClinicMembership?> GetByPatientAndClinicWithDeletedAsync(Guid patientId, Guid clinicId, CancellationToken ct = default);
    Task<IReadOnlyList<ClinicMembership>> GetByPatientAsync(Guid patientId, CancellationToken ct = default);
}
