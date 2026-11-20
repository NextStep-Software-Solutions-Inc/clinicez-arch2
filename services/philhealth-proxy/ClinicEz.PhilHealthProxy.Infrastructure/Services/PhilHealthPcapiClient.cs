using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Domain.Exceptions;
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
    private readonly IDataProtectionProvider _dataProtectionProvider;
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
        _dataProtectionProvider = dataProtectionProvider;
        _protector = dataProtectionProvider.CreateProtector("PhilHealthTenantProtection");
        _logger = logger;
    }

    private static bool IsSandbox(string? baseUrl)
    {
        if (string.IsNullOrWhiteSpace(baseUrl)) return false;
        var lower = baseUrl.ToLowerInvariant();
        return lower.Contains("sandbox") ||
               lower.Contains("simulator") ||
               lower.Contains("localhost") ||
               lower.Contains("127.0.0.1");
    }

    private static Uri EnsureValidBaseUrl(PhilHealthTenant tenant)
    {
        if (string.IsNullOrWhiteSpace(tenant.BaseUrl))
        {
            throw new PhilHealthGatewayException(
                424,
                "PHILHEALTH_CONNECTION_URL_MISSING",
                "PhilHealth Connection URL is not configured for this clinic. Configure a valid PhilHealth YAKAP URL in Settings -> PhilHealth & YAKAP or Portal Branch Settings.");
        }

        if (!Uri.TryCreate(tenant.BaseUrl.Trim(), UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            throw new PhilHealthGatewayException(
                400,
                "PHILHEALTH_CONNECTION_URL_INVALID",
                $"PhilHealth Connection URL '{tenant.BaseUrl}' is invalid. Configure a full http:// or https:// URL in Settings -> PhilHealth & YAKAP.");
        }

        return uri;
    }

    private async Task<HttpResponseMessage> SendWithDiagnosticsAsync(
        Func<Task<HttpResponseMessage>> sendAsync,
        Uri baseUri,
        string targetUrl,
        CancellationToken ct)
    {
        try
        {
            return await sendAsync();
        }
        catch (HttpRequestException ex)
        {
            throw new PhilHealthGatewayException(
                502,
                "PHILHEALTH_SERVER_UNREACHABLE",
                $"Could not connect to PhilHealth server at '{baseUri.Host}': {ex.Message} Verify the PhilHealth Connection URL in Settings -> PhilHealth & YAKAP.",
                ex);
        }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested)
        {
            throw new PhilHealthGatewayException(
                504,
                "TIMEOUT",
                $"PhilHealth server at '{baseUri.Host}' did not respond in time ({targetUrl}). Verify the PhilHealth Connection URL and try again.",
                ex);
        }
    }

    private static async Task EnsurePcapiSuccessAsync(
        HttpResponseMessage response,
        Uri baseUri,
        string targetUrl,
        bool isAuthEndpoint,
        CancellationToken ct)
    {
        if (response.IsSuccessStatusCode)
        {
            return;
        }

        var statusCode = (int)response.StatusCode;
        var rawBody = await response.Content.ReadAsStringAsync(ct);
        var (isJson, extractedMessage) = TryExtractUpstreamMessage(rawBody);
        var suffix = string.IsNullOrWhiteSpace(extractedMessage) ? string.Empty : $" Details: {extractedMessage}";

        if (isAuthEndpoint)
        {
            if (statusCode == 404)
            {
                throw new PhilHealthGatewayException(
                    502,
                    "PHILHEALTH_ENDPOINT_NOT_FOUND",
                    $"PhilHealth authentication endpoint was not found at '{targetUrl}' (HTTP 404). Verify the PhilHealth Connection URL in Settings -> PhilHealth & YAKAP.");
            }

            if (statusCode is 401 or 403)
            {
                throw new PhilHealthGatewayException(
                    statusCode,
                    "PHILHEALTH_AUTH_FAILED",
                    $"PhilHealth server rejected facility credentials at '{baseUri.Host}' (HTTP {statusCode}).{suffix} Verify Accreditation No., Software Certificate ID, and Access Secret in Settings -> PhilHealth & YAKAP.");
            }

            throw new PhilHealthGatewayException(
                statusCode >= 500 ? statusCode : 502,
                "PHILHEALTH_AUTH_ERROR",
                $"PhilHealth authentication failed with HTTP {statusCode} at '{targetUrl}'.{suffix}");
        }

        if (statusCode == 404)
        {
            if (!isJson || string.IsNullOrWhiteSpace(extractedMessage))
            {
                throw new PhilHealthGatewayException(
                    502,
                    "PHILHEALTH_ENDPOINT_NOT_FOUND",
                    $"PhilHealth server endpoint was not found at '{targetUrl}' (HTTP 404). Verify the PhilHealth Connection URL in Settings -> PhilHealth & YAKAP.");
            }

            throw new PhilHealthGatewayException(404, "PIN_NOT_FOUND", extractedMessage);
        }

        if (statusCode is 401 or 403)
        {
            throw new PhilHealthGatewayException(
                statusCode,
                "PHILHEALTH_AUTH_FAILED",
                $"PhilHealth server rejected authorization at '{baseUri.Host}' (HTTP {statusCode}).{suffix}");
        }

        if (statusCode == 429)
        {
            throw new PhilHealthGatewayException(
                429,
                "RATE_LIMITED",
                extractedMessage ?? "PhilHealth server rate limit exceeded. Please try again in a moment.");
        }

        if (statusCode >= 500)
        {
            throw new PhilHealthGatewayException(
                statusCode,
                "UPSTREAM_SERVER_ERROR",
                $"PhilHealth server error (HTTP {statusCode}) from '{baseUri.Host}'.{suffix}");
        }

        throw new PhilHealthGatewayException(
            statusCode,
            "PIN_INVALID",
            extractedMessage ?? $"PhilHealth server rejected the request (HTTP {statusCode}).");
    }

    private static (bool IsJson, string? Message) TryExtractUpstreamMessage(string? rawBody)
    {
        if (string.IsNullOrWhiteSpace(rawBody))
        {
            return (false, null);
        }

        var trimmed = rawBody.Trim();
        if (!trimmed.StartsWith('{') && !trimmed.StartsWith('['))
        {
            return (false, null);
        }

        try
        {
            using var doc = JsonDocument.Parse(trimmed);
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
            {
                return (true, null);
            }

            foreach (var key in new[] { "message", "Message", "error_description", "error", "detail", "title", "Title" })
            {
                if (doc.RootElement.TryGetProperty(key, out var prop) && prop.ValueKind == JsonValueKind.String)
                {
                    var val = prop.GetString();
                    if (!string.IsNullOrWhiteSpace(val))
                    {
                        return (true, val.Trim());
                    }
                }
            }

            return (true, null);
        }
        catch
        {
            return (false, null);
        }
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
            try
            {
                return _dataProtectionProvider.CreateProtector("ClinicEz.PhilHealthProxy.TenantCredentials").Unprotect(encrypted);
            }
            catch
            {
                return encrypted;
            }
        }
    }

    public async Task<PcapiTokenData> AuthenticateAsync(PhilHealthTenant tenant, CancellationToken ct = default)
    {
        if (IsSandbox(tenant.BaseUrl))
        {
            return new PcapiTokenData("pcapi-sandbox-token-" + Guid.NewGuid().ToString("N")[..8], "Bearer", 3600);
        }

        var baseUri = EnsureValidBaseUrl(tenant);
        var secretKey = UnprotectSafe(tenant.EncryptedSecretKey);
        var request = new PcapiTokenRequest(
            tenant.SoftwareCertificateId,
            tenant.AccreditationNumber,
            secretKey);

        var url = $"{baseUri.AbsoluteUri.TrimEnd('/')}/api/v1/auth/token";
        using var response = await SendWithDiagnosticsAsync(
            () => _httpClient.PostAsJsonAsync(url, request, JsonOpts, ct),
            baseUri,
            url,
            ct);
        await EnsurePcapiSuccessAsync(response, baseUri, url, isAuthEndpoint: true, ct);

        var result = await response.Content.ReadFromJsonAsync<PcapiTokenResponse>(JsonOpts, ct);
        if (result?.Data is null)
        {
            throw new PhilHealthGatewayException(
                502,
                "UPSTREAM_UNREADABLE",
                "PhilHealth authentication returned an unreadable or empty token response.");
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
        var baseUri = EnsureValidBaseUrl(tenant);

        using var lease = await _rateLimiter.AcquireAsync(tenant.TenantId, tenant.AccreditationNumber, ct);
        if (!lease.IsAcquired)
        {
            throw new HttpRequestException("429 Rate limit exceeded for PhilHealth facility.", null, HttpStatusCode.TooManyRequests);
        }

        var token = await GetTokenAsync(tenant, ct);
        var url = $"{baseUri.AbsoluteUri.TrimEnd('/')}/{relativePath.TrimStart('/')}";

        HttpResponseMessage response = await SendWithDiagnosticsAsync(
            async () =>
            {
                using var reqMsg = new HttpRequestMessage(method, url);
                reqMsg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                if (requestBody is not null)
                {
                    reqMsg.Content = JsonContent.Create(requestBody, options: JsonOpts);
                }

                return await _httpClient.SendAsync(reqMsg, ct);
            },
            baseUri,
            url,
            ct);

        // Single 401 retry with token eviction
        if (response.StatusCode == HttpStatusCode.Unauthorized)
        {
            response.Dispose();
            _logger.LogWarning("[PcapiClient] Received 401 Unauthorized from PCAPI. Evicting token and retrying once.");
            _tokenCache.Invalidate(tenant.TenantId, tenant.AccreditationNumber);

            token = await GetTokenAsync(tenant, ct);
            response = await SendWithDiagnosticsAsync(
                async () =>
                {
                    using var retryRequest = new HttpRequestMessage(method, url);
                    retryRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                    if (requestBody is not null)
                    {
                        retryRequest.Content = JsonContent.Create(requestBody, options: JsonOpts);
                    }

                    return await _httpClient.SendAsync(retryRequest, ct);
                },
                baseUri,
                url,
                ct);
        }

        using (response)
        {
            await EnsurePcapiSuccessAsync(response, baseUri, url, isAuthEndpoint: false, ct);

            var result = await response.Content.ReadFromJsonAsync<TRes>(JsonOpts, ct);
            if (result is null)
            {
                throw new PhilHealthGatewayException(
                    502,
                    "UPSTREAM_UNREADABLE",
                    $"PhilHealth server returned an empty response from '{url}'.");
            }

            return result;
        }
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
            if (string.IsNullOrWhiteSpace(cipherKey))
            {
                cipherKey = Application.Common.TenantResolutionHelper.SandboxDefaultCipherKey;
            }
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
            if (string.IsNullOrWhiteSpace(cipherKey))
            {
                cipherKey = Application.Common.TenantResolutionHelper.SandboxDefaultCipherKey;
            }
            return _sandboxService.GenerateAvailmentSlipAsync(req, tenant.AccreditationNumber, cipherKey, ct);
        }

        return SendAuthorizedAsync<AvailmentSlipRequest, PhilHealthEncryptedPayload>(
            "api/v1/yakap-availment-slip", HttpMethod.Post, req, tenant, ct);
    }
}
