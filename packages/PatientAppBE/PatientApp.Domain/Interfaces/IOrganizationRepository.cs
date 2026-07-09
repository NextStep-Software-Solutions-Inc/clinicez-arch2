using PatientApp.Domain.Entities;

namespace PatientApp.Domain.Interfaces;

public interface IOrganizationRepository
{
    Task<IReadOnlyList<Organization>> SearchAsync(string? query, int skip, int take, CancellationToken ct = default);
    Task<Organization?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<Organization?> GetBySlugAsync(string slug, CancellationToken ct = default);
    Task<Organization?> GetByInviteCodeAsync(string inviteCode, CancellationToken ct = default);
    Task AddAsync(Organization organization, CancellationToken ct = default);
    void Update(Organization organization);
    Task<int> CountAsync(string? query, CancellationToken ct = default);
    Task<IReadOnlyList<OrganizationRole>> GetRolesAsync(Guid organizationId, CancellationToken ct = default);
}
