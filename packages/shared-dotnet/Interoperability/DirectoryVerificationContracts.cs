using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;
using ClinicEz.Shared.Common;

namespace ClinicEz.Shared.Interoperability;

/// <summary>
/// Practitioner verification submission bundled inside a facility verification request.
/// Contains object storage keys rather than raw binary evidence.
/// </summary>
public sealed record BundledPractitionerSubmissionDto
{
    public Guid ClinicStaffMemberId { get; init; }
    public string ProfessionKind { get; init; } = string.Empty;
    public string FirstName { get; init; } = string.Empty;
    public string LastName { get; init; } = string.Empty;
    public string? Title { get; init; }
    public string SubmittedPrcLicenseNo { get; init; } = string.Empty;
    public string NormalizedPrcLicenseNo { get; init; } = string.Empty;
    public DateOnly? PrcExpiryDate { get; init; }
    public string? PrcEvidenceObjectKey { get; init; }
    public string? VerificationContact { get; init; }
    public string? Specialty { get; init; }
    public string? PublicBio { get; init; }
    public string? AvatarUrl { get; init; }
    public IReadOnlyList<ProviderAvailabilityWindowDto> Availabilities { get; init; } = Array.Empty<ProviderAvailabilityWindowDto>();
}

/// <summary>
/// Clinic -> portal, type <c>facility.verification.requested</c> (<c>InteropTypes.FacilityVerificationRequested</c>).
/// Submits a clinic's public directory profile, service schedule, and bundled practitioner verification entries for platform review.
/// </summary>
public sealed record FacilityVerificationRequestedPayload
{
    public Guid RequestId { get; init; }
    public string TenantId { get; init; } = string.Empty;
    public Guid FacilityId { get; init; }
    public string FacilityName { get; init; } = string.Empty;
    public string? FacilitySlug { get; init; }
    public string? Classification { get; init; }
    public string? DohLtoNumber { get; init; }
    public DateOnly? DohLtoExpiryDate { get; init; }
    public string? LtoEvidenceObjectKey { get; init; }
    public string? Address { get; init; }
    public string? ContactNumber { get; init; }
    public string? ContactEmail { get; init; }
    public string? OperatingHours { get; init; }
    public bool IsOnlineBookingPaused { get; init; }
    public string? PhilHealthAccreditationNumber { get; init; }
    public bool IsPhilHealthAccredited { get; init; }
    public bool SupportsInPerson { get; init; } = true;
    public bool SupportsTeleconsult { get; init; }
    public string RequestKind { get; init; } = string.Empty;
    public string? SubmittedByClinicUserId { get; init; }
    public string? SubmittedByDisplayName { get; init; }
    public DateTime SubmittedAtUtc { get; init; } = DateTime.UtcNow;
    public IReadOnlyList<ClinicServiceDto> Services { get; init; } = Array.Empty<ClinicServiceDto>();
    public IReadOnlyList<BundledPractitionerSubmissionDto> Practitioners { get; init; } = Array.Empty<BundledPractitionerSubmissionDto>();
}

/// <summary>
/// Clinic -> portal, type <c>facility.verification.withdrawn</c> (<c>InteropTypes.FacilityVerificationWithdrawn</c>).
/// Notifies the portal that a clinic withdrew its directory listing or pending verification request.
/// </summary>
public sealed record FacilityVerificationWithdrawnPayload
{
    public string TenantId { get; init; } = string.Empty;
    public Guid FacilityId { get; init; }
    public string? WithdrawnByActor { get; init; }
    public string? Reason { get; init; }
    public DateTime WithdrawnAtUtc { get; init; } = DateTime.UtcNow;
}

/// <summary>
/// Portal -> clinic, type <c>facility.verification.rejected</c> (<c>InteropTypes.FacilityVerificationRejected</c>).
/// Communicates platform review rejection or suspension details for a clinic verification request.
/// </summary>
public sealed record FacilityVerificationRejectedPayload
{
    public Guid RequestId { get; init; }
    public string TenantId { get; init; } = string.Empty;
    public Guid FacilityId { get; init; }
    public string Status { get; init; } = string.Empty;
    public string Reason { get; init; } = string.Empty;
    public string? ReviewedByAdminUserId { get; init; }
    public DateTime ReviewedAtUtc { get; init; } = DateTime.UtcNow;
}

