using System;

namespace ClinicEz.Shared.Interoperability;

/// <summary>
/// Envelope type <c>patient.record.shared</c>: patient-api -> clinic (<c>Party.ForFacility</c>). One message per file
/// the patient attached to a booking. The file is NOT inlined: the clinic downloads it from
/// <see cref="DownloadUrl"/> before <see cref="ExpiresAtUtc"/> and stores it in its own storage.
/// CorrelationId = <see cref="DraftId"/>.
/// </summary>
public record PatientRecordSharedPayload
{
    public Guid DraftId { get; init; }
    public Guid PatientId { get; init; }
    public Guid FileId { get; init; }
    public string FileName { get; init; } = string.Empty;
    public string? MimeType { get; init; }
    public long SizeBytes { get; init; }
    public string? DocumentTypeCode { get; init; }
    /// <summary>Short-lived pre-signed download URL for the stored (unencrypted) file.</summary>
    public string DownloadUrl { get; init; } = string.Empty;
    public DateTime ExpiresAtUtc { get; init; }
    /// <summary>Optional inline base64 encoded plaintext content for zero-HTTP delivery and independent copy ingestion.</summary>
    public string? FileBase64 { get; init; }
}
