namespace ClinicEz.Clinic.Application.Common.Privacy;

/// <summary>
/// Service providing Protected Health Information (PHI) sanitization, masking,
/// and forensic payload redaction compliant with the Philippine Data Privacy Act of 2012 (RA 10173)
/// and HIPAA privacy de-identification standards.
/// </summary>
public interface IPhiRedactionService
{
    /// <summary>
    /// Masks a patient's full name for administrative views (e.g. "Juan Dela Cruz" -> "J*** D*** C***").
    /// Supports standard whitespace-delimited names, hyphenated names, and "LastName, FirstName" formats.
    /// </summary>
    string MaskPatientName(string? name);

    /// <summary>
    /// Masks a PhilHealth Identification Number (PIN) for administrative views (e.g. "12-345678901-2" -> "12-****8901-2" or "12-****5678-9").
    /// Preserves statutory membership category prefix and check digit while masking the unique sequential identifier.
    /// </summary>
    string MaskPhilHealthPin(string? pin);

    /// <summary>
    /// Masks a contact/phone number for administrative views (e.g. "09171234567" -> "0917****567").
    /// </summary>
    string MaskPhoneNumber(string? phone);

    /// <summary>
    /// Masks an email address for administrative views (e.g. "patient@domain.com" -> "p***t@domain.com").
    /// </summary>
    string MaskEmail(string? email);

    /// <summary>
    /// Sanitizes and redacts raw JSON payloads (or change diffs) prior to immutable audit log persistence:
    /// 1. Replaces sensitive medical prose and clinical narratives with "[Clinical Text Redacted - DPA RA 10173]"
    ///    and records SHA-256 text checksums for forensic non-repudiation.
    /// 2. Replaces authentication secrets, encryption keys, tokens, and passwords with "[REDACTED_SECRET]".
    /// 3. Preserves structural forensic metadata (ICD-10, lib_pe*, lib_signs_symptoms, lib_mdiseases, lib_ncdq, lib_imm*, amounts, statuses, sequence numbers).
    /// </summary>
    string RedactPayloadJson(string? rawJson);

    /// <summary>
    /// Computes a deterministic SHA-256 hex checksum with "sha256:" prefix for forensic verification of redacted text.
    /// </summary>
    string ComputeTextChecksum(string? text);
}
