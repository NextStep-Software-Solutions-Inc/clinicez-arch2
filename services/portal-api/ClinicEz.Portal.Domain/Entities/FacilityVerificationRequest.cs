using System;
using System.Collections.Generic;
using ClinicEz.Portal.Domain.Common;

namespace ClinicEz.Portal.Domain.Entities;

/// <summary>
/// Platform review request submitted by a clinic seeking verification for public directory discovery.
/// Rows are never hard-deleted on withdrawal or superseding so submission history stays intact.
/// </summary>
public class FacilityVerificationRequest : BaseEntity
{
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;

    public Guid FacilityId { get; set; }
    public Facility Facility { get; set; } = null!;

    public int SubmissionNumber { get; set; }
    public string CorrelationId { get; set; } = string.Empty;
    public string RequestKind { get; set; } = string.Empty;
    public string? SubmittedByClinicUserId { get; set; }
    public string? SubmittedByDisplayName { get; set; }
    public DateTime SubmittedAtUtc { get; set; }
    public string SubmittedSnapshotJson { get; set; } = "{}";
    public string? LtoEvidenceObjectKey { get; set; }
    public string Status { get; set; } = "PendingReview";
    public DateTime? WithdrawnAtUtc { get; set; }
    public string? WithdrawnByActor { get; set; }
    public string? WithdrawalReason { get; set; }
    public Guid? SupersededByRequestId { get; set; }
    public string? ReviewedByAdminUserId { get; set; }
    public string? ReviewedByDisplayName { get; set; }
    public string? ReviewedByEmail { get; set; }
    public DateTime? ReviewedAtUtc { get; set; }
    public string? ReviewerNotes { get; set; }

    public ICollection<PractitionerVerificationRequest> PractitionerRequests { get; set; } = new List<PractitionerVerificationRequest>();
}
