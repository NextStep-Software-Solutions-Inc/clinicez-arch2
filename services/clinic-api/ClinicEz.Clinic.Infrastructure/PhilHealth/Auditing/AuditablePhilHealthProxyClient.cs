namespace ClinicEz.Clinic.Infrastructure.PhilHealth.Auditing;

using System;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Common.Privacy;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Services;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

/// <summary>
/// Audit decorator for IPhilHealthProxyClient and IYakapPcapiClient ensuring 100% statutory event capture
/// across all PhilHealth YAKAP 2.0 (PCAPI v2.0 Services 01–08) calls with strict PIN masking (RA 10173).
/// </summary>
public sealed class AuditablePhilHealthProxyClient : IPhilHealthProxyClient, IYakapPcapiClient
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    private readonly IPhilHealthProxyClient _inner;
    private readonly IYakapPcapiClient? _pcapiInner;
    private readonly IAuditLogQueue _auditQueue;
    private readonly IClinicContext _clinicContext;
    private readonly IPhiRedactionService _redactionService;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly ILogger<AuditablePhilHealthProxyClient> _logger;

    public AuditablePhilHealthProxyClient(
        IPhilHealthProxyClient inner,
        IAuditLogQueue auditQueue,
        IClinicContext clinicContext,
        IPhiRedactionService redactionService,
        IHttpContextAccessor httpContextAccessor,
        ILogger<AuditablePhilHealthProxyClient> logger,
        IYakapPcapiClient? pcapiInner = null)
    {
        _inner = inner ?? throw new ArgumentNullException(nameof(inner));
        _pcapiInner = pcapiInner ?? (inner as IYakapPcapiClient);
        _auditQueue = auditQueue ?? throw new ArgumentNullException(nameof(auditQueue));
        _clinicContext = clinicContext ?? throw new ArgumentNullException(nameof(clinicContext));
        _redactionService = redactionService ?? throw new ArgumentNullException(nameof(redactionService));
        _httpContextAccessor = httpContextAccessor ?? throw new ArgumentNullException(nameof(httpContextAccessor));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    private IYakapPcapiClient RequirePcapiInner() =>
        _pcapiInner ?? throw new InvalidOperationException("Inner client does not implement IYakapPcapiClient.");

    // ── Service 01: PCU Liveness ─────────────────────────────────────────────
    public async Task<ApiResponse<PcuStartResponse>> StartPcuSessionAsync(PcuStartRequest request, CancellationToken ct = default)
    {
        var response = await RequirePcapiInner().StartPcuSessionAsync(request, ct);
        var maskedPin = _redactionService.MaskPhilHealthPin(request.Pin);
        EnqueueAudit(
            action: PhilHealthAuditEvents.PcuVerified,
            severity: response.Succeeded ? ClinicAuditSeverities.Routine : ClinicAuditSeverities.Urgent,
            targetEntityType: "PhilHealthIdentityVerification",
            targetEntityId: response.Data?.LivenessAuthorizationId ?? maskedPin,
            patientId: null,
            patientName: null,
            patientPin: request.Pin,
            outcome: response.Succeeded ? "Success" : "Failure",
            description: response.Succeeded
                ? $"Started face liveness check for PhilHealth member '{maskedPin}'."
                : $"Failed to start face liveness check for '{maskedPin}': {response.Message}",
            metadata: new { PinMasked = maskedPin, Stage = "Start", Succeeded = response.Succeeded });
        return response;
    }

    public async Task<ApiResponse<PcuVerifyResponse>> VerifyPcuTokenAsync(PcuVerifyRequest request, CancellationToken ct = default)
    {
        var response = await RequirePcapiInner().VerifyPcuTokenAsync(request, ct);
        var isVerified = response.Succeeded && response.Data?.PinMatched == true;
        EnqueueAudit(
            action: PhilHealthAuditEvents.PcuVerified,
            severity: isVerified ? ClinicAuditSeverities.Routine : ClinicAuditSeverities.Urgent,
            targetEntityType: "PhilHealthIdentityVerification",
            targetEntityId: response.Data?.TransNo ?? request.LivenessAuthorizationId,
            patientId: null,
            patientName: null,
            patientPin: response.Data?.MemberPin,
            outcome: isVerified ? "Success" : "Warning",
            description: isVerified
                ? $"Completed PhilHealth PCU identity verification (ref: {response.Data?.TransNo})."
                : $"PhilHealth PCU identity verification failed or did not match: {response.Message}",
            metadata: new { response.Data?.Status, response.Data?.PinMatched, response.Data?.TransNo });
        return response;
    }

    // ── Service 02: Standing Validator & PIN Format Check ────────────────────
    public async Task<ApiResponse<YakapValidatorResponse>> ValidateStandingAsync(YakapValidateStandingRequest request, CancellationToken ct = default)
    {
        var response = await RequirePcapiInner().ValidateStandingAsync(request, ct);
        var maskedPin = _redactionService.MaskPhilHealthPin(request.PatientPin);
        EnqueueAudit(
            action: PhilHealthAuditEvents.StandingValidated,
            severity: response.Succeeded ? ClinicAuditSeverities.Routine : ClinicAuditSeverities.Urgent,
            targetEntityType: "PhilHealthMember",
            targetEntityId: maskedPin,
            patientId: null,
            patientName: null,
            patientPin: request.PatientPin,
            outcome: response.Succeeded ? "Success" : "Failure",
            description: response.Succeeded
                ? $"Checked PhilHealth standing for '{maskedPin}' (Selection: {response.Data?.Selection?.Status}, Empanelment: {response.Data?.Empanelment?.Status})."
                : $"Failed PhilHealth standing check for '{maskedPin}': {response.Message}",
            metadata: new
            {
                PinMasked = maskedPin,
                EffectiveYear = request.EffYear,
                SelectionStatus = response.Data?.Selection?.Status,
                EmpanelmentStatus = response.Data?.Empanelment?.Status,
                FpeStatus = response.Data?.Fpe?.Status
            });
        return response;
    }

    public async Task<ApiResponse<bool>> ValidatePinAsync(string pin, CancellationToken ct = default)
    {
        var response = await _inner.ValidatePinAsync(pin, ct);
        var isValid = response.Succeeded && response.Data;
        var maskedPin = _redactionService.MaskPhilHealthPin(pin);

        EnqueueAudit(
            action: PhilHealthAuditEvents.PinVerified,
            severity: isValid ? ClinicAuditSeverities.Routine : ClinicAuditSeverities.Urgent,
            targetEntityType: "PhilHealthMember",
            targetEntityId: maskedPin,
            patientId: null,
            patientName: null,
            patientPin: pin,
            outcome: isValid ? "Success" : "Warning",
            description: isValid
                ? $"PhilHealth number '{maskedPin}' passed format check."
                : $"PhilHealth number '{maskedPin}' failed format check.",
            metadata: new { PinMasked = maskedPin, IsValid = isValid, ErrorMessage = response.Message });

        return response;
    }

    // ── Service 03: Empanelment ──────────────────────────────────────────────
    public async Task<ApiResponse<YakapEmpanelmentResponse>> SubmitEmpanelmentAsync(YakapEmpanelmentRequest request, CancellationToken ct = default)
    {
        var response = await RequirePcapiInner().SubmitEmpanelmentAsync(request, ct);
        var maskedPin = _redactionService.MaskPhilHealthPin(request.PatientPin);
        var ok = response.Succeeded && response.Data != null;

        EnqueueAudit(
            action: PhilHealthAuditEvents.EmpanelmentSubmitted,
            severity: ok ? ClinicAuditSeverities.Routine : ClinicAuditSeverities.Urgent,
            targetEntityType: "PhilHealthEmpanelment",
            targetEntityId: response.Data?.YesReferenceNo ?? maskedPin,
            patientId: null,
            patientName: null,
            patientPin: request.PatientPin,
            outcome: ok ? "Success" : "Failure",
            description: ok
                ? $"Submitted PhilHealth YAKAP 2.0 empanelment for '{maskedPin}' (YesRef: {response.Data!.YesReferenceNo})."
                : $"PhilHealth YAKAP 2.0 empanelment failed for '{maskedPin}': {response.Message}",
            metadata: new
            {
                PinMasked = maskedPin,
                Method = request.PatientVerificationMode,
                response.Data?.YesReferenceNo,
                response.Data?.WithYes,
                response.Data?.WithFpe
            });
        return response;
    }

    // ── Service 04: Selection ────────────────────────────────────────────────
    public async Task<ApiResponse<YakapSelectionResponse>> SubmitSelectionAsync(YakapSelectionRequest request, CancellationToken ct = default)
    {
        var response = await RequirePcapiInner().SubmitSelectionAsync(request, ct);
        var maskedPin = _redactionService.MaskPhilHealthPin(request.PatientPin);
        var ok = response.Succeeded && response.Data != null;

        EnqueueAudit(
            action: PhilHealthAuditEvents.SelectionSubmitted,
            severity: ok ? ClinicAuditSeverities.Routine : ClinicAuditSeverities.Urgent,
            targetEntityType: "PhilHealthSelection",
            targetEntityId: response.Data?.Selection?.TransactionNo ?? maskedPin,
            patientId: null,
            patientName: null,
            patientPin: request.PatientPin,
            outcome: ok ? "Success" : "Failure",
            description: ok
                ? $"Assigned PhilHealth member '{maskedPin}' to this clinic (Ref: {response.Data!.Selection.TransactionNo})."
                : $"Failed to assign PhilHealth member '{maskedPin}' to this clinic: {response.Message}",
            metadata: new
            {
                PinMasked = maskedPin,
                SelectionDate = request.SelectionDate,
                Status = response.Data?.Selection?.Status,
                TransactionNo = response.Data?.Selection?.TransactionNo
            });
        return response;
    }

    // ── Service 05: Masterlist ───────────────────────────────────────────────
    public async Task<ApiResponse<MasterlistDownloadResponse>> DownloadIndividualMasterlistAsync(MasterlistIndividualRequest request, CancellationToken ct = default)
    {
        var response = await RequirePcapiInner().DownloadIndividualMasterlistAsync(request, ct);
        var maskedPin = _redactionService.MaskPhilHealthPin(request.PatientPin);
        EnqueueAudit(
            action: PhilHealthAuditEvents.MasterlistSynced,
            severity: response.Succeeded ? ClinicAuditSeverities.Routine : ClinicAuditSeverities.Urgent,
            targetEntityType: "PhilHealthMasterlist",
            targetEntityId: maskedPin,
            patientId: null,
            patientName: null,
            patientPin: request.PatientPin,
            outcome: response.Succeeded ? "Success" : "Failure",
            description: response.Succeeded
                ? $"Downloaded PhilHealth individual assignment record for '{maskedPin}' ({request.EffYear})."
                : $"Failed downloading individual assignment record for '{maskedPin}': {response.Message}",
            metadata: new { PinMasked = maskedPin, request.EffYear, TotalRecords = response.Data?.TotalRecords ?? 0 });
        return response;
    }

    public async Task<ApiResponse<MasterlistDownloadResponse>> DownloadBatchMasterlistAsync(MasterlistBatchRequest request, CancellationToken ct = default)
    {
        var response = await RequirePcapiInner().DownloadBatchMasterlistAsync(request, ct);
        var total = response.Data?.TotalRecords ?? 0;
        EnqueueAudit(
            action: PhilHealthAuditEvents.MasterlistSynced,
            severity: response.Succeeded ? ClinicAuditSeverities.Routine : ClinicAuditSeverities.Urgent,
            targetEntityType: "PhilHealthMasterlist",
            targetEntityId: response.Data?.TransmittalNo ?? $"{request.StartDate}_{request.EndDate}",
            patientId: null,
            patientName: null,
            patientPin: null,
            outcome: response.Succeeded ? "Success" : "Failure",
            description: response.Succeeded
                ? $"Synced PhilHealth clinic roster ({total} members from {request.StartDate} to {request.EndDate})."
                : $"Failed syncing PhilHealth clinic roster ({request.StartDate} to {request.EndDate}): {response.Message}",
            metadata: new { request.StartDate, request.EndDate, TotalRecords = total, response.Data?.TransmittalNo });
        return response;
    }

    // ── Service 06: Data Upload & Status Polling ─────────────────────────────
    public Task<ApiResponse<DataUploadResponse>> UploadDataAsync(string form, PhilHealthEncryptedPayload payload, CancellationToken ct = default) =>
        AuditUploadAsync(form, payload.Hash, () => RequirePcapiInner().UploadDataAsync(form, payload, ct));

    public Task<ApiResponse<DataUploadResponse>> UploadPlainJsonAsync(string form, string plainJson, CancellationToken ct = default)
    {
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(plainJson))).ToLowerInvariant();
        return AuditUploadAsync(form, hash, () => RequirePcapiInner().UploadPlainJsonAsync(form, plainJson, ct));
    }

    private async Task<ApiResponse<DataUploadResponse>> AuditUploadAsync(
        string form,
        string payloadHash,
        Func<Task<ApiResponse<DataUploadResponse>>> execute)
    {
        var response = await execute();
        var action = string.Equals(form, "consultation", StringComparison.OrdinalIgnoreCase)
            ? PhilHealthAuditEvents.ConsultationUploaded
            : PhilHealthAuditEvents.FpeUploaded;
        var ok = response.Succeeded && response.Data != null;

        EnqueueAudit(
            action: action,
            severity: ok ? ClinicAuditSeverities.Routine : ClinicAuditSeverities.Urgent,
            targetEntityType: "YakapSubmission",
            targetEntityId: response.Data?.UploadTransactionNo ?? response.Data?.CaseNo ?? form,
            patientId: null,
            patientName: null,
            patientPin: null,
            outcome: ok ? "Success" : "Failure",
            description: ok
                ? $"Uploaded YAKAP 2.0 '{form}' record (UploadTx: {response.Data!.UploadTransactionNo}, Status: {response.Data.ProcessingStatus})."
                : $"Failed YAKAP 2.0 '{form}' upload: {response.Message}",
            metadata: new
            {
                Form = form,
                PayloadSha256 = payloadHash,
                response.Data?.UploadTransactionNo,
                response.Data?.CaseNo,
                response.Data?.ProcessingStatus
            });
        return response;
    }

    public async Task<ApiResponse<DataUploadStatusResponse>> GetUploadStatusAsync(string uploadTransactionNo, CancellationToken ct = default)
    {
        var response = await RequirePcapiInner().GetUploadStatusAsync(uploadTransactionNo, ct);
        EnqueueAudit(
            action: PhilHealthAuditEvents.SubmissionStatusPolled,
            severity: response.Data?.ProcessingStatus == "rejected" ? ClinicAuditSeverities.Urgent : ClinicAuditSeverities.Routine,
            targetEntityType: "YakapSubmission",
            targetEntityId: uploadTransactionNo,
            patientId: null,
            patientName: null,
            patientPin: null,
            outcome: response.Succeeded ? "Success" : "Failure",
            description: response.Succeeded
                ? $"Checked PhilHealth processing status for '{uploadTransactionNo}': {response.Data?.ProcessingStatus}."
                : $"Failed polling PhilHealth status for '{uploadTransactionNo}': {response.Message}",
            metadata: new
            {
                UploadTransactionNo = uploadTransactionNo,
                ProcessingStatus = response.Data?.ProcessingStatus,
                ErrorCount = response.Data?.Errors?.Count ?? 0
            });
        return response;
    }

    // ── Service 07: OTP Validation ───────────────────────────────────────────
    public async Task<ApiResponse<VerificationCodeResponse>> ValidateVerificationCodeAsync(VerificationCodeRequest request, CancellationToken ct = default)
    {
        var response = await RequirePcapiInner().ValidateVerificationCodeAsync(request, ct);
        var maskedPin = _redactionService.MaskPhilHealthPin(request.PatientPin);
        var ok = response.Succeeded && string.Equals(response.Data?.Status, "VALID", StringComparison.OrdinalIgnoreCase);

        EnqueueAudit(
            action: PhilHealthAuditEvents.OtpValidated,
            severity: ok ? ClinicAuditSeverities.Routine : ClinicAuditSeverities.Urgent,
            targetEntityType: "PhilHealthIdentityVerification",
            targetEntityId: maskedPin,
            patientId: null,
            patientName: null,
            patientPin: request.PatientPin,
            outcome: ok ? "Success" : "Warning",
            description: ok
                ? $"Validated text verification code for PhilHealth member '{maskedPin}'."
                : $"Failed text verification code check for '{maskedPin}': {response.Message}",
            metadata: new { PinMasked = maskedPin, request.TransactionDate, Status = response.Data?.Status });
        return response;
    }

    // ── Service 08: Availment Slip ───────────────────────────────────────────
    public async Task<ApiResponse<AvailmentSlipResponse>> GenerateAvailmentSlipAsync(AvailmentSlipRequest request, CancellationToken ct = default)
    {
        var response = await RequirePcapiInner().GenerateAvailmentSlipAsync(request, ct);
        var maskedPin = _redactionService.MaskPhilHealthPin(request.PatientPin);
        EnqueueAudit(
            action: PhilHealthAuditEvents.AvailmentSlipGenerated,
            severity: response.Succeeded ? ClinicAuditSeverities.Routine : ClinicAuditSeverities.Urgent,
            targetEntityType: "PhilHealthAvailmentSlip",
            targetEntityId: maskedPin,
            patientId: null,
            patientName: null,
            patientPin: request.PatientPin,
            outcome: response.Succeeded ? "Success" : "Failure",
            description: response.Succeeded
                ? $"Generated PhilHealth YAKAP confirmation slip PDF for '{maskedPin}' ({request.EffYear})."
                : $"Failed generating PhilHealth confirmation slip for '{maskedPin}': {response.Message}",
            metadata: new { PinMasked = maskedPin, request.EffYear });
        return response;
    }

    // ── Tenant Credentials & Sandbox Passthroughs ────────────────────────────
    public Task<ApiResponse<PhilHealthConfigStatusResponse>> ConfigureTenantCredentialsAsync(ConfigurePhilHealthCredentialsProxyRequest request, CancellationToken ct = default)
        => _inner.ConfigureTenantCredentialsAsync(request, ct);

    public Task<ApiResponse<PhilHealthConfigStatusResponse>> GetTenantConfigurationStatusAsync(CancellationToken ct = default)
        => _inner.GetTenantConfigurationStatusAsync(ct);

    public Task<ApiResponse<string>> TestTenantConnectionAsync(CancellationToken ct = default)
        => _inner.TestTenantConnectionAsync(ct);

    public Task<ApiResponse<TenantConfigurationStatusResponse>> ConfigureTenantCredentialsAsync(ConfigureTenantCredentialsRequest request, CancellationToken ct = default)
        => RequirePcapiInner().ConfigureTenantCredentialsAsync(request, ct);

    Task<ApiResponse<TenantConfigurationStatusResponse>> IYakapPcapiClient.GetTenantConfigurationStatusAsync(CancellationToken ct)
        => RequirePcapiInner().GetTenantConfigurationStatusAsync(ct);

    Task<ApiResponse<TestTenantConnectionResponse>> IYakapPcapiClient.TestTenantConnectionAsync(CancellationToken ct)
        => RequirePcapiInner().TestTenantConnectionAsync(ct);

    public Task<ApiResponse<SandboxStatus>> GetSandboxStatusAsync(CancellationToken ct = default)
        => RequirePcapiInner().GetSandboxStatusAsync(ct);

    public Task<ApiResponse<SandboxStatus>> SetSandboxScenarioAsync(SetSandboxScenarioRequest request, CancellationToken ct = default)
        => RequirePcapiInner().SetSandboxScenarioAsync(request, ct);

    public Task<ApiResponse<SandboxStatus>> ResetSandboxAsync(CancellationToken ct = default)
        => RequirePcapiInner().ResetSandboxAsync(ct);

    private void EnqueueAudit(
        string action,
        string severity,
        string targetEntityType,
        string? targetEntityId,
        Guid? patientId,
        string? patientName,
        string? patientPin,
        string outcome,
        string description,
        object metadata)
    {
        try
        {
            var httpContext = _httpContextAccessor.HttpContext;
            var user = httpContext?.User;

            var tenantId = !string.IsNullOrWhiteSpace(_clinicContext.TenantId) && _clinicContext.TenantId != "tenant_default"
                ? _clinicContext.TenantId
                : user?.FindFirst("tenant_id")?.Value ?? (!string.IsNullOrWhiteSpace(_clinicContext.TenantId) ? _clinicContext.TenantId : "tenant_default");

            var clinicId = _clinicContext.ClinicId != Guid.Empty
                ? _clinicContext.ClinicId
                : (Guid.TryParse(user?.FindFirst("clinic_id")?.Value, out var cid) ? cid : Guid.Empty);

            Guid? actorStaffId = _clinicContext.StaffId;
            if (!actorStaffId.HasValue && user != null && Guid.TryParse(user.FindFirst("sub")?.Value, out var sid))
            {
                actorStaffId = sid;
            }

            var actorName = user?.FindFirst("name")?.Value
                ?? user?.Identity?.Name
                ?? (actorStaffId.HasValue ? $"Staff:{actorStaffId.Value:N}" : "ClinicStaff");

            var actorRole = user?.FindFirst("staff_role")?.Value
                ?? user?.FindFirst(ClaimTypes.Role)?.Value
                ?? (user?.Identity?.IsAuthenticated == true ? "Staff" : "System");

            string? clientIp = null;
            if (httpContext != null)
            {
                if (httpContext.Request.Headers.TryGetValue("X-Forwarded-For", out var forwarded) && !string.IsNullOrWhiteSpace(forwarded))
                {
                    clientIp = forwarded.ToString().Split(',')[0].Trim();
                }
                clientIp ??= httpContext.Connection.RemoteIpAddress?.ToString();
            }
            clientIp ??= "127.0.0.1";

            var userAgent = httpContext?.Request.Headers.UserAgent.ToString() ?? "Internal/PhilHealth";

            var message = new AuditLogMessage
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                Timestamp = DateTime.UtcNow,
                Category = ClinicAuditCategories.PhilHealth,
                Severity = severity,
                Action = action,
                ActorStaffId = actorStaffId,
                ActorName = actorName,
                ActorRole = actorRole,
                ClientIpAddress = clientIp,
                UserAgent = userAgent,
                TargetEntityType = targetEntityType,
                TargetEntityId = targetEntityId,
                PatientId = patientId,
                PatientName = patientName,
                PatientPin = patientPin,
                Outcome = outcome,
                Description = description,
                MetadataJson = JsonSerializer.Serialize(metadata, JsonOptions)
            };

            _auditQueue.TryEnqueue(message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[AuditablePhilHealthProxyClient] Failed to enqueue statutory audit message for {Action}", action);
        }
    }
}
