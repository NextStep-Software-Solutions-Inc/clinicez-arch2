using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Logging;

namespace ClinicEz.PhilHealthProxy.Infrastructure.Services;

public sealed class PhilHealthPcapiClient : IPhilHealthPcapiClient
{
    private readonly HttpClient _httpClient;
    private readonly IPhilHealthTokenCache _tokenCache;
    private readonly IPhilHealthRateLimiter _rateLimiter;
    private readonly IPcapiSandboxService _sandboxService;
    private readonly IDataProtector _protector;
    private readonly ILogger<PhilHealthPcapiClient> _logger;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = null
    };

    public PhilHealthPcapiClient(
        HttpClient httpClient,
        IPhilHealthTokenCache tokenCache,
        IPhilHealthRateLimiter rateLimiter,
        IPcapiSandboxService sandboxService,
        IDataProtectionProvider dataProtectionProvider,
        ILogger<PhilHealthPcapiClient> logger)
    {
        _httpClient = httpClient;
        _tokenCache = tokenCache;
        _rateLimiter = rateLimiter;
        _sandboxService = sandboxService;
        _protector = dataProtectionProvider.CreateProtector("PhilHealthTenantProtection");
        _logger = logger;
    }

    private static bool IsSandbox(string? baseUrl)
    {
        if (string.IsNullOrWhiteSpace(baseUrl)) return true;
        var lower = baseUrl.ToLowerInvariant();
        return lower.Contains("sandbox") ||
               lower.Contains("simulator") ||
               lower.Contains("localhost") ||
               lower.Contains("127.0.0.1");
    }

    private string UnprotectSafe(string? encrypted)
    {
        if (string.IsNullOrEmpty(encrypted)) return string.Empty;
        try
        {
            return _protector.Unprotect(encrypted);
        }
        catch
        {
            return encrypted;
        }
    }

    public async Task<PcapiTokenData> AuthenticateAsync(PhilHealthTenant tenant, CancellationToken ct = default)
    {
        if (IsSandbox(tenant.BaseUrl))
        {
            return new PcapiTokenData("pcapi-sandbox-token-" + Guid.NewGuid().ToString("N")[..8], "Bearer", 3600);
        }

        var secretKey = UnprotectSafe(tenant.EncryptedSecretKey);
        var request = new PcapiTokenRequest(
            tenant.SoftwareCertificateId,
            tenant.AccreditationNumber,
            secretKey);

        var url = $"{tenant.BaseUrl.TrimEnd('/')}/api/v1/auth/token";
        var response = await _httpClient.PostAsJsonAsync(url, request, JsonOpts, ct);
        response.EnsureSuccessStatusCode();

        var result = await response.Content.ReadFromJsonAsync<PcapiTokenResponse>(JsonOpts, ct);
        if (result?.Data is null)
        {
            throw new InvalidOperationException("Failed to obtain PCAPI token from upstream response.");
        }

        return result.Data;
    }

    private async Task<string> GetTokenAsync(PhilHealthTenant tenant, CancellationToken ct)
    {
        return await _tokenCache.GetOrFetchTokenAsync(
            tenant.TenantId,
            tenant.AccreditationNumber,
            async tokenCt =>
            {
                var tokenData = await AuthenticateAsync(tenant, tokenCt);
                return (tokenData.AccessToken, TimeSpan.FromSeconds(tokenData.ExpiresIn));
            },
            ct);
    }

    private async Task<TRes> SendAuthorizedAsync<TReq, TRes>(
        string relativePath,
        HttpMethod method,
        TReq? requestBody,
        PhilHealthTenant tenant,
        CancellationToken ct)
    {
        using var lease = await _rateLimiter.AcquireAsync(tenant.TenantId, tenant.AccreditationNumber, ct);
        if (!lease.IsAcquired)
        {
            throw new HttpRequestException("429 Rate limit exceeded for facility.", null, HttpStatusCode.TooManyRequests);
        }

        var token = await GetTokenAsync(tenant, ct);
        var url = $"{tenant.BaseUrl.TrimEnd('/')}/{relativePath.TrimStart('/')}";

        using var request = new HttpRequestMessage(method, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        if (requestBody is not null)
        {
            request.Content = JsonContent.Create(requestBody, options: JsonOpts);
        }

        var response = await _httpClient.SendAsync(request, ct);

        // Single 401 retry with token eviction
        if (response.StatusCode == HttpStatusCode.Unauthorized)
        {
            _logger.LogWarning("[PcapiClient] Received 401 Unauthorized from PCAPI. Evicting token and retrying once.");
            _tokenCache.Invalidate(tenant.TenantId, tenant.AccreditationNumber);

            token = await GetTokenAsync(tenant, ct);
            using var retryRequest = new HttpRequestMessage(method, url);
            retryRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            if (requestBody is not null)
            {
                retryRequest.Content = JsonContent.Create(requestBody, options: JsonOpts);
            }

            response = await _httpClient.SendAsync(retryRequest, ct);
        }

        response.EnsureSuccessStatusCode();

        var result = await response.Content.ReadFromJsonAsync<TRes>(JsonOpts, ct);
        if (result is null)
        {
            throw new InvalidOperationException($"Empty response from PCAPI endpoint '{relativePath}'.");
        }

        return result;
    }

    public Task<PcuStartResponse> StartPcuAsync(PcuStartRequest req, PhilHealthTenant tenant, CancellationToken ct = default)
    {
        if (IsSandbox(tenant.BaseUrl))
        {
            return _sandboxService.StartPcuAsync(req, tenant.AccreditationNumber, ct);
        }

        return SendAuthorizedAsync<PcuStartRequest, PcuStartResponse>(
            "api/v1/pcu/start", HttpMethod.Post, req, tenant, ct);
    }

    public Task<PcuVerifyResponse> VerifyPcuAsync(PcuVerifyRequest req, PhilHealthTenant tenant, CancellationToken ct = default)
    {
        if (IsSandbox(tenant.BaseUrl))
        {
            return _sandboxService.VerifyPcuAsync(req, tenant.AccreditationNumber, ct);
        }

        return SendAuthorizedAsync<PcuVerifyRequest, PcuVerifyResponse>(
            "api/v1/pcu/verify", HttpMethod.Post, req, tenant, ct);
    }

    public Task<YakapValidatorResponse> ValidateStandingAsync(YakapValidateStandingRequest req, PhilHealthTenant tenant, CancellationToken ct = default)
    {
        if (IsSandbox(tenant.BaseUrl))
        {
            return _sandboxService.ValidateStandingAsync(req, tenant.AccreditationNumber, ct);
        }

        return SendAuthorizedAsync<YakapValidateStandingRequest, YakapValidatorResponse>(
            "api/v1/philhealth-yakap-validator", HttpMethod.Post, req, tenant, ct);
    }

    public Task<YakapEmpanelmentResponse> SubmitEmpanelmentAsync(YakapEmpanelmentRequest req, PhilHealthTenant tenant, CancellationToken ct = default)
    {
        if (IsSandbox(tenant.BaseUrl))
        {
            return _sandboxService.SubmitEmpanelmentAsync(req, tenant.AccreditationNumber, ct);
        }

        return SendAuthorizedAsync<YakapEmpanelmentRequest, YakapEmpanelmentResponse>(
            "api/v1/yakap-empanelment", HttpMethod.Post, req, tenant, ct);
    }

    public Task<YakapSelectionResponse> SubmitSelectionAsync(YakapSelectionRequest req, PhilHealthTenant tenant, CancellationToken ct = default)
    {
        if (IsSandbox(tenant.BaseUrl))
        {
            return _sandboxService.SubmitSelectionAsync(req, tenant.AccreditationNumber, ct);
        }

        return SendAuthorizedAsync<YakapSelectionRequest, YakapSelectionResponse>(
            "api/v1/yakap-selection", HttpMethod.Post, req, tenant, ct);
    }

    public Task<MasterlistDownloadResponse> DownloadIndividualMasterlistAsync(MasterlistIndividualRequest req, PhilHealthTenant tenant, CancellationToken ct = default)
    {
        if (IsSandbox(tenant.BaseUrl))
        {
            return _sandboxService.DownloadIndividualMasterlistAsync(req, tenant.AccreditationNumber, ct);
        }

        return SendAuthorizedAsync<MasterlistIndividualRequest, MasterlistDownloadResponse>(
            "api/v1/yakap-selection-masterlist/individual", HttpMethod.Post, req, tenant, ct);
    }

    public Task<MasterlistDownloadResponse> DownloadBatchMasterlistAsync(MasterlistBatchRequest req, PhilHealthTenant tenant, CancellationToken ct = default)
    {
        if (IsSandbox(tenant.BaseUrl))
        {
            return _sandboxService.DownloadBatchMasterlistAsync(req, tenant.AccreditationNumber, ct);
        }

        return SendAuthorizedAsync<MasterlistBatchRequest, MasterlistDownloadResponse>(
            "api/v1/yakap-selection-masterlist/batch", HttpMethod.Post, req, tenant, ct);
    }

    public Task<DataUploadResponse> UploadDataAsync(string form, PhilHealthEncryptedPayload envelope, PhilHealthTenant tenant, CancellationToken ct = default)
    {
        if (IsSandbox(tenant.BaseUrl))
        {
            var cipherKey = UnprotectSafe(tenant.EncryptedCipherKey);
            return _sandboxService.UploadDataAsync(form, envelope, tenant.AccreditationNumber, cipherKey, ct);
        }

        return SendAuthorizedAsync<PhilHealthEncryptedPayload, DataUploadResponse>(
            $"api/v1/yakap-data-upload/{form}", HttpMethod.Post, envelope, tenant, ct);
    }

    public Task<DataUploadStatusResponse> GetUploadStatusAsync(string uploadTxNo, PhilHealthTenant tenant, CancellationToken ct = default)
    {
        if (IsSandbox(tenant.BaseUrl))
        {
            return _sandboxService.GetUploadStatusAsync(uploadTxNo, tenant.AccreditationNumber, ct);
        }

        return SendAuthorizedAsync<object, DataUploadStatusResponse>(
            $"api/v1/yakap-data-upload/status/{uploadTxNo}", HttpMethod.Get, null, tenant, ct);
    }

    public Task<VerificationCodeResponse> ValidateVerificationCodeAsync(VerificationCodeRequest req, PhilHealthTenant tenant, CancellationToken ct = default)
    {
        if (IsSandbox(tenant.BaseUrl))
        {
            return _sandboxService.ValidateVerificationCodeAsync(req, tenant.AccreditationNumber, ct);
        }

        return SendAuthorizedAsync<VerificationCodeRequest, VerificationCodeResponse>(
            "api/v1/yakap-patient-verification-code", HttpMethod.Post, req, tenant, ct);
    }

    public Task<PhilHealthEncryptedPayload> GenerateAvailmentSlipAsync(AvailmentSlipRequest req, PhilHealthTenant tenant, CancellationToken ct = default)
    {
        if (IsSandbox(tenant.BaseUrl))
        {
            var cipherKey = UnprotectSafe(tenant.EncryptedCipherKey);
            return _sandboxService.GenerateAvailmentSlipAsync(req, tenant.AccreditationNumber, cipherKey, ct);
        }

        return SendAuthorizedAsync<AvailmentSlipRequest, PhilHealthEncryptedPayload>(
            "api/v1/yakap-availment-slip", HttpMethod.Post, req, tenant, ct);
    }
}
