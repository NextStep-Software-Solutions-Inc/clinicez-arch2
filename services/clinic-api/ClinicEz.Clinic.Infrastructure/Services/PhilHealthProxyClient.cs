using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Services;

/// <summary>
/// Talks to the PhilHealth proxy through the interop hub (<c>philhealth.request</c>, answered with
/// <c>philhealth.response</c>); there is no direct HTTP call to it. The proxy acts for the facility named in the signed
/// envelope sender, so no tenant or facility id travels in the request. The proxy's endpoint result comes back as the
/// <see cref="ApiResponse{T}"/> document it would have returned over HTTP; an unreachable or silent proxy becomes a failed
/// response with a clear message.
/// Supports both PCAPI v2.0 (Services 01–08) and legacy transmittal compatibility.
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

    public PhilHealthProxyClient(
        IInteropRequestClient requests,
        IClinicIdentityProvider identity,
        ILogger<PhilHealthProxyClient> logger)
    {
        _requests = requests;
        _identity = identity;
        _logger = logger;
    }

    private async Task<ApiResponse<T>> SendAsync<T>(string operation, object? body, string? argument, CancellationToken ct)
    {
        var clinic = await _identity.GetAsync(ct);
        if (clinic is null)
        {
            return ApiResponse<T>.Fail("This clinic has not been provisioned on this server, so PhilHealth cannot be reached.");
        }

        var request = new PhilHealthRequestPayload
        {
            Operation = operation,
            Argument = argument,
            Body = body is null ? null : JsonSerializer.Serialize(body, JsonOptions)
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

            return string.IsNullOrWhiteSpace(reply.Body)
                ? ApiResponse<T>.Fail($"Empty response from the PhilHealth service (HTTP {reply.StatusCode})")
                : JsonSerializer.Deserialize<ApiResponse<T>>(reply.Body, JsonOptions)
                  ?? ApiResponse<T>.Fail($"Empty response from the PhilHealth service (HTTP {reply.StatusCode})");
        }
        catch (InteropRequestTimeoutException ex)
        {
            _logger.LogWarning(ex, "[PhilHealthProxy] {Operation} timed out.", operation);
            return ApiResponse<T>.Fail("The PhilHealth service did not answer in time. Try again in a moment.");
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "[PhilHealthProxy] {Operation} returned an unreadable response.", operation);
            return ApiResponse<T>.Fail("The PhilHealth service returned a response that could not be read.");
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

    public Task<ApiResponse<bool>> ValidatePinAsync(string pin, CancellationToken ct = default) =>
        SendAsync<bool>(PhilHealthOperations.YakapPinValidate, null, pin, ct);

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
    public Task<ApiResponse<DataUploadResponse>> UploadDataAsync(string form, PhilHealthEncryptedPayload payload, CancellationToken ct = default)
    {
        var op = form.ToLowerInvariant() switch
        {
            "fpe" => PhilHealthOperations.DataUploadFpe,
            "consultation" => PhilHealthOperations.DataUploadConsultation,
            "diagnostic-request" => PhilHealthOperations.DataUploadDiagnosticRequest,
            "diagnostic-results" => PhilHealthOperations.DataUploadDiagnosticResults,
            "medicine" => PhilHealthOperations.DataUploadMedicine,
            "referral" => PhilHealthOperations.DataUploadReferral,
            _ => throw new ArgumentException($"Unsupported form route '{form}'", nameof(form))
        };
        return SendAsync<DataUploadResponse>(op, payload, null, ct);
    }

    public Task<ApiResponse<DataUploadStatusResponse>> GetUploadStatusAsync(string uploadTransactionNo, CancellationToken ct = default) =>
        SendAsync<DataUploadStatusResponse>(PhilHealthOperations.DataUploadGetStatus, null, uploadTransactionNo, ct);

    // ── Service 07: Verification Code (OTP) ─────────────────────────────────
    public Task<ApiResponse<VerificationCodeResponse>> ValidateVerificationCodeAsync(VerificationCodeRequest request, CancellationToken ct = default) =>
        SendAsync<VerificationCodeResponse>(PhilHealthOperations.GeneratePatientOtp, request, null, ct);

    // ── Service 08: Electronic Konsulta Availment Slip ──────────────────────
    public Task<ApiResponse<PhilHealthEncryptedPayload>> GenerateAvailmentSlipAsync(AvailmentSlipRequest request, CancellationToken ct = default) =>
        SendAsync<PhilHealthEncryptedPayload>(PhilHealthOperations.GenerateAvailmentSlip, request, null, ct);

    // ── Tenant Configuration & Connectivity ─────────────────────────────────
    public Task<ApiResponse<TenantConfigurationStatusResponse>> ConfigureTenantCredentialsAsync(ConfigureTenantCredentialsRequest request, CancellationToken ct = default) =>
        SendAsync<TenantConfigurationStatusResponse>(PhilHealthOperations.TenantConfigure, request, null, ct);

    public Task<ApiResponse<TenantConfigurationStatusResponse>> GetTenantConfigurationStatusAsync(CancellationToken ct = default) =>
        SendAsync<TenantConfigurationStatusResponse>(PhilHealthOperations.TenantStatus, null, null, ct);

    public Task<ApiResponse<TestTenantConnectionResponse>> TestTenantConnectionAsync(CancellationToken ct = default) =>
        SendAsync<TestTenantConnectionResponse>(PhilHealthOperations.TenantTestConnection, null, null, ct);

    // ── PCAPI Stateful Sandbox / Simulation ──────────────────────────────────
    public Task<ApiResponse<SandboxStatus>> GetSandboxStatusAsync(CancellationToken ct = default) =>
        SendAsync<SandboxStatus>(PhilHealthOperations.PcapiSandboxStatus, null, null, ct);

    public Task<ApiResponse<SandboxStatus>> SetSandboxScenarioAsync(SetSandboxScenarioRequest request, CancellationToken ct = default) =>
        SendAsync<SandboxStatus>(PhilHealthOperations.PcapiSandboxScenario, request, null, ct);

    public Task<ApiResponse<SandboxStatus>> ResetSandboxAsync(CancellationToken ct = default) =>
        SendAsync<SandboxStatus>(PhilHealthOperations.PcapiSandboxReset, null, null, ct);

    // ── Legacy Compatibility (IPhilHealthProxyClient) ────────────────────────
    public Task<ApiResponse<YakapValidationProxyResponse>> ValidateReportAsync(
        GenerateAndValidateReportProxyRequest request,
        CancellationToken ct = default) =>
        SendAsync<YakapValidationProxyResponse>(PhilHealthOperations.YakapReportValidate, request, null, ct);

    public Task<ApiResponse<YakapSubmissionProxyResponse>> SubmitReportAsync(
        GenerateAndSubmitReportProxyRequest request,
        CancellationToken ct = default) =>
        SendAsync<YakapSubmissionProxyResponse>(PhilHealthOperations.YakapReportSubmit, request, null, ct);

    public Task<ApiResponse<YakapMasterlistProxyResponse>> ExtractMasterlistAsync(
        ExtractMasterlistProxyRequest request,
        CancellationToken ct = default) =>
        SendAsync<YakapMasterlistProxyResponse>(PhilHealthOperations.YakapMasterlistExtract, request, null, ct);

    public Task<ApiResponse<SoapSimulationReportDto>> RunSoapSimulationAsync(
        RunSoapSimulationProxyRequest request,
        CancellationToken ct = default) =>
        SendAsync<SoapSimulationReportDto>(PhilHealthOperations.SoapSandboxRun, request, null, ct);

    public Task<ApiResponse<SoapSandboxStatusDto>> GetSoapSandboxStatusAsync(
        CancellationToken ct = default) =>
        SendAsync<SoapSandboxStatusDto>(PhilHealthOperations.SoapSandboxStatus, null, null, ct);

    public Task<ApiResponse<SoapSandboxStatusDto>> SetSoapSandboxScenarioAsync(
        SetSimulationScenarioRequest request,
        CancellationToken ct = default) =>
        SendAsync<SoapSandboxStatusDto>(PhilHealthOperations.SoapSandboxScenario, request, null, ct);

    public Task<ApiResponse<SoapSandboxStatusDto>> ResetSoapSandboxAsync(
        CancellationToken ct = default) =>
        SendAsync<SoapSandboxStatusDto>(PhilHealthOperations.SoapSandboxReset, null, null, ct);

    public Task<ApiResponse<PhilHealthConfigStatusResponse>> ConfigureTenantCredentialsAsync(
        ConfigurePhilHealthCredentialsProxyRequest request,
        CancellationToken ct = default) =>
        SendAsync<PhilHealthConfigStatusResponse>(PhilHealthOperations.TenantConfigure, request, null, ct);

    Task<ApiResponse<PhilHealthConfigStatusResponse>> IPhilHealthProxyClient.GetTenantConfigurationStatusAsync(
        CancellationToken ct) =>
        SendAsync<PhilHealthConfigStatusResponse>(PhilHealthOperations.TenantStatus, null, null, ct);

    Task<ApiResponse<string>> IPhilHealthProxyClient.TestTenantConnectionAsync(
        CancellationToken ct) =>
        SendAsync<string>(PhilHealthOperations.TenantTestConnection, null, null, ct);
}
