using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace ClinicEz.Clinic.Application.Features.Yakap.DTOs;

// =============================================================================
// Encrypted Payload Envelope (Annex C)
// =============================================================================

public sealed record PhilHealthEncryptedPayload
{
    [JsonPropertyName("docMimeType")] public string DocMimeType { get; init; } = "application/json";
    [JsonPropertyName("hash")] public string Hash { get; init; } = string.Empty;
    [JsonPropertyName("key1")] public string Key1 { get; init; } = string.Empty;
    [JsonPropertyName("key2")] public string Key2 { get; init; } = string.Empty;
    [JsonPropertyName("iv")] public string Iv { get; init; } = string.Empty;
    [JsonPropertyName("doc")] public string Doc { get; init; } = string.Empty;
}

// =============================================================================
// Auth Token Models (POST /api/v1/auth/token)
// =============================================================================

public sealed record PcapiTokenRequest(
    [property: JsonPropertyName("software_cert_id")] string SoftwareCertId,
    [property: JsonPropertyName("accre_no")] string AccreNo,
    [property: JsonPropertyName("secret_key")] string SecretKey);

public sealed record PcapiTokenResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("code")] int Code,
    [property: JsonPropertyName("message")] string? Message,
    [property: JsonPropertyName("data")] PcapiTokenData? Data);

public sealed record PcapiTokenData(
    [property: JsonPropertyName("access_token")] string AccessToken,
    [property: JsonPropertyName("token_type")] string TokenType,
    [property: JsonPropertyName("expires_in")] int ExpiresIn);

// =============================================================================
// Service 01: PCU Models (/api/v1/pcu)
// =============================================================================

public sealed record PcuStartRequest(
    [property: JsonPropertyName("pin")] string Pin,
    [property: JsonPropertyName("first_name")] string FirstName,
    [property: JsonPropertyName("middle_name")] string? MiddleName,
    [property: JsonPropertyName("last_name")] string LastName,
    [property: JsonPropertyName("suffix")] string? Suffix,
    [property: JsonPropertyName("birth_date")] string BirthDate); // MM/DD/YYYY

public sealed record PcuStartResponse(
    [property: JsonPropertyName("sdk_url")] string SdkUrl,
    [property: JsonPropertyName("liveness_authorization_id")] string LivenessAuthorizationId,
    [property: JsonPropertyName("status")] string? Status = "PENDING",
    [property: JsonPropertyName("expires_in")] int? ExpiresIn = 900);

public sealed record PcuVerifyRequest(
    [property: JsonPropertyName("liveness_authorization_id")] string LivenessAuthorizationId);

public sealed record PcuVerifyResponse(
    [property: JsonPropertyName("trans_no")] string TransNo,
    [property: JsonPropertyName("pin_matched")] bool PinMatched,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("member_pin")] string? MemberPin = null);

// =============================================================================
// Service 02: Primary Care Validator Models (/api/v1/philhealth-yakap-validator)
// =============================================================================

public sealed record YakapValidateStandingRequest(
    [property: JsonPropertyName("patient_pin")] string PatientPin,
    [property: JsonPropertyName("eff_year")] string EffYear,
    [property: JsonPropertyName("consent")] bool Consent = true);

public sealed record YakapValidatorResponse(
    [property: JsonPropertyName("patient_pin")] string PatientPin,
    [property: JsonPropertyName("patient_lname")] string? PatientLname,
    [property: JsonPropertyName("patient_fname")] string? PatientFname,
    [property: JsonPropertyName("patient_mname")] string? PatientMname,
    [property: JsonPropertyName("patient_extname")] string? PatientExtname,
    [property: JsonPropertyName("pcu")] PcuStatusInfo? Pcu,
    [property: JsonPropertyName("selection")] SelectionStatusInfo? Selection,
    [property: JsonPropertyName("empanelment")] EmpanelmentStatusInfo? Empanelment,
    [property: JsonPropertyName("fpe")] FpeStatusInfo? Fpe,
    [property: JsonPropertyName("consultation")] ConsultationStatusInfo? Consultation);

public sealed record PcuStatusInfo(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("trans_no")] string? TransNo = null);

public sealed record SelectionStatusInfo(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("transaction_no")] string? TransactionNo = null,
    [property: JsonPropertyName("date")] string? Date = null);

public sealed record EmpanelmentStatusInfo(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("transaction_no")] string? TransactionNo = null);

public sealed record FpeStatusInfo(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("transaction_no")] string? TransactionNo = null,
    [property: JsonPropertyName("upload_transaction_no")] string? UploadTransactionNo = null);

