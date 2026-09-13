namespace ClinicEz.Patient.Application.Common.Interfaces;

/// <summary>Enforces the single-device-per-patient session policy via Redis.</summary>
public interface ISessionService
{
    Task SetSessionAsync(Guid patientId, string deviceId, string deviceLabel, string clerkSessionId, TimeSpan expiry, CancellationToken cancellationToken = default);
    Task<ActiveSession?> GetSessionAsync(Guid patientId, CancellationToken cancellationToken = default);
    Task<bool> IsSessionValidAsync(Guid patientId, string deviceId, string clerkSessionId, CancellationToken cancellationToken = default);
    Task RevokeSessionAsync(Guid patientId, CancellationToken cancellationToken = default);
}

public sealed record ActiveSession(
    string DeviceId,
    string DeviceLabel,
    string ClerkSessionId,
    DateTime IssuedAt);