/// <summary>
/// Clinic -> portal, type <c>practitioner.verification.requested</c> (<c>InteropTypes.PractitionerVerificationRequested</c>).
/// Submits an individual practitioner's PRC credential evidence and directory profile for platform verification.
/// </summary>
public sealed record PractitionerVerificationRequestedPayload
{
    public Guid RequestId { get; init; }
    public string TenantId { get; init; } = string.Empty;
    public Guid FacilityId { get; init; }
    public string FacilityName { get; init; } = string.Empty;
    public Guid ClinicStaffMemberId { get; init; }
    public string RequestKind { get; init; } = string.Empty;
    public string ProfessionKind { get; init; } = string.Empty;
    public string FirstName { get; init; } = string.Empty;
    public string LastName { get; init; } = string.Empty;
    public string? Title { get; init; }
    public string SubmittedPrcLicenseNo { get; init; } = string.Empty;
    public string NormalizedPrcLicenseNo { get; init; } = string.Empty;
    public DateOnly? PrcExpiryDate { get; init; }
    public string? PrcEvidenceObjectKey { get; init; }
    public string? VerificationContact { get; init; }
    public string? Specialty { get; init; }
    public string? PublicBio { get; init; }
    public string? AvatarUrl { get; init; }
    public IReadOnlyList<ProviderAvailabilityWindowDto> Availabilities { get; init; } = Array.Empty<ProviderAvailabilityWindowDto>();
    public string? SubmittedByClinicUserId { get; init; }
    public string? SubmittedByDisplayName { get; init; }
    public DateTime SubmittedAtUtc { get; init; } = DateTime.UtcNow;
}

/// <summary>
/// Portal -> clinic / patient-api, type <c>practitioner.identity.updated</c> (<c>InteropTypes.PractitionerIdentityUpdated</c>).
/// Propagates canonical practitioner verification state, profile details, and optional facility affiliation projection.
/// </summary>
public sealed record PractitionerIdentityUpdatedPayload
{
    public Guid PractitionerId { get; init; }
    public Guid? MergedIntoPractitionerId { get; init; }
    public string ProfessionKind { get; init; } = string.Empty;
    public string NormalizedPrcLicenseNo { get; init; } = string.Empty;
    public string DisplayPrcLicenseNo { get; init; } = string.Empty;
    public DateOnly? PrcExpiryDate { get; init; }
    public PractitionerVerificationLevel VerificationLevel { get; init; }
    public string FirstName { get; init; } = string.Empty;
    public string LastName { get; init; } = string.Empty;
    public string? Title { get; init; }
    public string PrimarySpecialty { get; init; } = string.Empty;
    public string? PublicBio { get; init; }
    public string? AvatarUrl { get; init; }
    public DateTime? VerifiedAtUtc { get; init; }
    public string? TenantId { get; init; }
    public Guid? FacilityId { get; init; }
    public Guid? ClinicStaffMemberId { get; init; }
    public string? AffiliationStatus { get; init; }
    public string? LocalSpecialty { get; init; }
    public IReadOnlyList<ProviderAvailabilityWindowDto>? Availabilities { get; init; }
}

/// <summary>
/// Portal -> clinic / patient-api, type <c>practitioner.verification.revoked</c> (<c>InteropTypes.PractitionerVerificationRevoked</c>).
/// Propagates revocation, expiration, or rejection of a practitioner's verification status.
/// </summary>
public sealed record PractitionerVerificationRevokedPayload
{
    public Guid? PractitionerId { get; init; }
    public string? TenantId { get; init; }
    public Guid? FacilityId { get; init; }
    public Guid? ClinicStaffMemberId { get; init; }
    public string ProfessionKind { get; init; } = string.Empty;
    public string NormalizedPrcLicenseNo { get; init; } = string.Empty;
    public PractitionerVerificationLevel NewStatus { get; init; }
    public string Reason { get; init; } = string.Empty;
    public DateTime RevokedAtUtc { get; init; } = DateTime.UtcNow;
}

/// <summary>
/// Portal -> clinic, type <c>verification.evidence.requested</c> (<c>InteropTypes.VerificationEvidenceRequested</c>).
/// Requests a clinic-stored DOH LTO or PRC verification evidence document by its authorized storage object key.
/// </summary>
public sealed record VerificationEvidenceRequestedPayload
{
    public string ObjectKey { get; init; } = string.Empty;
}

/// <summary>
/// Clinic -> portal, type <c>verification.evidence.responded</c> (<c>InteropTypes.VerificationEvidenceResponded</c>).
/// Returns the decrypted verification evidence bytes (Base64) along with its MIME type and filename.
/// </summary>
public sealed record VerificationEvidenceRespondedPayload
{
    public bool Found { get; init; }
    public string? ContentType { get; init; }
    public string? FileName { get; init; }
    public string? Base64Content { get; init; }
    public string? Error { get; init; }
}

