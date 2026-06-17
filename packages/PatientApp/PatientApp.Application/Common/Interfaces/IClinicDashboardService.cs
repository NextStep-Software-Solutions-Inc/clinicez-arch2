using PatientApp.Application.Common.DTOs;

namespace PatientApp.Application.Common.Interfaces;

/// <summary>
/// Abstracts HTTP communication with a per-tenant Clinic Dashboard backend.
/// Each clinic hosts its own instance (on-prem or cloud); the base URL is
/// registered during onboarding and passed in at call time.
/// </summary>
public interface IClinicDashboardService
{
    /// <summary>
    /// Fetches the appointment list for a patient from a specific clinic's backend.
    /// </summary>
    /// <param name="clinicBaseUrl">Registered base URL for the clinic's backend (e.g. "https://clinic.example.com").</param>
    /// <param name="patientId">Server-side patient ID.</param>
    /// <param name="bearerToken">The patient's JWT from the current request, forwarded for service-to-service auth.</param>
    Task<ClinicAppointmentsResponse> GetAppointmentsAsync(
        string clinicBaseUrl,
        Guid patientId,
        string bearerToken,
        CancellationToken cancellationToken = default);
}
