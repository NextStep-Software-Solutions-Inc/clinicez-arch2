using System;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.DTOs;
using ClinicEz.Clinic.Application.Common.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Services;

public sealed class PatientWebhookNotifier : IPatientWebhookNotifier
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<PatientWebhookNotifier> _logger;
    private readonly string _webhookEndpoint;

    public PatientWebhookNotifier(
        HttpClient httpClient,
        IConfiguration configuration,
        ILogger<PatientWebhookNotifier> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
        
        var baseUrl = configuration["PatientApi:BaseUrl"] ?? "http://localhost:5000";
        var endpoint = configuration["PatientApi:ClinicPushEndpoint"] ?? "/api/v1/appointments/clinic-push";
        _webhookEndpoint = $"{baseUrl.TrimEnd('/')}/{endpoint.TrimStart('/')}";
    }

    public async Task<bool> PushAppointmentUpdateAsync(ClinicPushAppointmentsPayload payload, CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("[ClinicPush] Pushing appointment update for patient {PatientId} to {Endpoint}", 
                payload.PatientId, _webhookEndpoint);

            var response = await _httpClient.PostAsJsonAsync(_webhookEndpoint, payload, cancellationToken);
            if (response.IsSuccessStatusCode)
            {
                _logger.LogInformation("[ClinicPush] Successfully synced appointment with patient-api");
                return true;
            }

            _logger.LogWarning("[ClinicPush] Patient API webhook returned non-success code {StatusCode}", response.StatusCode);
            return false;
        }
        catch (Exception ex)
        {
            // Resilient handling: never break clinical on-premise operations due to transient cloud/WAN network drops
            _logger.LogWarning(ex, "[ClinicPush] Could not push appointment update to patient-api. Local queue operation preserved.");
            return false;
        }
    }
}
