namespace ClinicEz.Shared.Interoperability;

// Request/reply contracts carried over the interop hub in place of direct service-to-service HTTP.
// A request and its reply share the same envelope CorrelationId. Bodies are raw JSON text so a service can pass
// a controller-shaped document through unchanged; the DTO types behind them stay in the owning services.

/// <summary>
/// Clinic -> pharmacy (<c>InteropTypes.GamotLookupRequested</c>). One read-only call into the pharmacy's GAMOT
/// drug reference API, expressed as the HTTP call it replaces. <c>To</c> is the pharmacy facility of the clinic's
/// tenant; the pharmacy answers only for senders of its own tenant.
/// </summary>
public sealed record GamotLookupRequestedPayload
{
    /// <summary>HTTP method, upper case. Only <c>GET</c> and <c>POST</c> are served.</summary>
    public string Method { get; init; } = "GET";

    /// <summary>Path below <c>/api/v1/gamot/</c>, without a leading slash (for example <c>drugs/search</c>).</summary>
    public string Path { get; init; } = string.Empty;

    /// <summary>Raw query string without the leading <c>?</c> (null when none).</summary>
    public string? Query { get; init; }

    /// <summary>Raw JSON request body for <c>POST</c> (null when none).</summary>
    public string? Body { get; init; }
}

/// <summary>Pharmacy -> clinic (<c>InteropTypes.GamotLookupResponded</c>). What the HTTP endpoint would have returned.</summary>
public sealed record GamotLookupRespondedPayload
{
    public int StatusCode { get; init; } = 200;
    public string? ContentType { get; init; }

    /// <summary>Response body text (JSON), null when empty.</summary>
    public string? Body { get; init; }
}

/// <summary>
/// The operations of <see cref="PhilHealthRequestPayload.Operation"/>. Each maps to one endpoint of the PhilHealth proxy;
/// the tenant and facility the operation acts for are always the verified envelope <c>From</c>, never a payload field.
/// Upgraded for PCAPI v2.0 (Services 01–08 + Tenant + Sandbox operations).
/// </summary>
public static class PhilHealthOperations
{
    // =========================================================================
    // PCAPI v2.0 Services 01–08 Operations
    // =========================================================================

    /// <summary>Service 01: PCU Facial Liveness — Initialize verification session. <c>Body</c>: StartPcuSessionRequest JSON.</summary>
    public const string PcuStart = "pcapi.pcu.start";

    /// <summary>Service 01: PCU Facial Liveness — Verify completed liveness token. <c>Body</c>: VerifyPcuTokenRequest JSON.</summary>
    public const string PcuVerify = "pcapi.pcu.verify";

    /// <summary>Service 02: Standing Validator — Verify patient PhilHealth eligibility/standing. <c>Argument</c>: PIN or <c>Body</c>: StandingValidationRequest JSON.</summary>
    public const string YakapValidateStanding = "pcapi.yakap.validate-standing";

    /// <summary>Service 03: Empanelment — Generate MCA reference number. <c>Body</c>: EmpanelmentRequest JSON.</summary>
    public const string YakapEmpanel = "pcapi.yakap.empanel";

    /// <summary>Service 04: Selection — Generate K-transaction number for encounter. <c>Body</c>: SelectionRequest JSON.</summary>
    public const string YakapSelect = "pcapi.yakap.select";

    /// <summary>Service 05: Masterlist — Query single patient empanelment status. <c>Argument</c>: PIN.</summary>
    public const string MasterlistDownloadIndividual = "pcapi.masterlist.download.individual";

    /// <summary>Service 05: Masterlist — Download 7-day batch empanelment masterlist. <c>Body</c>: MasterlistBatchRequest JSON.</summary>
    public const string MasterlistDownloadBatch = "pcapi.masterlist.download.batch";

    /// <summary>Service 06: Data Upload — Upload First Patient Encounter (FPE) Annex A. <c>Body</c>: FpeUploadRequest JSON.</summary>
    public const string DataUploadFpe = "pcapi.data-upload.fpe";

    /// <summary>Service 06: Data Upload — Upload Subsequent Consultation Encounter Annex B. <c>Body</c>: ConsultationUploadRequest JSON.</summary>
    public const string DataUploadConsultation = "pcapi.data-upload.consultation";

    /// <summary>Service 06: Data Upload — Upload Diagnostic Request Annex C. <c>Body</c>: DiagnosticRequestUploadRequest JSON.</summary>
    public const string DataUploadDiagnosticRequest = "pcapi.data-upload.diagnostic-request";

    /// <summary>Service 06: Data Upload — Upload Diagnostic Examination Results Annex D. <c>Body</c>: DiagnosticResultsUploadRequest JSON.</summary>
    public const string DataUploadDiagnosticResults = "pcapi.data-upload.diagnostic-results";

