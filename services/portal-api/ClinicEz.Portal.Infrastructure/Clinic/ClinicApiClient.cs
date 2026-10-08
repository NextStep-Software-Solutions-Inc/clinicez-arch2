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

    private async Task<ApiResponse<T>> SendAsync<T>(
        HttpRequestMessage request,
        string operationDescription,
        CancellationToken ct)
    {
        try
        {
            using var response = await _httpClient.SendAsync(request, ct);

            if (!response.IsSuccessStatusCode)
            {
                var err = await response.Content.ReadAsStringAsync(ct);
                _logger.LogError("Failed to {Operation} from clinic-api. Status: {Status}, Content: {Error}",
                    operationDescription, response.StatusCode, err);
                return ApiResponse<T>.Fail($"Clinic API returned {(int)response.StatusCode} ({response.StatusCode}): {err}");
            }

            var result = await response.Content.ReadFromJsonAsync<ApiResponse<T>>(_jsonOptions, ct);
            return result ?? ApiResponse<T>.Fail("Invalid JSON response from Clinic API");
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Network error communicating with Clinic API at {BaseAddress} during {Operation}",
                _httpClient.BaseAddress, operationDescription);
            return ApiResponse<T>.Fail($"Unable to connect to Clinic API at {_httpClient.BaseAddress} ({ex.Message}). Please check if the Clinic API service is running and properly configured.");
        }
        catch (OperationCanceledException ex) when (!ct.IsCancellationRequested)
        {
            _logger.LogError(ex, "Timeout communicating with Clinic API at {BaseAddress} during {Operation}",
                _httpClient.BaseAddress, operationDescription);
            return ApiResponse<T>.Fail($"Request to Clinic API timed out at {_httpClient.BaseAddress}.");
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Unexpected error communicating with Clinic API at {BaseAddress} during {Operation}",
                _httpClient.BaseAddress, operationDescription);
            return ApiResponse<T>.Fail($"Unexpected error calling Clinic API: {ex.Message}");
        }
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
        return await SendAsync<List<PortalEligibleYakapEncounterDto>>(request, "get eligible encounters", ct);
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
        return await SendAsync<IReadOnlyList<PortalYakapTransmittalDto>>(request, "get transmittals", ct);
    }

    public async Task<ApiResponse<PortalYakapTransmittalDto>> GetTransmittalByIdAsync(
        string tenantId,
        Guid id,
        CancellationToken ct = default)
    {
        using var request = CreateRequest(HttpMethod.Get, $"api/v1/yakap/transmittals/{id}", tenantId);
        return await SendAsync<PortalYakapTransmittalDto>(request, $"get transmittal {id}", ct);
    }

    public async Task<ApiResponse<string>> GetTransmittalRawXmlAsync(
        string tenantId,
        Guid id,
        CancellationToken ct = default)
    {
        using var request = CreateRequest(HttpMethod.Get, $"api/v1/yakap/transmittals/{id}/xml", tenantId);
        return await SendAsync<string>(request, $"get transmittal XML {id}", ct);
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

        return await SendAsync<PortalYakapTransmittalDto>(request, "create transmittal", ct);
    }

    public async Task<ApiResponse<PortalYakapValidationResultDto>> ValidateTransmittalAsync(
        string tenantId,
        Guid id,
        CancellationToken ct = default)
    {
        using var request = CreateRequest(HttpMethod.Post, $"api/v1/yakap/transmittals/{id}/validate", tenantId);
        return await SendAsync<PortalYakapValidationResultDto>(request, $"validate transmittal {id}", ct);
    }

    public async Task<ApiResponse<PortalYakapSubmissionResultDto>> SubmitTransmittalAsync(
        string tenantId,
        Guid branchId,
        Guid id,
        CancellationToken ct = default)
    {
        using var request = CreateRequest(HttpMethod.Post, $"api/v1/yakap/transmittals/{id}/submit", tenantId, branchId);
        return await SendAsync<PortalYakapSubmissionResultDto>(request, $"submit transmittal {id}", ct);
    }
}
