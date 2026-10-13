using System;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Shared.Security.ClaimTokens;

namespace ClinicEz.Patient.Application.Features.Patients.Commands.ClaimIntake;

/// <summary>
/// Multi-Identity Conflict Resolution Engine for Progressive Patient Account Claiming (Option A).
/// Resolves identity divergence safely in accordance with Republic Act No. 10173 (Data Privacy Act of 2012):
/// 1. Parent / Dependent Proxy: Minors (<18y), PhilHealth statutory dependents (DD), or explicit dependent claims.
/// 2. Alternate Email Linking: Name and DOB match an existing claimant but email differs — links clinic record without duplicating Patient.
/// 3. Medical Privacy Guardrail: Blocks attempts by an authenticated adult to merge records of an unrelated adult.
/// </summary>
public sealed class PatientClaimConflictResolver : IPatientClaimConflictResolver
{
    private readonly TimeProvider _clock;

    public PatientClaimConflictResolver(TimeProvider? clock = null)
    {
        _clock = clock ?? TimeProvider.System;
    }

    public ClaimConflictResult Resolve(
        Domain.Entities.Patient? claimant,
        ClaimTokenClaims claims,
        bool isDependentClaim,
        string? relationshipToDependent = null)
    {
        ArgumentNullException.ThrowIfNull(claims);

        var today = DateOnly.FromDateTime(_clock.GetUtcNow().UtcDateTime);
        var isIntakeMinor = claims.DateOfBirth > today.AddYears(-18);
        var isDD = string.Equals(claims.MemberType, "DD", StringComparison.OrdinalIgnoreCase);

        // ── Rule 1: Parent / Dependent Proxy ──────────────────────────────────────
        // Minors (< 18), PhilHealth statutory dependents (DD), or user-requested dependent claims
        if (isDependentClaim || isDD || isIntakeMinor)
        {
            return new ClaimConflictResult(
                ClaimConflictOutcome.ManagedDependentProxy,
                "Dependent",
                isDD ? "PhilHealth statutory dependent (DD) intake claim."
                     : isIntakeMinor ? "Minor patient intake claim."
                     : "User requested dependent proxy claim.");
        }

        // ── First-time claimant without existing profile ──────────────────────────
        if (claimant == null)
        {
            return new ClaimConflictResult(
                ClaimConflictOutcome.NewSelf,
                "Self",
                "New patient account self-intake claim.");
        }

        // ── Rule 2: Alternate Email Linking / Verified Self Match ───────────────────
        var namesMatch = string.Equals(claimant.FirstName.Trim(), claims.FirstName.Trim(), StringComparison.OrdinalIgnoreCase) &&
                         string.Equals(claimant.LastName.Trim(), claims.LastName.Trim(), StringComparison.OrdinalIgnoreCase);
        var dobMatches = claimant.DateOfBirth == claims.DateOfBirth;

        if (namesMatch && dobMatches)
        {
            var isDifferentEmail = !string.IsNullOrWhiteSpace(claims.Email) &&
                                  !string.Equals(claimant.Email?.Trim(), claims.Email.Trim(), StringComparison.OrdinalIgnoreCase);

            return new ClaimConflictResult(
                ClaimConflictOutcome.ExistingSelf,
                "Self",
                isDifferentEmail
                    ? "Alternate email linking: Matching name and birthdate linked to personal account without duplicate patient record."
                    : "Verified self intake claim matching authenticated profile.");
        }

        // ── Rule 3: Medical Privacy Guardrail (RA 10173) ──────────────────────────
        // An adult attempting to merge an unrelated adult pass into their account
        if (!isIntakeMinor && (!namesMatch || !dobMatches))
        {
            return new ClaimConflictResult(
                ClaimConflictOutcome.MedicalPrivacyBlocked,
                "Blocked",
                "For medical privacy, foreign health records cannot be merged into your personal account.");
        }

        // Default self claim
        return new ClaimConflictResult(
            ClaimConflictOutcome.ExistingSelf,
            "Self",
            "Default self claim.");
    }
}