    /// <summary>Service 06: Data Upload — Upload Prescribed/Dispensed Medicine Annex E. <c>Body</c>: MedicineUploadRequest JSON.</summary>
    public const string DataUploadMedicine = "pcapi.data-upload.medicine";

    /// <summary>Service 06: Data Upload — Upload Patient Referral Annex F. <c>Body</c>: ReferralUploadRequest JSON.</summary>
    public const string DataUploadReferral = "pcapi.data-upload.referral";

    /// <summary>Service 06: Data Upload — Query processing status of 23B upload transaction (U...). <c>Argument</c>: UploadTransactionNo.</summary>
    public const string DataUploadGetStatus = "pcapi.data-upload.get-status";

    /// <summary>Service 07: Verification Code — Request patient SMS OTP. <c>Body</c>: GenerateOtpRequest JSON.</summary>
    public const string GeneratePatientOtp = "pcapi.patient-otp.generate";

    /// <summary>Service 08: Availment Slip — Retrieve decrypted Availment Slip PDF. <c>Body</c>: AvailmentSlipRequest JSON.</summary>
    public const string GenerateAvailmentSlip = "pcapi.availment-slip.generate";

    // =========================================================================
    // Tenant Credentials & Connectivity Operations
    // =========================================================================

    /// <summary>Store the facility's PhilHealth PCAPI credentials. <c>Body</c>: configuration JSON.</summary>
    public const string TenantConfigure = "tenant.configure";

    /// <summary>Query the facility's PhilHealth PCAPI registration status.</summary>
    public const string TenantStatus = "tenant.status";

    /// <summary>Perform live test authentication against PhilHealth PCAPI /api/v1/auth/token.</summary>
    public const string TenantTestConnection = "tenant.test-connection";

    // =========================================================================
    // PCAPI Deterministic Sandbox / Simulation Operations
    // =========================================================================

    /// <summary>Query stateful PCAPI sandbox metrics and pending simulation queue.</summary>
    public const string PcapiSandboxStatus = "pcapi-sandbox.status";

    /// <summary>Inject or select a PCAPI sandbox test scenario (e.g. failure injection, slow processing).</summary>
    public const string PcapiSandboxScenario = "pcapi-sandbox.scenario";

    /// <summary>Reset PCAPI sandbox state to clean initial baseline.</summary>
    public const string PcapiSandboxReset = "pcapi-sandbox.reset";

    // Legacy Konsulta v1.14 XML/SOAP Operations (Preserved for backward compatibility)
    public const string YakapReportValidate = "yakap.report.validate";
    public const string YakapReportSubmit = "yakap.report.submit";
    public const string YakapMasterlistExtract = "yakap.masterlist.extract";
    public const string YakapPinValidate = "yakap.pin.validate";
    public const string SoapSandboxRun = "soap-sandbox.run";
    public const string SoapSandboxStatus = "soap-sandbox.status";
    public const string SoapSandboxScenario = "soap-sandbox.scenario";
    public const string SoapSandboxReset = "soap-sandbox.reset";

    /// <summary>All active PCAPI v2.0 operation constant strings.</summary>
    public static readonly IReadOnlyList<string> All =
    [
        PcuStart, PcuVerify, YakapValidateStanding, YakapEmpanel, YakapSelect,
        MasterlistDownloadIndividual, MasterlistDownloadBatch,
        DataUploadFpe, DataUploadConsultation, DataUploadDiagnosticRequest, DataUploadDiagnosticResults,
        DataUploadMedicine, DataUploadReferral, DataUploadGetStatus,
        GeneratePatientOtp, GenerateAvailmentSlip,
        TenantConfigure, TenantStatus, TenantTestConnection,
        PcapiSandboxStatus, PcapiSandboxScenario, PcapiSandboxReset,
        // Include legacy constants for dictionary / validator backwards compatibility
        YakapReportValidate, YakapReportSubmit, YakapMasterlistExtract, YakapPinValidate,
        SoapSandboxRun, SoapSandboxStatus, SoapSandboxScenario, SoapSandboxReset
    ];
}

/// <summary>
/// Facility (clinic) -> PhilHealth proxy (<c>InteropTypes.PhilHealthRequest</c>, <c>To</c> =
/// <c>Party.PhilHealth</c>, a platform service in the cloud cell). Facility clients may address the proxy only with this type.
/// </summary>
public sealed record PhilHealthRequestPayload
{
    /// <summary>One of <see cref="PhilHealthOperations"/>.</summary>
    public string Operation { get; init; } = string.Empty;

    /// <summary>Single scalar argument (e.g. PIN or UploadTransactionNo).</summary>
    public string? Argument { get; init; }

    /// <summary>Raw JSON body of the operation, when it takes one.</summary>
    public string? Body { get; init; }
}