/// <summary>
/// Clinic -> portal, type <c>facility.verification.update.requested</c> (<c>InteropTypes.FacilityVerificationUpdateRequested</c>).
/// Synchronously updates an active pending facility verification submission in place.
/// Reply type: <see cref="VerificationUpdateRespondedPayload"/>.
/// </summary>
public sealed record FacilityVerificationUpdateRequestedPayload
{
    public string TenantId { get; init; } = string.Empty;
    public Guid FacilityId { get; init; }
    public string FacilityName { get; init; } = string.Empty;
    public string? FacilitySlug { get; init; }
    public string? Classification { get; init; }
    public string? DohLtoNumber { get; init; }
    public DateOnly? DohLtoExpiryDate { get; init; }
    public string? LtoEvidenceObjectKey { get; init; }
    public string? Address { get; init; }
    public string? ContactNumber { get; init; }
    public string? ContactEmail { get; init; }
    public string? OperatingHours { get; init; }
    public bool IsOnlineBookingPaused { get; init; }
    public string? PhilHealthAccreditationNumber { get; init; }
    public bool IsPhilHealthAccredited { get; init; }
    public bool SupportsInPerson { get; init; } = true;
    public bool SupportsTeleconsult { get; init; }
    public string? SubmittedByClinicUserId { get; init; }
    public string? SubmittedByDisplayName { get; init; }
    public DateTime UpdatedAtUtc { get; init; } = DateTime.UtcNow;
    public Guid? ExpectedRequestId { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public string? ExpectedStatus { get; init; } = "PendingReview";
    public IReadOnlyList<ClinicServiceDto> Services { get; init; } = Array.Empty<ClinicServiceDto>();
    public IReadOnlyList<BundledPractitionerSubmissionDto> Practitioners { get; init; } = Array.Empty<BundledPractitionerSubmissionDto>();
}

/// <summary>
/// Clinic -> portal, type <c>practitioner.verification.update.requested</c> (<c>InteropTypes.PractitionerVerificationUpdateRequested</c>).
/// Synchronously updates an active pending practitioner verification submission in place.
/// Reply type: <see cref="VerificationUpdateRespondedPayload"/>.
/// </summary>
public sealed record PractitionerVerificationUpdateRequestedPayload
{
    public string TenantId { get; init; } = string.Empty;
    public Guid FacilityId { get; init; }
    public string FacilityName { get; init; } = string.Empty;
    public Guid ClinicStaffMemberId { get; init; }
    public string ProfessionKind { get; init; } = string.Empty;
    public string FirstName { get; init; } = string.Empty;
    public string LastName { get; init; } = string.Empty;
    public string? Title { get; init; }
    public string SubmittedPrcLicenseNo { get; init; } = string.Empty;
    public string NormalizedPrcLicenseNo { get; init; } = string.Empty;
    public DateOnly? PrcExpiryDate { get; init; }
    public string? PrcEvidenceObjectKey { get; init; }
    public string? VerificationContact { get; init; }
    public string? Specialty { get; init; }
    public string? PublicBio { get; init; }
    public string? AvatarUrl { get; init; }
    public IReadOnlyList<ProviderAvailabilityWindowDto> Availabilities { get; init; } = Array.Empty<ProviderAvailabilityWindowDto>();
    public string? SubmittedByClinicUserId { get; init; }
    public string? SubmittedByDisplayName { get; init; }
    public DateTime UpdatedAtUtc { get; init; } = DateTime.UtcNow;
    public Guid? ExpectedRequestId { get; init; }
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public string? ExpectedStatus { get; init; } = "PendingReview";
}

/// <summary>
/// Portal -> clinic, types <c>facility.verification.update.responded</c> (<c>InteropTypes.FacilityVerificationUpdateResponded</c>)
/// and <c>practitioner.verification.update.responded</c> (<c>InteropTypes.PractitionerVerificationUpdateResponded</c>).
/// Reports whether an active pending verification submission was updated in place or rejected due to a non-pending status conflict.
/// </summary>
public sealed record VerificationUpdateRespondedPayload
{
    public bool Succeeded { get; init; }
    public bool Conflict { get; init; }
    public string? ErrorCode { get; init; }
    public string? CurrentStatus { get; init; }
    public string? Message { get; init; }
    public Guid? RequestId { get; init; }
    public DateTime? UpdatedAtUtc { get; init; }
}
