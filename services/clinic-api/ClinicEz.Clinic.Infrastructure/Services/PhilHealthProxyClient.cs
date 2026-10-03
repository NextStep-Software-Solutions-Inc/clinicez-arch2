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
}
