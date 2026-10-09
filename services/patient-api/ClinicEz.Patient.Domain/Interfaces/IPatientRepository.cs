using ClinicEz.Patient.Domain.Entities;

namespace ClinicEz.Patient.Domain.Interfaces;

public interface IPatientRepository : IBaseRepository<ClinicEz.Patient.Domain.Entities.Patient>
{
    Task<ClinicEz.Patient.Domain.Entities.Patient?> GetByClerkUserIdAsync(string clerkUserId, CancellationToken cancellationToken = default);

    /// <summary>The patient with this ClinicEzId (as stored, e.g. <c>CE-AB12-CD34</c>), or null.</summary>
    Task<ClinicEz.Patient.Domain.Entities.Patient?> GetByClinicEzIdAsync(string clinicEzId, CancellationToken cancellationToken = default);
    Task<ClinicEz.Patient.Domain.Entities.Patient?> GetWithProfileAsync(Guid id, CancellationToken cancellationToken = default);

    /// <summary>True when the patient <paramref name="patientId"/> exists and is linked to the given Clerk user.</summary>
    Task<bool> IsOwnedByAsync(Guid patientId, string clerkUserId, CancellationToken cancellationToken = default);

    /// <summary>The patient's most recent vital-sign measurements, newest first.</summary>
    Task<IReadOnlyList<VitalSigns>> GetRecentVitalsAsync(Guid patientId, int take, CancellationToken cancellationToken = default);

    /// <summary>Vaccinations a facility administered to the patient, newest first.</summary>
    Task<IReadOnlyList<VaccinationAdministered>> GetVaccinationsAdministeredAsync(Guid patientId, CancellationToken cancellationToken = default);
}
