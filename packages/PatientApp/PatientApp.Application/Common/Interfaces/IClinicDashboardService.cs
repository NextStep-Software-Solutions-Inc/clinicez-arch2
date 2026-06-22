using PatientApp.Application.Common.DTOs;

namespace PatientApp.Application.Common.Interfaces;

public interface IClinicDashboardService
{
    Task<ClinicAppointmentsResponse> GetAppointmentsAsync(
        string clinicBaseUrl, Guid patientId, string bearerToken, CancellationToken cancellationToken = default);

    /// <summary>
    /// Forwards a booking request to the clinic's backend.
    /// Returns the server-assigned appointment/booking ID.
    /// The clinic Dashboard API is not yet fully developed — this method stubs a 202 response.
    /// </summary>
    Task<string?> SubmitBookingAsync(
        string clinicBaseUrl, Guid patientId, Guid bookingDraftId,
        string shareFieldsJson, string attachedFileIdsJson, string bearerToken, CancellationToken cancellationToken = default);
}
