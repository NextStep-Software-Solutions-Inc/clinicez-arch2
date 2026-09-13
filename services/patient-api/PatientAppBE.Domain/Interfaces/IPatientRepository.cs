using PatientAppBE.Domain.Entities;

namespace PatientAppBE.Domain.Interfaces;

public interface IPatientRepository : IBaseRepository<Patient>
{
    Task<Patient?> GetByClerkUserIdAsync(string clerkUserId, CancellationToken cancellationToken = default);
    Task<Patient?> GetWithProfileAsync(Guid id, CancellationToken cancellationToken = default);
}
