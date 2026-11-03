using ClinicEz.Patient.Domain.Entities;

namespace ClinicEz.Patient.Domain.Interfaces;

public interface IPatientRepository : IBaseRepository<ClinicEz.Patient.Domain.Entities.Patient>
{
    Task<ClinicEz.Patient.Domain.Entities.Patient?> GetByClerkUserIdAsync(string clerkUserId, CancellationToken cancellationToken = default);
    Task<ClinicEz.Patient.Domain.Entities.Patient?> GetByClerkUserIdWithDetailsAsync(string clerkUserId, CancellationToken cancellationToken = default);

    /// <summary>Retrieves the caller's own patient record for intake autofill with data-minimized child collections (Addresses, GovernmentIds, Allergies).</summary>
    Task<ClinicEz.Patient.Domain.Entities.Patient?> GetForMeByClerkUserIdAsync(string clerkUserId, CancellationToken cancellationToken = default);

    /// <summary>The patient with this ClinicEzId (as stored, e.g. <c>CE-AB12-CD34</c>), or null.</summary>
    Task<ClinicEz.Patient.Domain.Entities.Patient?> GetByClinicEzIdAsync(string clinicEzId, CancellationToken cancellationToken = default);
    Task<ClinicEz.Patient.Domain.Entities.Patient?> GetWithProfileAsync(Guid id, CancellationToken cancellationToken = default);

    /// <summary>True when the patient <paramref name="patientId"/> exists and is linked to the given Clerk user.</summary>
    Task<bool> IsOwnedByAsync(Guid patientId, string clerkUserId, CancellationToken cancellationToken = default);

    /// <summary>The patient's most recent vital-sign measurements, newest first.</summary>
    Task<IReadOnlyList<VitalSigns>> GetRecentVitalsAsync(Guid patientId, int take, CancellationToken cancellationToken = default);

    /// <summary>Records new vital signs for a patient.</summary>
    Task AddVitalSignsAsync(VitalSigns vitalSigns, CancellationToken cancellationToken = default);

    /// <summary>Lists medications for the patient.</summary>
    Task<IReadOnlyList<PatientMedication>> GetMedicationsAsync(Guid patientId, CancellationToken cancellationToken = default);

    /// <summary>Retrieves a specific medication for the patient.</summary>
    Task<PatientMedication?> GetMedicationByIdAsync(Guid patientId, Guid medicationId, CancellationToken cancellationToken = default);

    /// <summary>Vaccinations a facility administered to the patient, newest first.</summary>
    Task<IReadOnlyList<VaccinationAdministered>> GetVaccinationsAdministeredAsync(Guid patientId, CancellationToken cancellationToken = default);

    /// <summary>The patient's single most recent vital-sign measurement, or null.</summary>
    Task<VitalSigns?> GetLatestVitalsAsync(Guid patientId, CancellationToken cancellationToken = default);

    /// <summary>Medication adherence logs for a specific patient and date.</summary>
    Task<IReadOnlyList<PatientMedicationAdherence>> GetMedicationAdherenceForDateAsync(Guid patientId, DateOnly date, CancellationToken cancellationToken = default);

    /// <summary>Records dose adherence for a medication.</summary>
    Task AddMedicationAdherenceAsync(PatientMedicationAdherence adherence, CancellationToken cancellationToken = default);
}
