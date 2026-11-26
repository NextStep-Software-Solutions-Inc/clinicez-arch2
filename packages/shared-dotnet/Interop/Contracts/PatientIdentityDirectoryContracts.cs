using System;
using System.Collections.Generic;

namespace ClinicEz.Shared.Interop.Contracts;

/// <summary>
/// Canonical status tokens for platform-wide patient identity directory entries.
/// Strictly non-clinical authentication &amp; account linkage metadata (zero clinical PHI).
/// </summary>
public static class PatientIdentityStatus
{
    public const string ClerkLinked = "ClerkLinked";
    public const string Unlinked = "Unlinked";
    public const string Reclaimed = "Reclaimed";
    public const string AmbiguousEmail = "AmbiguousEmail";
}

/// <summary>
/// Filter values accepted by <see cref="PatientIdentityDirectoryRequestedPayload.StatusFilter"/>.
/// </summary>
public static class PatientIdentityFilter
{
    public const string All = "ALL";
    public const string ClerkLinked = "CLERK_LINKED";
    public const string Unlinked = "UNLINKED";
    public const string Reclaimed = "RECLAIMED";
    public const string AmbiguousEmail = "AMBIGUOUS_EMAIL";
}

/// <summary>
/// Reconciliation actions supported by <see cref="PatientIdentityReconcileRequestedPayload.Action"/>.
/// </summary>
public static class PatientIdentityReconcileAction
{
    public const string BindClerk = "BIND_CLERK";
    public const string UnbindClerk = "UNBIND_CLERK";
}

/// <summary>
/// Portal -> patient-api (<see cref="InteropTypes.PatientIdentityDirectoryRequested"/>).
/// Queries non-clinical patient account identity status across the patient plane strictly via Interop Hub.
/// </summary>
public sealed record PatientIdentityDirectoryRequestedPayload
{
    public string? Search { get; init; }
    public string? StatusFilter { get; init; }
    public int Limit { get; init; } = 25;
    public int Offset { get; init; }
}

/// <summary>
/// Aggregate identity KPIs returned alongside paginated patient identity records.
/// </summary>
public sealed record PatientIdentityDirectorySummaryPayload
{
    public long TotalPrimaryPatients { get; init; }
    public long ClerkLinkedCount { get; init; }
    public long UnlinkedCount { get; init; }
    public long ReclaimedViaEmailCount { get; init; }
    public long AmbiguousDuplicateEmailGroups { get; init; }
    public long AmbiguousDuplicatePatientCount { get; init; }
}

/// <summary>
/// Data-minimized, non-clinical identity metadata for a single primary patient account.
/// </summary>
public sealed record PatientIdentityDirectoryItemPayload
{
    public required Guid PatientId { get; init; }
    public required string ClinicEzId { get; init; }
    public required string FirstName { get; init; }
    public required string LastName { get; init; }
    public string? Email { get; init; }
    public string? ClerkUserId { get; init; }
    public required string IdentityStatus { get; init; }
    public int DuplicateEmailCount { get; init; }
    public DateTime CreatedAtUtc { get; init; }
    public DateTime? UpdatedAtUtc { get; init; }
    public string? UpdatedBy { get; init; }
}

/// <summary>
/// Patient-api -> portal (<see cref="InteropTypes.PatientIdentityDirectoryResponded"/>).
/// </summary>
public sealed record PatientIdentityDirectoryRespondedPayload
{
    public bool Succeeded { get; init; } = true;
    public string? Error { get; init; }
    public string? ErrorCode { get; init; }
    public PatientIdentityDirectorySummaryPayload Summary { get; init; } = new();
    public List<PatientIdentityDirectoryItemPayload> Items { get; init; } = new();
    public long TotalMatching { get; init; }
    public int Limit { get; init; }
    public int Offset { get; init; }
}

/// <summary>
/// Portal -> patient-api (<see cref="InteropTypes.PatientIdentityReconcileRequested"/>).
/// Allows an authorized Platform Admin to bind or unbind a verified Clerk user ID on a primary patient account.
/// </summary>
public sealed record PatientIdentityReconcileRequestedPayload
{
    public required Guid PatientId { get; init; }
    /// <summary>One of <see cref="PatientIdentityReconcileAction"/> (<c>BIND_CLERK</c> or <c>UNBIND_CLERK</c>).</summary>
    public required string Action { get; init; }
    /// <summary>Clerk user ID (<c>user_*</c>). Required for <c>BIND_CLERK</c>; ignored for <c>UNBIND_CLERK</c>.</summary>
    public string? ClerkUserId { get; init; }
    public required string Actor { get; init; }
    public string? Reason { get; init; }
}

/// <summary>
/// Patient-api -> portal (<see cref="InteropTypes.PatientIdentityReconcileResponded"/>).
/// </summary>
public sealed record PatientIdentityReconcileRespondedPayload
{
    public bool Succeeded { get; init; }
    public string? Error { get; init; }
    /// <summary>Machine-readable error code: <c>UNAUTHORIZED</c>, <c>VALIDATION_ERROR</c>, <c>NOT_FOUND</c>, or <c>CONFLICT</c>.</summary>
    public string? ErrorCode { get; init; }
    public PatientIdentityDirectoryItemPayload? Item { get; init; }
}
