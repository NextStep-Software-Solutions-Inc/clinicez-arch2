using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Shared.Common;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Services;

public sealed class PhilHealthProxyClient : IPhilHealthProxyClient
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<PhilHealthProxyClient> _logger;
    private readonly string _baseUrl;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public PhilHealthProxyClient(
        HttpClient httpClient,
        IConfiguration configuration,
        ILogger<PhilHealthProxyClient> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
        _baseUrl = (configuration["PhilHealthProxy:BaseUrl"] ?? "http://localhost:5025").TrimEnd('/');
    }

    public async Task<ApiResponse<YakapValidationProxyResponse>> ValidateReportAsync(
        GenerateAndValidateReportProxyRequest request,
        CancellationToken ct = default)
    {
        try
        {
            var url = $"{_baseUrl}/api/yakap/reports/validate";
            _logger.LogInformation("[PhilHealthProxy] Calling validate report: {Url}", url);

            var response = await _httpClient.PostAsJsonAsync(url, request, ct);
            var content = await response.Content.ReadFromJsonAsync<ApiResponse<YakapValidationProxyResponse>>(JsonOptions, ct);

            if (content != null)
            {
                return content;
            }

            return ApiResponse<YakapValidationProxyResponse>.Fail(
                $"Empty response from proxy (HTTP {(int)response.StatusCode})");
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

            var response = await _httpClient.PostAsJsonAsync(url, request, ct);
            var content = await response.Content.ReadFromJsonAsync<ApiResponse<YakapSubmissionProxyResponse>>(JsonOptions, ct);

            if (content != null)
            {
                return content;
            }

            return ApiResponse<YakapSubmissionProxyResponse>.Fail(
                $"Empty response from proxy (HTTP {(int)response.StatusCode})");
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

            var response = await _httpClient.PostAsJsonAsync(url, request, ct);
            var content = await response.Content.ReadFromJsonAsync<ApiResponse<YakapMasterlistProxyResponse>>(JsonOptions, ct);

            if (content != null)
            {
                return content;
            }

            return ApiResponse<YakapMasterlistProxyResponse>.Fail(
                $"Empty response from proxy (HTTP {(int)response.StatusCode})");
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
            var response = await _httpClient.GetFromJsonAsync<ApiResponse<bool>>(url, JsonOptions, ct);
            return response ?? ApiResponse<bool>.Fail("Empty response from proxy");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[PhilHealthProxy] Error calling ValidatePinAsync");
            return ApiResponse<bool>.Fail(ex.Message);
        }
    }

    public async Task<ApiResponse<IReadOnlyList<YakapCatalogItemDto>>> GetCatalogAsync(
        string catalogType,
        CancellationToken ct = default)
    {
        try
        {
            var url = $"{_baseUrl}/api/yakap/catalogs/{Uri.EscapeDataString(catalogType)}";
            var response = await _httpClient.GetFromJsonAsync<ApiResponse<IReadOnlyList<YakapCatalogItemDto>>>(url, JsonOptions, ct);
            return response ?? ApiResponse<IReadOnlyList<YakapCatalogItemDto>>.Fail("Empty response from proxy");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[PhilHealthProxy] Error calling GetCatalogAsync");
            return ApiResponse<IReadOnlyList<YakapCatalogItemDto>>.Fail(ex.Message);
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

            var response = await _httpClient.PostAsJsonAsync(url, request, ct);
            var content = await response.Content.ReadFromJsonAsync<ApiResponse<SoapSimulationReportDto>>(JsonOptions, ct);

            return content ?? ApiResponse<SoapSimulationReportDto>.Fail($"Empty response from proxy (HTTP {(int)response.StatusCode})");
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
            var response = await _httpClient.GetFromJsonAsync<ApiResponse<SoapSandboxStatusDto>>(url, JsonOptions, ct);
            return response ?? ApiResponse<SoapSandboxStatusDto>.Fail("Empty response from proxy");
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
            var response = await _httpClient.PostAsJsonAsync(url, request, ct);
            var content = await response.Content.ReadFromJsonAsync<ApiResponse<SoapSandboxStatusDto>>(JsonOptions, ct);
            return content ?? ApiResponse<SoapSandboxStatusDto>.Fail($"Empty response from proxy (HTTP {(int)response.StatusCode})");
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
            var response = await _httpClient.PostAsync(url, null, ct);
            var content = await response.Content.ReadFromJsonAsync<ApiResponse<SoapSandboxStatusDto>>(JsonOptions, ct);
            return content ?? ApiResponse<SoapSandboxStatusDto>.Fail($"Empty response from proxy (HTTP {(int)response.StatusCode})");
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

            var response = await _httpClient.PostAsJsonAsync(url, request, ct);
            var content = await response.Content.ReadFromJsonAsync<ApiResponse<PhilHealthConfigStatusResponse>>(JsonOptions, ct);

            return content ?? ApiResponse<PhilHealthConfigStatusResponse>.Fail(
                $"Empty response from proxy (HTTP {(int)response.StatusCode})");
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
            var url = tenantId.HasValue && tenantId.Value != Guid.Empty
                ? $"{_baseUrl}/api/tenants/status?tenantId={tenantId.Value}"
                : $"{_baseUrl}/api/tenants/status";

            var response = await _httpClient.GetFromJsonAsync<ApiResponse<PhilHealthConfigStatusResponse>>(url, JsonOptions, ct);
            return response ?? ApiResponse<PhilHealthConfigStatusResponse>.Fail("Empty response from proxy");
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
            var url = tenantId.HasValue && tenantId.Value != Guid.Empty
                ? $"{_baseUrl}/api/tenants/test-connection?tenantId={tenantId.Value}"
                : $"{_baseUrl}/api/tenants/test-connection";

            var response = await _httpClient.PostAsync(url, null, ct);
            var content = await response.Content.ReadFromJsonAsync<ApiResponse<string>>(JsonOptions, ct);
            return content ?? ApiResponse<string>.Fail($"Empty response from proxy (HTTP {(int)response.StatusCode})");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[PhilHealthProxy] Error calling TestTenantConnectionAsync");
            return ApiResponse<string>.Fail(ex.Message);
        }
    }
}