public sealed record ConsultationStatusInfo(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("transaction_no")] string? TransactionNo = null,
    [property: JsonPropertyName("upload_transaction_no")] string? UploadTransactionNo = null);

// =============================================================================
// Service 03: YAKAP Empanelment Models (/api/v1/yakap-empanelment)
// =============================================================================

public sealed record YakapEmpanelmentRequest(
    [property: JsonPropertyName("patient_pin")] string PatientPin,
    [property: JsonPropertyName("consent")] bool Consent,
    [property: JsonPropertyName("patient_verification_mode")] string PatientVerificationMode,
    [property: JsonPropertyName("pcu_transaction_code")] string? PcuTransactionCode = null,
    [property: JsonPropertyName("one_time_pin")] string? OneTimePin = null,
    [property: JsonPropertyName("valid_id_type")] string? ValidIdType = null,
    [property: JsonPropertyName("valid_id_image")] string? ValidIdImage = null,
    [property: JsonPropertyName("created_by")] string? CreatedBy = null);

public sealed record YakapEmpanelmentResponse(
    [property: JsonPropertyName("yes_reference_no")] string YesReferenceNo,
    [property: JsonPropertyName("patient_pin")] string PatientPin,
    [property: JsonPropertyName("accre_no")] string AccreNo,
    [property: JsonPropertyName("eff_year")] string EffYear,
    [property: JsonPropertyName("with_yes")] bool WithYes,
    [property: JsonPropertyName("with_fpe")] bool WithFpe,
    [property: JsonPropertyName("fpe_transaction_no")] string? FpeTransactionNo = null,
    [property: JsonPropertyName("pcu_transaction_code")] string? PcuTransactionCode = null);

// =============================================================================
// Service 04: YAKAP Selection Models (/api/v1/yakap-selection)
// =============================================================================

public sealed record YakapSelectionRequest(
    [property: JsonPropertyName("patient_pin")] string PatientPin,
    [property: JsonPropertyName("selection_date")] string SelectionDate, // MM/DD/YYYY
    [property: JsonPropertyName("consent")] bool Consent = true,
    [property: JsonPropertyName("patient_verification_mode")] string? PatientVerificationMode = null,
    [property: JsonPropertyName("pcu_transaction_code")] string? PcuTransactionCode = null,
    [property: JsonPropertyName("one_time_pin")] string? OneTimePin = null,
    [property: JsonPropertyName("valid_id_type")] string? ValidIdType = null,
    [property: JsonPropertyName("valid_id_image")] string? ValidIdImage = null);

public sealed record YakapSelectionResponse(
    [property: JsonPropertyName("patient_pin")] string PatientPin,
    [property: JsonPropertyName("accre_no")] string AccreNo,
    [property: JsonPropertyName("selection")] SelectionDetails Selection);

public sealed record SelectionDetails(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("transaction_no")] string TransactionNo,
    [property: JsonPropertyName("date")] string Date);

// =============================================================================
// Service 05: Masterlist Download Models (/api/v1/yakap-selection-masterlist)
// =============================================================================

public sealed record MasterlistIndividualRequest(
    [property: JsonPropertyName("patient_pin")] string PatientPin,
    [property: JsonPropertyName("eff_year")] string EffYear,
    [property: JsonPropertyName("consent")] bool Consent = true);

public sealed record MasterlistBatchRequest(
    [property: JsonPropertyName("start_date")] string StartDate, // MM/DD/YYYY
    [property: JsonPropertyName("end_date")] string EndDate,     // MM/DD/YYYY (max 7 days)
    [property: JsonPropertyName("consent")] bool Consent = true);

public sealed record MasterlistDownloadResponse(
    [property: JsonPropertyName("accre_no")] string AccreNo,
    [property: JsonPropertyName("transmittal_no")] string TransmittalNo,
    [property: JsonPropertyName("eff_year")] string? EffYear,
    [property: JsonPropertyName("start_date")] string? StartDate,
    [property: JsonPropertyName("end_date")] string? EndDate,
    [property: JsonPropertyName("total_records")] int TotalRecords,
    [property: JsonPropertyName("assignments")] IReadOnlyList<MasterlistAssignmentItem> Assignments);

