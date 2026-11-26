using System;
using System.Collections.Generic;

namespace ClinicEz.Shared.Interop.Contracts;

/// <summary>
/// Payload carried by <see cref="InteropTypes.PatientLinkRequested"/> from <c>patient-api</c> to a clinic.
/// Allows an authenticated Patient App user to request staff-verified linkage to an existing clinic chart
/// using standard demographics plus optional clinic-specific <see cref="IdentifierClaims"/> metadata
/// (e.g. <c>student_id</c>, <c>employee_id</c>, <c>hmo_member_id</c>, <c>patient_code</c>).
/// </summary>
public sealed record PatientLinkRequestedPayload
{
    public required Guid LinkRequestId { get; init; }
    public required Guid PatientId { get; init; }
    public required string ClinicEzId { get; init; }
    public required string TenantId { get; init; }
    public required Guid ClinicId { get; init; }

    public required string FirstName { get; init; }
    public string? MiddleName { get; init; }
    public required string LastName { get; init; }
    public string? Suffix { get; init; }
    public DateOnly? DateOfBirth { get; init; }
    public string? VerifiedEmail { get; init; }
    public string? ContactNumber { get; init; }

    /// <summary>
    /// Flexible, clinic-agnostic custom identifier claims matched dynamically against the clinic's
    /// configured <c>CustomFields</c> (never hardcoding school/corporate-specific columns in the core domain).
    /// </summary>
    public Dictionary<string, string>? IdentifierClaims { get; init; }

    public bool ConsentPrivacyPolicy { get; init; }
    public bool ConsentTermsAndConditions { get; init; }
    public bool ConsentDataSharing { get; init; }
    public DateTime RequestedAtUtc { get; init; } = DateTime.UtcNow;
}

/// <summary>
/// Payload carried by <see cref="InteropTypes.ClinicLinkResolved"/> from a clinic back to <c>patient-api</c>
/// once clinic staff approve or reject a <see cref="PatientLinkRequestedPayload"/>.
/// </summary>
public sealed record ClinicLinkResolvedPayload
{
    public required Guid LinkRequestId { get; init; }
    public required Guid PatientId { get; init; }
    public required string ClinicEzId { get; init; }
    public required string TenantId { get; init; }
    public required Guid ClinicId { get; init; }
    public Guid? ClinicPatientId { get; init; }
    /// <summary>"Approved" or "Rejected".</summary>
    public required string Status { get; init; }
    public string? RejectionReason { get; init; }
    public string? ReviewedByStaffName { get; init; }
    public DateTime ResolvedAtUtc { get; init; } = DateTime.UtcNow;
}
