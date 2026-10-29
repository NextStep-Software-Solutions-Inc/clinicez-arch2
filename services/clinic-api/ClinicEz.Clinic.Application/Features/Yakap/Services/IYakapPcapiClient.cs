using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Shared.Common;

namespace ClinicEz.Clinic.Application.Features.Yakap.Services;

/// <summary>
/// Client interface for PhilHealth PCAPI v2.0 (rev20261026) operations dispatched over the Interop Hub.
/// Supports Services 01 through 08, Tenant Credentials, and Sandbox Simulation.
/// </summary>
public interface IYakapPcapiClient
{
    // ── Service 01: PCU Facial Liveness ─────────────────────────────────────
    Task<ApiResponse<PcuStartResponse>> StartPcuSessionAsync(PcuStartRequest request, CancellationToken ct = default);
    Task<ApiResponse<PcuVerifyResponse>> VerifyPcuTokenAsync(PcuVerifyRequest request, CancellationToken ct = default);

    // ── Service 02: Standing Validator ──────────────────────────────────────
    Task<ApiResponse<YakapValidatorResponse>> ValidateStandingAsync(YakapValidateStandingRequest request, CancellationToken ct = default);
    Task<ApiResponse<bool>> ValidatePinAsync(string pin, CancellationToken ct = default);

    // ── Service 03: YAKAP Empanelment ───────────────────────────────────────
    Task<ApiResponse<YakapEmpanelmentResponse>> SubmitEmpanelmentAsync(YakapEmpanelmentRequest request, CancellationToken ct = default);

    // ── Service 04: YAKAP Selection ──────────────────────────────────────────
    Task<ApiResponse<YakapSelectionResponse>> SubmitSelectionAsync(YakapSelectionRequest request, CancellationToken ct = default);

    // ── Service 05: Masterlist ───────────────────────────────────────────────
    Task<ApiResponse<MasterlistDownloadResponse>> DownloadIndividualMasterlistAsync(MasterlistIndividualRequest request, CancellationToken ct = default);
    Task<ApiResponse<MasterlistDownloadResponse>> DownloadBatchMasterlistAsync(MasterlistBatchRequest request, CancellationToken ct = default);

    // ── Service 06: Data Upload (Annex A - F) ───────────────────────────────
    Task<ApiResponse<DataUploadResponse>> UploadDataAsync(string form, PhilHealthEncryptedPayload payload, CancellationToken ct = default);
    Task<ApiResponse<DataUploadStatusResponse>> GetUploadStatusAsync(string uploadTransactionNo, CancellationToken ct = default);

    // ── Service 07: Verification Code (OTP) ─────────────────────────────────
    Task<ApiResponse<VerificationCodeResponse>> ValidateVerificationCodeAsync(VerificationCodeRequest request, CancellationToken ct = default);

    // ── Service 08: Electronic Konsulta Availment Slip ──────────────────────
    Task<ApiResponse<PhilHealthEncryptedPayload>> GenerateAvailmentSlipAsync(AvailmentSlipRequest request, CancellationToken ct = default);

    // ── Tenant Credentials & Connectivity ───────────────────────────────────
    Task<ApiResponse<TenantConfigurationStatusResponse>> ConfigureTenantCredentialsAsync(ConfigureTenantCredentialsRequest request, CancellationToken ct = default);
    Task<ApiResponse<TenantConfigurationStatusResponse>> GetTenantConfigurationStatusAsync(CancellationToken ct = default);
    Task<ApiResponse<TestTenantConnectionResponse>> TestTenantConnectionAsync(CancellationToken ct = default);

    // ── PCAPI Stateful Sandbox / Simulation ──────────────────────────────────
    Task<ApiResponse<SandboxStatus>> GetSandboxStatusAsync(CancellationToken ct = default);
    Task<ApiResponse<SandboxStatus>> SetSandboxScenarioAsync(SetSandboxScenarioRequest request, CancellationToken ct = default);
    Task<ApiResponse<SandboxStatus>> ResetSandboxAsync(CancellationToken ct = default);
}
