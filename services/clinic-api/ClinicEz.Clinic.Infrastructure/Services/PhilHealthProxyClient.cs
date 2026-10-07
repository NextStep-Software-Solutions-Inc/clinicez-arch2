using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Services;

public sealed class PhilHealthProxyClient : IPhilHealthProxyClient
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<PhilHealthProxyClient> _logger;
    private readonly IClinicContext? _clinicContext;
    private readonly string _baseUrl;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public PhilHealthProxyClient(
        HttpClient httpClient,
        IConfiguration configuration,
        ILogger<PhilHealthProxyClient> logger,
        IClinicContext? clinicContext = null)
    {
        _httpClient = httpClient;
        _logger = logger;
        _clinicContext = clinicContext;
        _baseUrl = (configuration["PhilHealthProxy:BaseUrl"] ?? "http://localhost:5025").TrimEnd('/');
    }

    private HttpRequestMessage CreateRequest(HttpMethod method, string url, object? jsonBody = null)
    {
        var request = new HttpRequestMessage(method, url);
        if (jsonBody != null)
        {
            request.Content = JsonContent.Create(jsonBody, options: JsonOptions);
        }

        if (_clinicContext != null)
        {
            if (!string.IsNullOrWhiteSpace(_clinicContext.TenantId))
            {
                request.Headers.TryAddWithoutValidation("X-Tenant-Id", _clinicContext.TenantId);
            }
            if (_clinicContext.BranchId.HasValue && _clinicContext.BranchId.Value != Guid.Empty)
            {
                request.Headers.TryAddWithoutValidation("X-Branch-Id", _clinicContext.BranchId.Value.ToString());
            }
            if (_clinicContext.ClinicId != Guid.Empty)
            {
                request.Headers.TryAddWithoutValidation("X-Facility-Id", _clinicContext.ClinicId.ToString());
            }
        }

        return request;
    }

    private async Task<ApiResponse<T>> SendAsync<T>(HttpRequestMessage request, CancellationToken ct)
    {
        var response = await _httpClient.SendAsync(request, ct);
        var content = await response.Content.ReadFromJsonAsync<ApiResponse<T>>(JsonOptions, ct);
        return content ?? ApiResponse<T>.Fail($"Empty response from proxy (HTTP {(int)response.StatusCode})");
    }

    public async Task<ApiResponse<YakapValidationProxyResponse>> ValidateReportAsync(
        GenerateAndValidateReportProxyRequest request,
        CancellationToken ct = default)
    {
        try
        {
            var url = $"{_baseUrl}/api/yakap/reports/validate";
            _logger.LogInformation("[PhilHealthProxy] Calling validate report: {Url}", url);

            using var req = CreateRequest(HttpMethod.Post, url, request);
            return await SendAsync<YakapValidationProxyResponse>(req, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[PhilHealthProxy] Error calling ValidateReportAsync");
            return ApiResponse<YakapValidationProxyResponse>.Fail(ex.Message);
        }
    }

    public async Task<ApiResponse<YakapSubmissionProxyResponse>> SubmitReportAsync(
        GenerateAndSubmitReportProxyRequest request,
        CancellationToken ct = default)
    {
        try
        {
            var url = $"{_baseUrl}/api/yakap/reports/submit";
            _logger.LogInformation("[PhilHealthProxy] Calling submit report: {Url}", url);

            using var req = CreateRequest(HttpMethod.Post, url, request);
            return await SendAsync<YakapSubmissionProxyResponse>(req, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[PhilHealthProxy] Error calling SubmitReportAsync");
            return ApiResponse<YakapSubmissionProxyResponse>.Fail(ex.Message);
        }
    }

    public async Task<ApiResponse<YakapMasterlistProxyResponse>> ExtractMasterlistAsync(
        ExtractMasterlistProxyRequest request,
        CancellationToken ct = default)
    {
        try
        {
            var url = $"{_baseUrl}/api/yakap/masterlist/extract";
            _logger.LogInformation("[PhilHealthProxy] Calling extract masterlist: {Url}", url);

            using var req = CreateRequest(HttpMethod.Post, url, request);
            return await SendAsync<YakapMasterlistProxyResponse>(req, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[PhilHealthProxy] Error calling ExtractMasterlistAsync");
            return ApiResponse<YakapMasterlistProxyResponse>.Fail(ex.Message);
        }
    }

    public async Task<ApiResponse<bool>> ValidatePinAsync(
        string pin,
        CancellationToken ct = default)
    {
        try
        {
            var url = $"{_baseUrl}/api/yakap/pin/{Uri.EscapeDataString(pin)}/validate";
            using var req = CreateRequest(HttpMethod.Get, url);
            return await SendAsync<bool>(req, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[PhilHealthProxy] Error calling ValidatePinAsync");
            return ApiResponse<bool>.Fail(ex.Message);
        }
    }

    public async Task<ApiResponse<SoapSimulationReportDto>> RunSoapSimulationAsync(
        RunSoapSimulationProxyRequest request,
        CancellationToken ct = default)
    {
        try
        {
            var url = $"{_baseUrl}/api/soap-sandbox/run-e2e";
            _logger.LogInformation("[PhilHealthProxy] Calling run SOAP sandbox simulation: {Url}", url);

            using var req = CreateRequest(HttpMethod.Post, url, request);
            return await SendAsync<SoapSimulationReportDto>(req, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[PhilHealthProxy] Error calling RunSoapSimulationAsync");
            return ApiResponse<SoapSimulationReportDto>.Fail(ex.Message);
        }
    }

    public async Task<ApiResponse<SoapSandboxStatusDto>> GetSoapSandboxStatusAsync(
        CancellationToken ct = default)
    {
        try
        {
            var url = $"{_baseUrl}/api/soap-sandbox/status";
            using var req = CreateRequest(HttpMethod.Get, url);
            return await SendAsync<SoapSandboxStatusDto>(req, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[PhilHealthProxy] Error calling GetSoapSandboxStatusAsync");
            return ApiResponse<SoapSandboxStatusDto>.Fail(ex.Message);
        }
    }

    public async Task<ApiResponse<SoapSandboxStatusDto>> SetSoapSandboxScenarioAsync(
        SetSimulationScenarioRequest request,
        CancellationToken ct = default)
    {
        try
        {
            var url = $"{_baseUrl}/api/soap-sandbox/scenario";
            using var req = CreateRequest(HttpMethod.Post, url, request);
            return await SendAsync<SoapSandboxStatusDto>(req, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[PhilHealthProxy] Error calling SetSoapSandboxScenarioAsync");
            return ApiResponse<SoapSandboxStatusDto>.Fail(ex.Message);
        }
    }

    public async Task<ApiResponse<SoapSandboxStatusDto>> ResetSoapSandboxAsync(
        CancellationToken ct = default)
    {
        try
        {
            var url = $"{_baseUrl}/api/soap-sandbox/reset";
            using var req = CreateRequest(HttpMethod.Post, url);
            return await SendAsync<SoapSandboxStatusDto>(req, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[PhilHealthProxy] Error calling ResetSoapSandboxAsync");
            return ApiResponse<SoapSandboxStatusDto>.Fail(ex.Message);
        }
    }

    public async Task<ApiResponse<PhilHealthConfigStatusResponse>> ConfigureTenantCredentialsAsync(
        ConfigurePhilHealthCredentialsProxyRequest request,
        CancellationToken ct = default)
    {
        try
        {
            var url = $"{_baseUrl}/api/tenants/configure";
            _logger.LogInformation("[PhilHealthProxy] Calling configure tenant credentials: {Url}", url);

            using var req = CreateRequest(HttpMethod.Post, url, request);
            return await SendAsync<PhilHealthConfigStatusResponse>(req, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[PhilHealthProxy] Error calling ConfigureTenantCredentialsAsync");
            return ApiResponse<PhilHealthConfigStatusResponse>.Fail(ex.Message);
        }
    }

    public async Task<ApiResponse<PhilHealthConfigStatusResponse>> GetTenantConfigurationStatusAsync(
        Guid? tenantId = null,
        CancellationToken ct = default)
    {
        try
        {
            var effectiveTenantId = tenantId.HasValue && tenantId.Value != Guid.Empty
                ? tenantId.Value.ToString()
                : _clinicContext?.TenantId;

            var url = !string.IsNullOrWhiteSpace(effectiveTenantId)
                ? $"{_baseUrl}/api/tenants/status?tenantId={effectiveTenantId}"
                : $"{_baseUrl}/api/tenants/status";

            using var req = CreateRequest(HttpMethod.Get, url);
            return await SendAsync<PhilHealthConfigStatusResponse>(req, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[PhilHealthProxy] Error calling GetTenantConfigurationStatusAsync");
            return ApiResponse<PhilHealthConfigStatusResponse>.Fail(ex.Message);
        }
    }

    public async Task<ApiResponse<string>> TestTenantConnectionAsync(
        Guid? tenantId = null,
        CancellationToken ct = default)
    {
        try
        {
            var effectiveTenantId = tenantId.HasValue && tenantId.Value != Guid.Empty
                ? tenantId.Value.ToString()
                : _clinicContext?.TenantId;

            var url = !string.IsNullOrWhiteSpace(effectiveTenantId)
                ? $"{_baseUrl}/api/tenants/test-connection?tenantId={effectiveTenantId}"
                : $"{_baseUrl}/api/tenants/test-connection";

            using var req = CreateRequest(HttpMethod.Post, url);
            return await SendAsync<string>(req, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[PhilHealthProxy] Error calling TestTenantConnectionAsync");
            return ApiResponse<string>.Fail(ex.Message);
        }
    }
}


