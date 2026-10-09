using ClinicEz.Patient.Domain.Entities;

namespace ClinicEz.Patient.Domain.Interfaces;

public interface IDeviceSessionRepository : IBaseRepository<DeviceSession>
{
    /// <summary>Returns every non-revoked session of the patient, most recently active first.</summary>
    Task<IReadOnlyList<DeviceSession>> GetActiveByPatientIdAsync(
        Guid patientId,
        CancellationToken cancellationToken = default);

    /// <summary>Returns the non-revoked session registered for the given device, or null.</summary>
    Task<DeviceSession?> GetActiveByDeviceAsync(
        Guid patientId,
        string deviceId,
        CancellationToken cancellationToken = default);

    /// <summary>Returns the non-revoked session with the given id if it belongs to the patient, or null.</summary>
    Task<DeviceSession?> GetActiveByIdAsync(
        Guid patientId,
        Guid sessionId,
        CancellationToken cancellationToken = default);

    /// <summary>Soft-revokes all active sessions for the patient and stamps RevokedAt.</summary>
    Task<IReadOnlyList<DeviceSession>> RevokeAllForPatientAsync(
        Guid patientId,
        CancellationToken cancellationToken = default);
}
