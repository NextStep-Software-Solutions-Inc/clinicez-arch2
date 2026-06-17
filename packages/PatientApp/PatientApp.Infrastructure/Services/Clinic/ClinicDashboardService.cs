using System.Net.Http.Headers;
using System.Text.Json;
using CLINICEZ.Shared.Exceptions;
using Microsoft.Extensions.Logging;
using PatientApp.Application.Common.DTOs;
using PatientApp.Application.Common.Interfaces;

namespace PatientApp.Infrastructure.Services.Clinic;

public sealed class ClinicDashboardService : IClinicDashboardService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<ClinicDashboardService> _logger;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public ClinicDashboardService(IHttpClientFactory httpClientFactory, ILogger<ClinicDashboardService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task<ClinicAppointmentsResponse> GetAppointmentsAsync(
        string clinicBaseUrl,
        Guid patientId,
        string bearerToken,
        CancellationToken cancellationToken = default)
    {
        var requestUrl = $"{clinicBaseUrl.TrimEnd('/')}/api/v1/appointments?patientId={patientId}";

        _logger.LogDebug("Fetching appointments for patient {PatientId} from {Url}", patientId, requestUrl);

        try
        {
            var client = _httpClientFactory.CreateClient("ClinicDashboard");

            using var request = new HttpRequestMessage(HttpMethod.Get, requestUrl);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearerToken);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            var response = await client.SendAsync(request, cancellationToken);
            response.EnsureSuccessStatusCode();

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            var result = await JsonSerializer.DeserializeAsync<ClinicAppointmentsResponse>(
                stream, JsonOptions, cancellationToken);

            return result ?? new ClinicAppointmentsResponse([], 0);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "HTTP error calling Clinic Dashboard at {BaseUrl}", clinicBaseUrl);
            throw new ServiceUnavailableException(
                $"The Clinic Dashboard at '{clinicBaseUrl}' is unavailable. Please try again later.");
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning("Request to Clinic Dashboard at {BaseUrl} timed out.", clinicBaseUrl);
            throw new ServiceUnavailableException(
                $"The request to the Clinic Dashboard at '{clinicBaseUrl}' timed out.");
        }
    }

    public async Task<string?> SubmitBookingAsync(
        string clinicBaseUrl, Guid patientId, Guid bookingDraftId,
        string shareFieldsJson, string bearerToken, CancellationToken cancellationToken = default)
    {
        // The Clinic Dashboard booking API is not yet fully developed.
        // This stub accepts the request and returns a synthetic booking reference.
        _logger.LogInformation(
            "Booking submission stub: patient {PatientId} draft {DraftId} → {BaseUrl}",
            patientId, bookingDraftId, clinicBaseUrl);

        return await Task.FromResult($"PENDING-{bookingDraftId:N}");
    }
}
