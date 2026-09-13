using ClinicEz.Patient.Domain.Entities;

namespace ClinicEz.Patient.Domain.Interfaces;

public interface IDeviceSessionRepository : IBaseRepository<DeviceSession>
{
    /// <summary>Returns the single non-revoked session for a patient, or null.</summary>
    Task<DeviceSession?> GetActiveByPatientIdAsync(
        Guid patientId,
        CancellationToken cancellationToken = default);

    /// <summary>Soft-revokes all active sessions for the patient and stamps RevokedAt.</summary>
    Task RevokeAllForPatientAsync(
        Guid patientId,
        string revokedBy,
        CancellationToken cancellationToken = default);
}
