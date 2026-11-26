using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public enum PatientLinkRequestStatus
{
    PendingReview,
    Approved,
    Rejected
}

/// <summary>
/// Type-safe JSONB candidate match entry computed for staff review during chart linkage.
/// </summary>
public sealed record PatientLinkCandidateMatch(
    Guid PatientId,
    string PatientCode,
    string FullName,
    DateOnly? DateOfBirth,
    string? Email,
    string? ContactNumber,
    int Score,
    List<string> MatchedSignals);

/// <summary>
/// Persists a patient-initiated request (<c>patient.link.requested</c>) to bind their ClinicEZ cloud account
/// onto an existing unlinked clinic chart (whether walk-in, guest-registered, or backfilled) after staff verification.
/// Clinic-specific identifiers (such as school IDs, corporate employee IDs, HMO numbers) live dynamically
/// inside the type-safe JSONB <see cref="IdentifierClaims"/> dictionary so the core schema stays 100% clinic-agnostic.
/// </summary>
public sealed class PatientLinkRequest : ClinicScopedEntity
{
    public Guid CloudPatientId { get; set; }
    public string ClinicEzId { get; set; } = string.Empty;

    public string FirstName { get; set; } = string.Empty;
    public string? MiddleName { get; set; }
    public string LastName { get; set; } = string.Empty;
    public string? Suffix { get; set; }
    public DateOnly? DateOfBirth { get; set; }
    public string? VerifiedEmail { get; set; }
    public string? ContactNumber { get; set; }

    /// <summary>
    /// Type-safe JSONB map of clinic-specific identifier claims submitted by the patient
    /// (matched dynamically against <see cref="Patient.CustomFields"/> during candidate scoring).
    /// </summary>
    public Dictionary<string, string>? IdentifierClaims { get; set; }

    public PatientLinkRequestStatus Status { get; set; } = PatientLinkRequestStatus.PendingReview;

    /// <summary>
    /// Type-safe JSONB list of scored unlinked clinic chart candidates for staff review.
    /// </summary>
    public List<PatientLinkCandidateMatch>? CandidateMatches { get; set; }

    public Guid? MatchedPatientId { get; set; }
    public Guid? ReviewedByStaffId { get; set; }
    public string? ReviewedByStaffName { get; set; }
    public DateTime? ReviewedAtUtc { get; set; }
    public string? RejectionReason { get; set; }

    public DateTime RequestedAtUtc { get; set; } = DateTime.UtcNow;
}