public sealed record MasterlistAssignmentItem(
    [property: JsonPropertyName("patient_pin")] string PatientPin,
    [property: JsonPropertyName("last_name")] string LastName,
    [property: JsonPropertyName("first_name")] string FirstName,
    [property: JsonPropertyName("middle_name")] string? MiddleName,
    [property: JsonPropertyName("ext_name")] string? ExtName,
    [property: JsonPropertyName("birth_date")] string BirthDate,
    [property: JsonPropertyName("sex")] string Sex,
    [property: JsonPropertyName("assigned_date")] string AssignedDate,
    [property: JsonPropertyName("status")] string Status);

// =============================================================================
// Service 06: Data Upload Models (/api/v1/yakap-data-upload)
// =============================================================================

public sealed record DataUploadResponse(
    [property: JsonPropertyName("upload_transaction_no")] string UploadTransactionNo, // U... (23 chars)
    [property: JsonPropertyName("form")] string Form,
    [property: JsonPropertyName("processing_status")] string ProcessingStatus,
    [property: JsonPropertyName("case_no")] string? CaseNo = null,
    [property: JsonPropertyName("received_at")] DateTime? ReceivedAt = null);

public sealed record DataUploadStatusResponse(
    [property: JsonPropertyName("upload_transaction_no")] string UploadTransactionNo,
    [property: JsonPropertyName("form")] string Form,
    [property: JsonPropertyName("processing_status")] string ProcessingStatus,
    [property: JsonPropertyName("received_at")] DateTime? ReceivedAt = null,
    [property: JsonPropertyName("processed_at")] DateTime? ProcessedAt = null,
    [property: JsonPropertyName("record_numbers")] IReadOnlyList<string>? RecordNumbers = null,
    [property: JsonPropertyName("errors")] IReadOnlyList<DataUploadFieldError>? Errors = null);

public sealed record DataUploadFieldError(
    [property: JsonPropertyName("field")] string Field,
    [property: JsonPropertyName("issue")] string Issue);

// =============================================================================
// Service 07: Patient Verification Code (OTP) Models (/api/v1/yakap-patient-verification-code)
// =============================================================================

public sealed record VerificationCodeRequest(
    [property: JsonPropertyName("patient_pin")] string PatientPin,
    [property: JsonPropertyName("one_time_pin")] string OneTimePin,
    [property: JsonPropertyName("transaction_date")] string TransactionDate, // MM/DD/YYYY
    [property: JsonPropertyName("consent")] bool Consent = true);

public sealed record VerificationCodeResponse(
    [property: JsonPropertyName("patient_pin")] string PatientPin,
    [property: JsonPropertyName("accre_no")] string AccreNo,
    [property: JsonPropertyName("transaction_date")] string TransactionDate,
    [property: JsonPropertyName("status")] string Status);

// =============================================================================
// Service 08: Electronic Konsulta Availment Slip Models (/api/v1/yakap-availment-slip)
// =============================================================================

public sealed record AvailmentSlipRequest(
    [property: JsonPropertyName("patient_pin")] string PatientPin,
    [property: JsonPropertyName("eff_year")] string EffYear,
    [property: JsonPropertyName("consent")] bool Consent = true);

public sealed record AvailmentSlipResponse(
    [property: JsonPropertyName("patient_pin")] string PatientPin,
    [property: JsonPropertyName("eff_year")] string EffYear,
    [property: JsonPropertyName("mime_type")] string MimeType,
    [property: JsonPropertyName("pdf_base64")] string PdfBase64);

// =============================================================================
// Tenant Configuration & Status Models
// =============================================================================

public sealed record ConfigureTenantCredentialsRequest(
    Guid TenantId,
    Guid? BranchId,
    string FacilityName,
    string AccreditationNumber,
    string PmccNumber,
    string SoftwareCertificateId,
    string SecretKey,
    string CipherKey,
    string? BaseUrl = "https://pcapi.philhealth.gov.ph",
    bool IsActive = true);

public sealed record TenantConfigurationStatusResponse(
    Guid TenantId,
    Guid? BranchId,
    string FacilityName,
    string AccreditationNumber,
    string PmccNumber,
    string SoftwareCertificateId,
    bool HasSecretKey,
    bool HasCipherKey,
    string BaseUrl,
    bool IsActive,
    DateTimeOffset? UpdatedAt);

public sealed record TestTenantConnectionResponse(
    bool Success,
    string Message,
    int? StatusCode = null,
    long? LatencyMs = null);

// =============================================================================
// PCAPI Sandbox Simulation Models
// =============================================================================

public sealed record SandboxStatus(
    string CurrentScenario,
    int BeneficiariesCount,
    int SelectionsCount,
    int EmpanelmentsCount,
    int UploadsCount,
    int OtpsCount);

public sealed record SetSandboxScenarioRequest(
    string Scenario);