/// <summary>PhilHealth proxy -> requesting facility (<c>InteropTypes.PhilHealthResponse</c>). The proxy's endpoint result.</summary>
public sealed record PhilHealthResponsePayload
{
    /// <summary>The HTTP status the endpoint would have returned (200, 400, 404, 502, ...).</summary>
    public int StatusCode { get; init; } = 200;

    /// <summary>The endpoint's JSON response body (an <c>ApiResponse&lt;T&gt;</c> document), null when empty.</summary>
    public string? Body { get; init; }
}

/// <summary>
/// A facility's PhilHealth PCAPI credentials. Secret-bearing: only ever addressed to the proxy (or to the portal that owns it).
/// Upgraded from SOAP credentials to PCAPI v2.0 specification.
/// </summary>
public sealed record PhilHealthConfigPayload
{
    public string TenantId { get; init; } = string.Empty;

    /// <summary>The facility (branch) the settings belong to; null for tenant-level default settings.</summary>
    public string? BranchId { get; init; }

    public string FacilityName { get; init; } = string.Empty;

    /// <summary>PhilHealth Software Certificate ID (software_cert_id).</summary>
    public string SoftwareCertificateId { get; init; } = string.Empty;

    /// <summary>Official 9-character PhilHealth Accreditation Number (accre_no, e.g. H91000001 or K91000001).</summary>
    public string AccreditationNumber { get; init; } = string.Empty;

    /// <summary>Official PhilHealth PMCC Number.</summary>
    public string PmccNumber { get; init; } = string.Empty;

    /// <summary>PCAPI API Secret Key used for /api/v1/auth/token bearer generation.</summary>
    public string SecretKey { get; init; } = string.Empty;

    /// <summary>PCAPI Annex C AES-256-CBC 32-character symmetric payload cipher key.</summary>
    public string CipherKey { get; init; } = string.Empty;

    /// <summary>Upstream PCAPI Gateway Base URL (e.g. https://pcapi.philhealth.gov.ph or sandbox URL).</summary>
    public string BaseUrl { get; init; } = "https://pcapi.philhealth.gov.ph";

    /// <summary>Whether this facility is active and accredited for PhilHealth YAKAP services.</summary>
    public bool IsActive { get; init; }

    // Legacy SOAP Credential Fallbacks (Preserved for backward compatibility)
    public string Username { get; init; } = string.Empty;
    public string Password { get; init; } = string.Empty;
    public string KonsultaEndpoint { get; init; } = string.Empty;
}

/// <summary>PhilHealth proxy -> portal (<c>InteropTypes.PhilHealthConfigRequested</c>, From = <c>Party.PhilHealth</c>). Asks for a facility's credentials.</summary>
public sealed record PhilHealthConfigRequestedPayload
{
    public string TenantId { get; init; } = string.Empty;
    public string? BranchId { get; init; }
}

/// <summary>Portal -> PhilHealth proxy (<c>InteropTypes.PhilHealthConfigResponded</c>). Addressed to the proxy only.</summary>
public sealed record PhilHealthConfigRespondedPayload
{
    public bool Found { get; init; }

    /// <summary>The credentials, present when <see cref="Found"/>.</summary>
    public PhilHealthConfigPayload? Config { get; init; }
}

/// <summary>
/// PhilHealth proxy -> portal (<c>InteropTypes.PhilHealthConfigUpsertRequested</c>, From = <c>Party.PhilHealth</c>). Payload:
/// <see cref="PhilHealthConfigPayload"/>. The portal stores the credentials and answers with
/// <see cref="PhilHealthConfigUpsertRespondedPayload"/>.
/// </summary>
public sealed record PhilHealthConfigUpsertRespondedPayload
{
    public bool Succeeded { get; init; }

    /// <summary>A short, secret-free explanation when not <see cref="Succeeded"/>.</summary>
    public string? Message { get; init; }
}

// =============================================================================
// YAKAP 2.0 Zero-PHI HQ-to-Clinic Interop Payloads
// =============================================================================

/// <summary>
/// Portal -> clinic (<c>InteropTypes.YakapSubmissionRequested</c>). Request payload for YAKAP 2.0 Zero-PHI submission telemetry,
/// polling, retry, and branch Masterlist synchronization.
/// </summary>
public sealed record YakapSubmissionRequestedPayload
{
    /// <summary>HTTP method, upper case (GET or POST).</summary>
    public string Method { get; init; } = "GET";

    /// <summary>Relative operation path below <c>api/v1/yakap/</c> (e.g. <c>submissions/summary</c>, <c>submissions</c>, <c>submissions/{id}/poll</c>, <c>submissions/{id}/retry</c>, <c>masterlist/sync</c>).</summary>
    public string Path { get; init; } = string.Empty;

