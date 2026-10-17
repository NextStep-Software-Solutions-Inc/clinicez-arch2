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
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

/// <summary>
/// Audit decorator for IPhilHealthProxyClient ensuring 100% statutory event capture
/// (pin verified, masterlist synced, transmittal generated/encrypted, soap submitted, claim rejected)
/// per RA 11223, Circular 2023-0004, and RA 10173.
/// </summary>
public sealed class AuditablePhilHealthProxyClient : IPhilHealthProxyClient
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    private readonly IPhilHealthProxyClient _inner;
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
        ILogger<AuditablePhilHealthProxyClient> logger)
    {
        _inner = inner ?? throw new ArgumentNullException(nameof(inner));
        _auditQueue = auditQueue ?? throw new ArgumentNullException(nameof(auditQueue));
        _clinicContext = clinicContext ?? throw new ArgumentNullException(nameof(clinicContext));
        _redactionService = redactionService ?? throw new ArgumentNullException(nameof(redactionService));
        _httpContextAccessor = httpContextAccessor ?? throw new ArgumentNullException(nameof(httpContextAccessor));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    // ── 1. PIN Validation (yakap.pin.verified) ────────────────────────────────
    public async Task<ApiResponse<bool>> ValidatePinAsync(string pin, CancellationToken ct = default)
    {
        var response = await _inner.ValidatePinAsync(pin, ct);

        var isValid = response.Succeeded && response.Data;
        var maskedPin = _redactionService.MaskPhilHealthPin(pin);

        var metadata = new
        {
            PinMasked = maskedPin,
            IsValid = isValid,
            ValidationMethod = "Modulus11",
            ErrorMessage = response.Message
        };

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
                ? $"PhilHealth PIN '{maskedPin}' successfully verified via Modulus-11 check."
                : $"PhilHealth PIN '{maskedPin}' verification failed or check digit invalid.",
            metadata: metadata);

        return response;
    }

    // ── 2. Masterlist Sync (yakap.masterlist.synced) ───────────────────────────
    public async Task<ApiResponse<YakapMasterlistProxyResponse>> ExtractMasterlistAsync(
        ExtractMasterlistProxyRequest request,
        CancellationToken ct = default)
    {
        var response = await _inner.ExtractMasterlistAsync(request, ct);

        var isSuccess = response.Succeeded && response.Data?.IsSuccess == true;
        var totalCount = response.Data?.TotalCount ?? 0;

        var metadata = new
        {
            AccreditationNumber = request.AccreditationNumber,
            EffectiveYear = request.EffectiveYear,
            TotalMembersSynced = totalCount,
            DtdSchema = "KonsultaMasterlist_v1.4.dtd",
            XsdSchema = "KonsultaMasterlist_v1.5.xsd",
            ErrorMessage = response.Data?.ErrorMessage ?? response.Message
        };

        EnqueueAudit(
            action: PhilHealthAuditEvents.MasterlistSynced,
            severity: isSuccess ? ClinicAuditSeverities.Routine : ClinicAuditSeverities.Urgent,
            targetEntityType: "PhilHealthMasterlist",
            targetEntityId: $"{request.AccreditationNumber}-{request.EffectiveYear}",
            patientId: null,
            patientName: null,
            patientPin: null,
            outcome: isSuccess ? "Success" : "Failure",
            description: isSuccess
                ? $"PhilHealth Konsulta masterlist synced: {totalCount} beneficiaries loaded for year {request.EffectiveYear}."
                : $"PhilHealth Konsulta masterlist sync failed for year {request.EffectiveYear}: {response.Data?.ErrorMessage ?? response.Message}",
            metadata: metadata);

        return response;
    }

    // ── 3. Transmittal Validation & Encryption (yakap.transmittal.generated / encrypted / claim.rejected)
    public async Task<ApiResponse<YakapValidationProxyResponse>> ValidateReportAsync(
        GenerateAndValidateReportProxyRequest request,
        CancellationToken ct = default)
    {
        var response = await _inner.ValidateReportAsync(request, ct);

        if (response.Succeeded && response.Data != null)
        {
            var data = response.Data;
            var rawXml = data.RawXml ?? string.Empty;
            var xmlSha256 = !string.IsNullOrEmpty(rawXml)
                ? Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawXml))).ToLowerInvariant()
                : null;

            // yakap.transmittal.generated
            var genMetadata = new
            {
                ReportTagging = request.ReportTagging,
                DtdVersion = "KonsultaData_v1.14.dtd",
                IsValid = data.IsValid,
                XmlSha256Checksum = xmlSha256,
                XmlByteCount = rawXml.Length,
                ValidationErrorsCount = data.ValidationErrors?.Count ?? 0
            };

            EnqueueAudit(
                action: PhilHealthAuditEvents.TransmittalGenerated,
                severity: data.IsValid ? ClinicAuditSeverities.Routine : ClinicAuditSeverities.Urgent,
                targetEntityType: "YakapTransmittal",
                targetEntityId: request.Document?.HciAccreNo ?? request.Document?.HciTransmittalNumber,
                patientId: null,
                patientName: null,
                patientPin: null,
                outcome: data.IsValid ? "Success" : "Failure",
                description: $"PhilHealth Yakap transmittal XML generated against KonsultaData_v1.14.dtd (Tranche {request.ReportTagging}). Status: {(data.IsValid ? "Valid" : "Deficient")}",
                metadata: genMetadata);

            // yakap.transmittal.encrypted
            if (!string.IsNullOrEmpty(data.EncryptedPayload))
            {
                var encMetadata = new
                {
                    ReportTagging = request.ReportTagging,
                    CipherAlgorithm = "AES-256-CBC",
                    Padding = "PKCS7",
                    KeyDerivation = "SHA-256",
                    PreEncryptionHash = xmlSha256,
                    EncryptedPayloadHash = data.EncryptedPayload.Length > 64 ? data.EncryptedPayload[..64] : data.EncryptedPayload
                };

                EnqueueAudit(
                    action: PhilHealthAuditEvents.TransmittalEncrypted,
                    severity: ClinicAuditSeverities.Routine,
                    targetEntityType: "YakapTransmittal",
                    targetEntityId: request.Document?.HciAccreNo ?? request.Document?.HciTransmittalNumber,
                    patientId: null,
                    patientName: null,
                    patientPin: null,
                    outcome: "Success",
                    description: "PhilHealth Yakap transmittal payload encrypted using AES-256-CBC (Annex D compliant).",
                    metadata: encMetadata);
            }

            // yakap.claim.rejected (if DTD validation failed)
            if (!data.IsValid)
            {
                var rejMetadata = new
                {
                    ReportTagging = request.ReportTagging,
                    RejectionStage = "Validation",
                    ValidationErrors = data.ValidationErrors
                };

                EnqueueAudit(
                    action: PhilHealthAuditEvents.ClaimRejected,
                    severity: ClinicAuditSeverities.Urgent,
                    targetEntityType: "YakapTransmittal",
                    targetEntityId: request.Document?.HciAccreNo ?? request.Document?.HciTransmittalNumber,
                    patientId: null,
                    patientName: null,
                    patientPin: null,
                    outcome: "Failure",
                    description: $"PhilHealth Yakap transmittal rejected during DTD validation: {string.Join("; ", data.ValidationErrors ?? new List<string>())}",
                    metadata: rejMetadata);
            }
        }

        return response;
    }

    // ── 4. SOAP Submission (yakap.soap.submitted / claim.rejected) ─────────────
    public async Task<ApiResponse<YakapSubmissionProxyResponse>> SubmitReportAsync(
        GenerateAndSubmitReportProxyRequest request,
        CancellationToken ct = default)
    {
        var response = await _inner.SubmitReportAsync(request, ct);

        var isSuccess = response.Succeeded && response.Data?.IsSuccess == true;
        var transNo = response.Data?.TransactionNumber;

        var subMetadata = new
        {
            ReportTagging = request.ReportTagging,
            PhilHealthTransactionNumber = transNo,
            SoapAction = "http://philhealth.gov.ph/submitReport",
            IsSuccess = isSuccess,
            ValidationErrors = response.Data?.ValidationErrors
        };

        // yakap.soap.submitted
        EnqueueAudit(
            action: PhilHealthAuditEvents.SoapSubmitted,
            severity: isSuccess ? ClinicAuditSeverities.Routine : ClinicAuditSeverities.Urgent,
            targetEntityType: "YakapTransmittal",
            targetEntityId: transNo ?? request.Document?.HciAccreNo,
            patientId: null,
            patientName: null,
            patientPin: null,
            outcome: isSuccess ? "Success" : "Failure",
            description: isSuccess
                ? $"PhilHealth Yakap transmittal submitted via SOAP. PhilHealth Transaction Number: {transNo}"
                : $"PhilHealth Yakap SOAP submission rejected: {string.Join("; ", response.Data?.ValidationErrors ?? new List<string>())}",
            metadata: subMetadata);

        // yakap.claim.rejected (if PhilHealth SOAP rejected transmission)
        if (!isSuccess && response.Data != null)
        {
            var rejMetadata = new
            {
                ReportTagging = request.ReportTagging,
                RejectionStage = "SOAP Submission",
                RejectionReasons = response.Data.ValidationErrors
            };

            EnqueueAudit(
                action: PhilHealthAuditEvents.ClaimRejected,
                severity: ClinicAuditSeverities.Urgent,
                targetEntityType: "YakapTransmittal",
                targetEntityId: transNo ?? request.Document?.HciAccreNo,
                patientId: null,
                patientName: null,
                patientPin: null,
                outcome: "Failure",
                description: $"PhilHealth statutory transmittal rejected by gateway: {string.Join("; ", response.Data.ValidationErrors ?? new List<string>())}",
                metadata: rejMetadata);
        }

        return response;
    }

    public Task<ApiResponse<SoapSimulationReportDto>> RunSoapSimulationAsync(RunSoapSimulationProxyRequest request, CancellationToken ct = default)
        => _inner.RunSoapSimulationAsync(request, ct);
    public Task<ApiResponse<SoapSandboxStatusDto>> GetSoapSandboxStatusAsync(CancellationToken ct = default)
        => _inner.GetSoapSandboxStatusAsync(ct);
    public Task<ApiResponse<SoapSandboxStatusDto>> SetSoapSandboxScenarioAsync(SetSimulationScenarioRequest request, CancellationToken ct = default)
        => _inner.SetSoapSandboxScenarioAsync(request, ct);
    public Task<ApiResponse<SoapSandboxStatusDto>> ResetSoapSandboxAsync(CancellationToken ct = default)
        => _inner.ResetSoapSandboxAsync(ct);
    public Task<ApiResponse<PhilHealthConfigStatusResponse>> ConfigureTenantCredentialsAsync(ConfigurePhilHealthCredentialsProxyRequest request, CancellationToken ct = default)
        => _inner.ConfigureTenantCredentialsAsync(request, ct);
    public Task<ApiResponse<PhilHealthConfigStatusResponse>> GetTenantConfigurationStatusAsync(CancellationToken ct = default)
        => _inner.GetTenantConfigurationStatusAsync(ct);
    public Task<ApiResponse<string>> TestTenantConnectionAsync(CancellationToken ct = default)
        => _inner.TestTenantConnectionAsync(ct);

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
            if (!actorStaffId.HasValue && user != null)
            {
                if (Guid.TryParse(user.FindFirst("sub")?.Value, out var sid))
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
