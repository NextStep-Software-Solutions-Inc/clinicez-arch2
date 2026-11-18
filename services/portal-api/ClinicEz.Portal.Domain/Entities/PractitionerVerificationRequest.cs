using System;
using ClinicEz.Portal.Domain.Common;

namespace ClinicEz.Portal.Domain.Entities;

/// <summary>
/// Platform verification request for an individual clinician, either bundled with a facility submission or standalone.
/// </summary>
public class PractitionerVerificationRequest : BaseEntity
{
    public Guid? FacilityVerificationRequestId { get; set; }
    public FacilityVerificationRequest? FacilityVerificationRequest { get; set; }

    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;

    public Guid FacilityId { get; set; }
    public Facility Facility { get; set; } = null!;

    public Guid ClinicStaffMemberId { get; set; }

    public Guid? PractitionerId { get; set; }
    public Practitioner? Practitioner { get; set; }

    public Guid? AffiliationId { get; set; }
    public PractitionerAffiliation? Affiliation { get; set; }

    public int SubmissionNumber { get; set; }
    public string CorrelationId { get; set; } = string.Empty;
    public string RequestKind { get; set; } = string.Empty;
    public string ProfessionKind { get; set; } = string.Empty;
    public string SubmittedPrcLicenseNo { get; set; } = string.Empty;
    public string NormalizedPrcLicenseNo { get; set; } = string.Empty;
    public DateOnly? PrcExpiryDate { get; set; }
    public string SubmittedSnapshotJson { get; set; } = "{}";
    public string? PrcEvidenceObjectKey { get; set; }
    public string? VerificationContact { get; set; }
    public string? SubmittedByClinicUserId { get; set; }
    public DateTime SubmittedAtUtc { get; set; }
    public string? OtpTokenHash { get; set; }
    public DateTime? OtpExpiresAtUtc { get; set; }
    public string Status { get; set; } = "PendingReview";
    public DateTime? WithdrawnAtUtc { get; set; }
    public string? WithdrawnByActor { get; set; }
    public string? WithdrawalReason { get; set; }
    public string? ReviewedByAdminUserId { get; set; }
    public DateTime? ReviewedAtUtc { get; set; }
    public string? ReviewerNotes { get; set; }
}
