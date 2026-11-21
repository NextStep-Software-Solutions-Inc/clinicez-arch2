using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Services;

/// <summary>
/// Talks to the PhilHealth proxy through the interop hub (<c>philhealth.request</c>, answered with
/// <c>philhealth.response</c>); there is no direct HTTP call to it. The proxy acts for the facility named in the signed
/// envelope sender, so no tenant or facility id travels in the request.
/// Exclusively targets PCAPI v2.0 (Services 01–08) with zero YAKAP v1.* SOAP/XML backward compatibility.
/// </summary>
public sealed class PhilHealthProxyClient : IPhilHealthProxyClient, IYakapPcapiClient
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(60);

    private static readonly JsonSerializerOptions JsonOptions = new JsonSerializerOptions
    {
        PropertyNameCaseInsensitive = true
    }.UseStrictStringEnums();

    private readonly IInteropRequestClient _requests;
    private readonly IClinicIdentityProvider _identity;
    private readonly ILogger<PhilHealthProxyClient> _logger;
    private readonly IRepository<FacilitySettings>? _settingsRepo;

    public PhilHealthProxyClient(
        IInteropRequestClient requests,
        IClinicIdentityProvider identity,
        ILogger<PhilHealthProxyClient> logger,
        IRepository<FacilitySettings>? settingsRepo = null)
    {
        _requests = requests;
        _identity = identity;
        _logger = logger;
        _settingsRepo = settingsRepo;
    }

    private static bool RequiresConfiguredConnectionUrl(string operation) =>
        operation is not (
            PhilHealthOperations.TenantConfigure or
            PhilHealthOperations.TenantStatus or
            PhilHealthOperations.PcapiSandboxStatus or
            PhilHealthOperations.PcapiSandboxScenario or
            PhilHealthOperations.PcapiSandboxReset);

    private Task<ApiResponse<T>> SendAsync<T>(string operation, object? body, string? argument, CancellationToken ct) =>
        SendRawAsync<T>(
            operation,
            body is null ? null : JsonSerializer.Serialize(body, JsonOptions),
            argument,
            ct);

    private async Task<ApiResponse<T>> SendRawAsync<T>(string operation, string? rawJsonBody, string? argument, CancellationToken ct)
    {
        var clinic = await _identity.GetAsync(ct);
        if (clinic is null)
        {
            return ApiResponse<T>.Fail(
                "This clinic has not been connected to the central platform yet, so PhilHealth cannot be reached.",
                "SERVICE_UNAVAILABLE");
        }

        if (RequiresConfiguredConnectionUrl(operation) && _settingsRepo != null)
        {
            var settings = await _settingsRepo.Query().AsNoTracking().FirstOrDefaultAsync(ct);
            if (settings != null)
            {
                var configuredUrl = !string.IsNullOrWhiteSpace(settings.PhilHealthBaseUrl)
                    ? settings.PhilHealthBaseUrl.Trim()
                    : settings.BranchPhilHealthBaseUrl?.Trim();

                if (string.IsNullOrWhiteSpace(configuredUrl))
                {
                    return ApiResponse<T>.Fail(
                        "PhilHealth Connection URL is not configured for this clinic. Go to Clinic Settings -> PhilHealth & YAKAP (or Portal Branch Settings) to configure a valid Connection URL before contacting the PhilHealth server.",
                        "PHILHEALTH_CONNECTION_URL_MISSING");
                }

                if (!Uri.TryCreate(configuredUrl, UriKind.Absolute, out var parsedUri) ||
                    (parsedUri.Scheme != Uri.UriSchemeHttp && parsedUri.Scheme != Uri.UriSchemeHttps))
                {
                    return ApiResponse<T>.Fail(
                        $"PhilHealth Connection URL '{configuredUrl}' is invalid. Enter a valid full http:// or https:// URL in Settings -> PhilHealth & YAKAP.",
                        "PHILHEALTH_CONNECTION_URL_INVALID");
                }
            }
        }

        var request = new PhilHealthRequestPayload
        {
            Operation = operation,
            Argument = argument,
            Body = rawJsonBody
        };

        try
        {
            var reply = await _requests.RequestAsync<PhilHealthRequestPayload, PhilHealthResponsePayload>(
                InteropTypes.PhilHealthRequest,
                InteropTypes.PhilHealthResponse,
                ClinicParties.Clinic(clinic.TenantId, clinic.ClinicId.ToString()),
                Party.PhilHealth,
                request,
                Timeout,
                ct);

            if (string.IsNullOrWhiteSpace(reply.Body))
            {
                var emptyCode = reply.StatusCode >= 500 || reply.StatusCode == 429
                    ? "UPSTREAM_SERVER_ERROR"
                    : $"HTTP_{reply.StatusCode}";
                return ApiResponse<T>.Fail($"PhilHealth returned an empty response (status {reply.StatusCode}).", emptyCode);
            }

            var deserialized = JsonSerializer.Deserialize<ApiResponse<T>>(reply.Body, JsonOptions);
            if (deserialized is null)
            {
                return ApiResponse<T>.Fail($"PhilHealth returned an unreadable response (status {reply.StatusCode}).", "UPSTREAM_UNREADABLE");
            }

            if (!deserialized.Succeeded &&
                !string.IsNullOrWhiteSpace(deserialized.Message) &&
                deserialized.Message.Contains("Response status code does not indicate success: 404", StringComparison.OrdinalIgnoreCase))
            {
                deserialized.Message =
                    "PhilHealth server endpoint returned 404 (Not Found). Verify the PhilHealth Connection URL in Settings -> PhilHealth & YAKAP.";
                deserialized.ErrorCode = "PHILHEALTH_ENDPOINT_NOT_FOUND";
            }

            if (!deserialized.Succeeded && (string.IsNullOrWhiteSpace(deserialized.ErrorCode) || deserialized.ErrorCode == "ERROR"))
            {
                deserialized.ErrorCode = reply.StatusCode switch
                {
                    >= 500 => "UPSTREAM_SERVER_ERROR",
                    429 => "RATE_LIMITED",
                    404 => "PIN_NOT_FOUND",
                    400 or 422 => "PIN_INVALID",
                    401 => "UNAUTHORIZED",
                    _ => $"HTTP_{reply.StatusCode}"
                };
            }

            return deserialized;
        }
        catch (InteropRequestTimeoutException ex)
        {
            _logger.LogWarning(ex, "[PhilHealthProxy] {Operation} timed out.", operation);
            return ApiResponse<T>.Fail("PhilHealth did not answer in time. Please try again in a moment.", "TIMEOUT");
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "[PhilHealthProxy] {Operation} returned an unreadable response.", operation);
            return ApiResponse<T>.Fail("PhilHealth returned a response that could not be read.", "UPSTREAM_UNREADABLE");
        }
    }

    // ── Service 01: PCU Facial Liveness ─────────────────────────────────────
    public Task<ApiResponse<PcuStartResponse>> StartPcuSessionAsync(PcuStartRequest request, CancellationToken ct = default) =>
        SendAsync<PcuStartResponse>(PhilHealthOperations.PcuStart, request, null, ct);

    public Task<ApiResponse<PcuVerifyResponse>> VerifyPcuTokenAsync(PcuVerifyRequest request, CancellationToken ct = default) =>
        SendAsync<PcuVerifyResponse>(PhilHealthOperations.PcuVerify, request, null, ct);

    // ── Service 02: Primary Care Standing Validator ─────────────────────────
    public Task<ApiResponse<YakapValidatorResponse>> ValidateStandingAsync(YakapValidateStandingRequest request, CancellationToken ct = default) =>
        SendAsync<YakapValidatorResponse>(PhilHealthOperations.YakapValidateStanding, request, null, ct);

    public Task<ApiResponse<bool>> ValidatePinAsync(string pin, CancellationToken ct = default)
    {
        var isValid = PhilHealthPinNormalizer.IsValidPin(pin);
        return Task.FromResult(isValid
            ? ApiResponse<bool>.Success(true, "PhilHealth number format is valid.")
            : ApiResponse<bool>.Fail("Please enter a valid 12-digit PhilHealth number."));
    }

    // ── Service 03: YAKAP Empanelment ───────────────────────────────────────
    public Task<ApiResponse<YakapEmpanelmentResponse>> SubmitEmpanelmentAsync(YakapEmpanelmentRequest request, CancellationToken ct = default) =>
        SendAsync<YakapEmpanelmentResponse>(PhilHealthOperations.YakapEmpanel, request, null, ct);

    // ── Service 04: YAKAP Selection ──────────────────────────────────────────
    public Task<ApiResponse<YakapSelectionResponse>> SubmitSelectionAsync(YakapSelectionRequest request, CancellationToken ct = default) =>
        SendAsync<YakapSelectionResponse>(PhilHealthOperations.YakapSelect, request, null, ct);

    // ── Service 05: Masterlist ───────────────────────────────────────────────
    public Task<ApiResponse<MasterlistDownloadResponse>> DownloadIndividualMasterlistAsync(MasterlistIndividualRequest request, CancellationToken ct = default) =>
        SendAsync<MasterlistDownloadResponse>(PhilHealthOperations.MasterlistDownloadIndividual, request, null, ct);

    public Task<ApiResponse<MasterlistDownloadResponse>> DownloadBatchMasterlistAsync(MasterlistBatchRequest request, CancellationToken ct = default) =>
        SendAsync<MasterlistDownloadResponse>(PhilHealthOperations.MasterlistDownloadBatch, request, null, ct);

    // ── Service 06: Data Upload (Annex A - F) ───────────────────────────────
    public Task<ApiResponse<DataUploadResponse>> UploadDataAsync(string form, PhilHealthEncryptedPayload payload, CancellationToken ct = default) =>
        SendAsync<DataUploadResponse>(ResolveUploadOperation(form), payload, null, ct);

    public Task<ApiResponse<DataUploadResponse>> UploadPlainJsonAsync(string form, string plainJson, CancellationToken ct = default) =>
        SendRawAsync<DataUploadResponse>(ResolveUploadOperation(form), plainJson, null, ct);

    public Task<ApiResponse<DataUploadStatusResponse>> GetUploadStatusAsync(string uploadTransactionNo, CancellationToken ct = default) =>
        SendAsync<DataUploadStatusResponse>(PhilHealthOperations.DataUploadGetStatus, null, uploadTransactionNo, ct);

    // ── Service 07: Verification Code (OTP) ─────────────────────────────────
    public Task<ApiResponse<VerificationCodeResponse>> ValidateVerificationCodeAsync(VerificationCodeRequest request, CancellationToken ct = default) =>
        SendAsync<VerificationCodeResponse>(PhilHealthOperations.GeneratePatientOtp, request, null, ct);

    // ── Service 08: Electronic Konsulta Availment Slip ──────────────────────
    public Task<ApiResponse<AvailmentSlipResponse>> GenerateAvailmentSlipAsync(AvailmentSlipRequest request, CancellationToken ct = default) =>
        SendAsync<AvailmentSlipResponse>(PhilHealthOperations.GenerateAvailmentSlip, request, null, ct);

    // ── Tenant Configuration & Connectivity ─────────────────────────────────
    public Task<ApiResponse<TenantConfigurationStatusResponse>> ConfigureTenantCredentialsAsync(ConfigureTenantCredentialsRequest request, CancellationToken ct = default) =>
        SendAsync<TenantConfigurationStatusResponse>(PhilHealthOperations.TenantConfigure, request, null, ct);

    public Task<ApiResponse<TenantConfigurationStatusResponse>> GetTenantConfigurationStatusAsync(CancellationToken ct = default) =>
        SendAsync<TenantConfigurationStatusResponse>(PhilHealthOperations.TenantStatus, null, null, ct);

    public Task<ApiResponse<TestTenantConnectionResponse>> TestTenantConnectionAsync(CancellationToken ct = default) =>
        SendAsync<TestTenantConnectionResponse>(PhilHealthOperations.TenantTestConnection, null, null, ct);

    async Task<ApiResponse<PhilHealthConfigStatusResponse>> IPhilHealthProxyClient.ConfigureTenantCredentialsAsync(
        ConfigurePhilHealthCredentialsProxyRequest request,
        CancellationToken ct)
    {
        var pcapiReq = new ConfigureTenantCredentialsRequest(
            request.TenantId,
            null,
            request.FacilityName,
            request.AccreditationNumber,
            request.PmccNumber,
            request.SoftwareCertificateId,
            request.SecretKey,
            request.CipherKey,
            request.BaseUrl);
        var res = await ConfigureTenantCredentialsAsync(pcapiReq, ct);
        return MapConfigResponse(res);
    }

    async Task<ApiResponse<PhilHealthConfigStatusResponse>> IPhilHealthProxyClient.GetTenantConfigurationStatusAsync(
        CancellationToken ct)
    {
        var res = await GetTenantConfigurationStatusAsync(ct);
        return MapConfigResponse(res);
    }

    async Task<ApiResponse<string>> IPhilHealthProxyClient.TestTenantConnectionAsync(
        CancellationToken ct)
    {
        var res = await TestTenantConnectionAsync(ct);
        if (!res.Succeeded || res.Data == null)
        {
            return ApiResponse<string>.Fail(res.Message ?? "Failed to reach PhilHealth.");
        }

        return res.Data.Success
            ? ApiResponse<string>.Success(res.Data.Message, res.Data.Message)
            : ApiResponse<string>.Fail(res.Data.Message);
    }

    // ── PCAPI Stateful Sandbox / Simulation ──────────────────────────────────
    public Task<ApiResponse<SandboxStatus>> GetSandboxStatusAsync(CancellationToken ct = default) =>
        SendAsync<SandboxStatus>(PhilHealthOperations.PcapiSandboxStatus, null, null, ct);

    public Task<ApiResponse<SandboxStatus>> SetSandboxScenarioAsync(SetSandboxScenarioRequest request, CancellationToken ct = default) =>
        SendAsync<SandboxStatus>(PhilHealthOperations.PcapiSandboxScenario, request, null, ct);

    public Task<ApiResponse<SandboxStatus>> ResetSandboxAsync(CancellationToken ct = default) =>
        SendAsync<SandboxStatus>(PhilHealthOperations.PcapiSandboxReset, null, null, ct);

    private static string ResolveUploadOperation(string form) => form.ToLowerInvariant() switch
    {
        "fpe" => PhilHealthOperations.DataUploadFpe,
        "consultation" => PhilHealthOperations.DataUploadConsultation,
        "diagnostic-request" => PhilHealthOperations.DataUploadDiagnosticRequest,
        "diagnostic-results" => PhilHealthOperations.DataUploadDiagnosticResults,
        "medicine" => PhilHealthOperations.DataUploadMedicine,
        "referral" => PhilHealthOperations.DataUploadReferral,
        _ => throw new ArgumentException($"Unsupported form route '{form}'", nameof(form))
    };

    private static ApiResponse<PhilHealthConfigStatusResponse> MapConfigResponse(
        ApiResponse<TenantConfigurationStatusResponse> res)
    {
        if (!res.Succeeded || res.Data == null)
        {
            return ApiResponse<PhilHealthConfigStatusResponse>.Fail(res.Message ?? "Failed to update PhilHealth configuration.");
        }

        var d = res.Data;
        return ApiResponse<PhilHealthConfigStatusResponse>.Success(
            new PhilHealthConfigStatusResponse(
                d.TenantId,
                d.FacilityName,
                d.AccreditationNumber,
                d.PmccNumber,
                d.SoftwareCertificateId,
                d.BaseUrl,
                d.HasSecretKey && d.HasCipherKey,
                d.IsActive,
                d.UpdatedAt),
            res.Message);
    }
}
