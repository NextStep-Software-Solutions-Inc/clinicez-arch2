using PatientAppBE.Domain.Entities;

namespace PatientAppBE.Domain.Interfaces;

public interface IOrganizationMembershipRepository : IBaseRepository<OrganizationMembership>
{
    Task<OrganizationMembership?> GetByPatientAndOrgAsync(Guid patientId, Guid organizationId, CancellationToken ct = default);
    Task<OrganizationMembership?> GetByPatientAndOrgWithDeletedAsync(Guid patientId, Guid organizationId, CancellationToken ct = default);
    Task<IReadOnlyList<OrganizationMembership>> GetByPatientAsync(Guid patientId, CancellationToken ct = default);
}
