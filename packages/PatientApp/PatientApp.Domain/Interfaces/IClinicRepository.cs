using PatientApp.Domain.Entities;

namespace PatientApp.Domain.Interfaces;

public interface IClinicRepository
{
    Task<IReadOnlyList<Clinic>> SearchAsync(string? query, int skip, int take, CancellationToken ct = default);
    Task<Clinic?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<IReadOnlyList<Clinic>> GetByOrganizationAsync(Guid organizationId, CancellationToken ct = default);
    Task<IReadOnlyList<Clinic>> GetAllAsync(CancellationToken ct = default);
    Task AddAsync(Clinic clinic, CancellationToken ct = default);
    void Update(Clinic clinic);
    Task<int> CountAsync(string? query, CancellationToken ct = default);
}
