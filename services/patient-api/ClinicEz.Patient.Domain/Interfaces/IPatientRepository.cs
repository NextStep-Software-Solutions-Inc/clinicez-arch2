namespace ClinicEz.Patient.Domain.Interfaces;

public interface IPatientRepository : IBaseRepository<ClinicEz.Patient.Domain.Entities.Patient>
{
    Task<ClinicEz.Patient.Domain.Entities.Patient?> GetByClerkUserIdAsync(string clerkUserId, CancellationToken cancellationToken = default);
    Task<ClinicEz.Patient.Domain.Entities.Patient?> GetWithProfileAsync(Guid id, CancellationToken cancellationToken = default);

    /// <summary>True when the patient <paramref name="patientId"/> exists and is linked to the given Clerk user.</summary>
    Task<bool> IsOwnedByAsync(Guid patientId, string clerkUserId, CancellationToken cancellationToken = default);
}