    /// <summary>Query string without leading <c>?</c> (e.g. <c>branchId=...&amp;page=1</c>).</summary>
    public string? Query { get; init; }

    /// <summary>JSON body for POST operations (null when none).</summary>
    public string? Body { get; init; }
}

/// <summary>
/// Clinic -> portal (<c>InteropTypes.YakapSubmissionResponded</c>). Zero-PHI result of the YAKAP 2.0 telemetry or submission operation.
/// </summary>
public sealed record YakapSubmissionRespondedPayload
{
    public int StatusCode { get; init; } = 200;
    public string? ContentType { get; init; } = "application/json";

    /// <summary>Response body text (JSON), carrying the Zero-PHI ApiResponse envelope.</summary>
    public string? Body { get; init; }
}

// =============================================================================
// Zero-PHI Shared DTO Contracts for HQ Console & Telemetry
// =============================================================================

/// <summary>
/// Zero-PHI branch YAKAP 2.0 dashboard summary and KPI indicators.
/// STRICT ZERO-PHI INVARIANT: Zero patient names, zero PINs, zero diagnoses.
/// </summary>
public sealed record PortalYakapBranchSummaryDto
{
    public Guid BranchId { get; init; }
    public string? AccreditationNo { get; init; }
    public int EmpaneledCount { get; init; }
    public int SelectedCount { get; init; }
    public int AcceptedUploadsCount { get; init; }
    public int PendingPollingCount { get; init; }
    public int RejectedOrFailedCount { get; init; }
    public IReadOnlyDictionary<string, int> SubmissionsByType { get; init; } = new Dictionary<string, int>();
    public DateTime? LastMasterlistSyncAtUtc { get; init; }
    public int MasterlistTotalCount { get; init; }
}

/// <summary>
/// Zero-PHI individual YAKAP 2.0 submission telemetry record.
/// STRICT ZERO-PHI INVARIANT: Zero patient names, zero PINs, zero diagnoses.
/// Exposes strictly anonymized PatientCode, transaction IDs, statuses, hashes, and field error codes.
/// </summary>
public sealed record PortalYakapSubmissionDto
{
    public Guid Id { get; init; }
    public required string PatientCode { get; init; }
    public string AccreditationNo { get; init; } = string.Empty;
    public string CaseNo { get; init; } = string.Empty;
    public required string SubmissionType { get; init; }
    public string ReportStatus { get; init; } = "U";
    public required string LocalTransactionNo { get; init; }
    public string? UploadTransactionNo { get; init; }
    public string? YesReferenceNo { get; init; }
    public required string ProcessingStatus { get; init; }
    public string? PayloadSha256Hash { get; init; }
    public DateTime? SubmittedAtUtc { get; init; }
    public DateTime? LastPolledAtUtc { get; init; }
    public DateTime? CompletedAtUtc { get; init; }
    public int AttemptCount { get; init; }
    public string? LastErrorMessage { get; init; }
    public IReadOnlyList<PortalYakapSubmissionErrorDto> Errors { get; init; } = [];
}

/// <summary>
/// Field-level validation or upload issue returned by PhilHealth or local readiness validators.
/// Zero patient data: contains field path, message, and error code only.
/// </summary>
public sealed record PortalYakapSubmissionErrorDto
{
    public string FieldPath { get; init; } = string.Empty;
    public string Issue { get; init; } = string.Empty;
    public string? ErrorCode { get; init; }
}

/// <summary>
/// Result of an automated or manual Service 05 Masterlist synchronization.
/// </summary>
public sealed record PortalYakapMasterlistSyncResultDto
{
    public bool Success { get; init; }
    public int RecordsAdded { get; init; }
    public int RecordsUpdated { get; init; }
    public int TotalActiveCount { get; init; }
    public DateTime SyncedAtUtc { get; init; }
    public string? Message { get; init; }
}

// =============================================================================
// Legacy Tranche 1/2 XML Contracts (Preserved for backwards compatibility during migration)
// =============================================================================

/// <summary>
/// Legacy Portal -> clinic (<c>InteropTypes.YakapTransmittalRequested</c>). Request payload for XML transmittal operations.
/// </summary>
public sealed record YakapTransmittalRequestedPayload
{
    public string Method { get; init; } = "GET";
    public string Path { get; init; } = string.Empty;
    public string? Query { get; init; }
    public string? Body { get; init; }
}

/// <summary>
/// Legacy Clinic -> portal (<c>InteropTypes.YakapTransmittalResponded</c>). Result of the XML transmittal operation.
/// </summary>
public sealed record YakapTransmittalRespondedPayload
{
    public int StatusCode { get; init; } = 200;
    public string? ContentType { get; init; } = "application/json";
    public string? Body { get; init; }
}
