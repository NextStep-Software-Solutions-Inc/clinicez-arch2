using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Shared.Common;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Infrastructure.Clinic;

public sealed class ClinicApiClient : IClinicApiClient
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<ClinicApiClient> _logger;
    private readonly JsonSerializerOptions _jsonOptions = new() { PropertyNameCaseInsensitive = true };

    public ClinicApiClient(HttpClient httpClient, ILogger<ClinicApiClient> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
    }

    private HttpRequestMessage CreateRequest(HttpMethod method, string path, string tenantId, Guid? branchId = null)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.TryAddWithoutValidation("X-Tenant-Id", tenantId);
        if (branchId.HasValue)
        {
            request.Headers.TryAddWithoutValidation("X-Branch-Id", branchId.Value.ToString());
        }
        return request;
    }

    public async Task<ApiResponse<List<PortalEligibleYakapEncounterDto>>> GetEligibleEncountersAsync(
        string tenantId,
        Guid branchId,
        string reportTagging,
        DateTime? startDate,
        DateTime? endDate,
        CancellationToken ct = default)
    {
        var url = $"api/v1/yakap/encounters/eligible?reportTagging={Uri.EscapeDataString(reportTagging)}&branchId={branchId}";
        if (startDate.HasValue) url += $"&startDate={startDate.Value:O}";
        if (endDate.HasValue) url += $"&endDate={endDate.Value:O}";

        using var request = CreateRequest(HttpMethod.Get, url, tenantId, branchId);
        using var response = await _httpClient.SendAsync(request, ct);

        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync(ct);
            _logger.LogError("Failed to get eligible encounters from clinic-api. Status: {Status}, Content: {Error}", response.StatusCode, err);
            return ApiResponse<List<PortalEligibleYakapEncounterDto>>.Fail($"Clinic API returned {response.StatusCode}: {err}");
        }

        var result = await response.Content.ReadFromJsonAsync<ApiResponse<List<PortalEligibleYakapEncounterDto>>>(_jsonOptions, ct);
        return result ?? ApiResponse<List<PortalEligibleYakapEncounterDto>>.Fail("Invalid JSON response from Clinic API");
    }

    public async Task<ApiResponse<IReadOnlyList<PortalYakapTransmittalDto>>> GetTransmittalsAsync(
        string tenantId,
        Guid branchId,
        string? status,
        string? reportTagging,
        CancellationToken ct = default)
    {
        var url = $"api/v1/yakap/transmittals?branchId={branchId}";
        if (!string.IsNullOrWhiteSpace(status)) url += $"&status={Uri.EscapeDataString(status)}";
        if (!string.IsNullOrWhiteSpace(reportTagging)) url += $"&reportTagging={Uri.EscapeDataString(reportTagging)}";

        using var request = CreateRequest(HttpMethod.Get, url, tenantId, branchId);
        using var response = await _httpClient.SendAsync(request, ct);

        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync(ct);
            _logger.LogError("Failed to get transmittals from clinic-api. Status: {Status}, Content: {Error}", response.StatusCode, err);
            return ApiResponse<IReadOnlyList<PortalYakapTransmittalDto>>.Fail($"Clinic API returned {response.StatusCode}: {err}");
        }

        var result = await response.Content.ReadFromJsonAsync<ApiResponse<IReadOnlyList<PortalYakapTransmittalDto>>>(_jsonOptions, ct);
        return result ?? ApiResponse<IReadOnlyList<PortalYakapTransmittalDto>>.Fail("Invalid JSON response from Clinic API");
    }

    public async Task<ApiResponse<PortalYakapTransmittalDto>> GetTransmittalByIdAsync(
        string tenantId,
        Guid id,
        CancellationToken ct = default)
    {
        using var request = CreateRequest(HttpMethod.Get, $"api/v1/yakap/transmittals/{id}", tenantId);
        using var response = await _httpClient.SendAsync(request, ct);

        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync(ct);
            return ApiResponse<PortalYakapTransmittalDto>.Fail($"Clinic API returned {response.StatusCode}: {err}");
        }

        var result = await response.Content.ReadFromJsonAsync<ApiResponse<PortalYakapTransmittalDto>>(_jsonOptions, ct);
        return result ?? ApiResponse<PortalYakapTransmittalDto>.Fail("Invalid JSON response from Clinic API");
    }

    public async Task<ApiResponse<string>> GetTransmittalRawXmlAsync(
        string tenantId,
        Guid id,
        CancellationToken ct = default)
    {
        using var request = CreateRequest(HttpMethod.Get, $"api/v1/yakap/transmittals/{id}/xml", tenantId);
        using var response = await _httpClient.SendAsync(request, ct);

        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync(ct);
            return ApiResponse<string>.Fail($"Clinic API returned {response.StatusCode}: {err}");
        }

        var result = await response.Content.ReadFromJsonAsync<ApiResponse<string>>(_jsonOptions, ct);
        return result ?? ApiResponse<string>.Fail("Invalid JSON response from Clinic API");
    }

    public async Task<ApiResponse<PortalYakapTransmittalDto>> CreateTransmittalAsync(
        string tenantId,
        Guid branchId,
        PortalCreateYakapTransmittalRequest requestPayload,
        CancellationToken ct = default)
    {
        using var request = CreateRequest(HttpMethod.Post, "api/v1/yakap/transmittals", tenantId, branchId);
        request.Content = JsonContent.Create(new
        {
            ConsultationEncounterIds = requestPayload.ConsultationEncounterIds,
            ReportTagging = requestPayload.ReportTagging,
            EffectiveYear = requestPayload.EffectiveYear,
            BranchId = branchId
        });

        using var response = await _httpClient.SendAsync(request, ct);

        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync(ct);
            _logger.LogError("Failed to create transmittal in clinic-api. Status: {Status}, Content: {Error}", response.StatusCode, err);
            return ApiResponse<PortalYakapTransmittalDto>.Fail($"Clinic API returned {response.StatusCode}: {err}");
        }

        var result = await response.Content.ReadFromJsonAsync<ApiResponse<PortalYakapTransmittalDto>>(_jsonOptions, ct);
        return result ?? ApiResponse<PortalYakapTransmittalDto>.Fail("Invalid JSON response from Clinic API");
    }

    public async Task<ApiResponse<PortalYakapValidationResultDto>> ValidateTransmittalAsync(
        string tenantId,
        Guid id,
        CancellationToken ct = default)
    {
        using var request = CreateRequest(HttpMethod.Post, $"api/v1/yakap/transmittals/{id}/validate", tenantId);
        using var response = await _httpClient.SendAsync(request, ct);

        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync(ct);
            return ApiResponse<PortalYakapValidationResultDto>.Fail($"Clinic API returned {response.StatusCode}: {err}");
        }

        var result = await response.Content.ReadFromJsonAsync<ApiResponse<PortalYakapValidationResultDto>>(_jsonOptions, ct);
        return result ?? ApiResponse<PortalYakapValidationResultDto>.Fail("Invalid JSON response from Clinic API");
    }

    public async Task<ApiResponse<PortalYakapSubmissionResultDto>> SubmitTransmittalAsync(
        string tenantId,
        Guid branchId,
        Guid id,
        CancellationToken ct = default)
    {
        using var request = CreateRequest(HttpMethod.Post, $"api/v1/yakap/transmittals/{id}/submit", tenantId, branchId);
        using var response = await _httpClient.SendAsync(request, ct);

        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync(ct);
            return ApiResponse<PortalYakapSubmissionResultDto>.Fail($"Clinic API returned {response.StatusCode}: {err}");
        }

        var result = await response.Content.ReadFromJsonAsync<ApiResponse<PortalYakapSubmissionResultDto>>(_jsonOptions, ct);
        return result ?? ApiResponse<PortalYakapSubmissionResultDto>.Fail("Invalid JSON response from Clinic API");
    }
}
