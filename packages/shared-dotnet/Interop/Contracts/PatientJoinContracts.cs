using System;
using System.Collections.Generic;
using System.Linq;

namespace ClinicEz.Shared.Interop.Contracts;

/// <summary>
/// Payload carried by <see cref="InteropTypes.PatientJoinRequested"/> envelopes from Portal to Clinic.
/// Ingests public patient registration requests into clinic quarantine with outside document review.
/// </summary>
public sealed record PatientJoinRequestedPayload
{
    public Guid? JoinRequestId { get; init; }
    public required string TenantSlug { get; init; }
    public required string FacilitySlug { get; init; }
    public required string JoinCode { get; init; }

    // Demographics
    public required string FirstName { get; init; }
    public string? MiddleName { get; init; }
    public required string LastName { get; init; }
    public string? Suffix { get; init; }
    public required DateOnly DateOfBirth { get; init; }
    public required string Sex { get; init; } // "Male", "Female", "Other"
    public string? CivilStatus { get; init; }
    public required string ContactNumber { get; init; }
    public string? Email { get; init; }
    public string? Address { get; init; }

    // Statutory PhilHealth & Welfare Identifiers
    public string? PhilHealthPin { get; init; } // 12-digit Mod-11 PIN
    public string? MemberType { get; init; } // "MM" (Member) or "DD" (Dependent)
    public string? PrincipalMemberPin { get; init; } // Principal PhilHealth PIN if DD
    public string? PrincipalRelationship { get; init; } // "C", "S", "P", "D"
    public string? PrincipalFullName { get; init; }
    public DateOnly? PrincipalDateOfBirth { get; init; }
    public string? SeniorCitizenId { get; init; }
    public string? PwdId { get; init; }

    // Clinical Context
    public string? ReasonForVisit { get; init; }

    // Dynamic Custom Metadata
    public Dictionary<string, object?>? CustomFields { get; init; }

    // Structured Clinical Lists & External Attachments
    public List<PatientJoinAllergyItem>? Allergies { get; init; }
    public List<PatientJoinAttachmentItem>? Attachments { get; init; }
    public string? TurnstileToken { get; init; }
}

/// <summary>
/// Structured clinical allergy item submitted during public registration.
/// </summary>
public sealed record PatientJoinAllergyItem
{
    public required string Allergen { get; init; }
    public string Category { get; init; } = "Medication"; // "Medication", "Food", "Environmental", "Biologic", "Other"
    public string Severity { get; init; } = "Moderate"; // "Mild", "Moderate", "Severe", "LifeThreatening"
    public bool IsAnaphylactic { get; init; }
    public string? AllergenDrugCode { get; init; }
    public string? ReactionManifestation { get; init; }
    public DateOnly? OnsetDate { get; init; }
    public string? Notes { get; init; }
}

/// <summary>
/// Outside document or diagnostic attachment uploaded by patient during join registration.
/// Persisted in clinic-api under quarantine (VerificationStatus = "PendingVerification").
/// Supports both StorageKey / StorageUri, FileType / ContentType, Category / RecordType for wire compatibility.
/// </summary>
public sealed record PatientJoinAttachmentItem
{
    public Guid? Id { get; init; }
    public string? Title { get; init; }
    public required string FileName { get; init; }
    public string? FileType { get; init; }
    public string? ContentType { get; init; }
    public string? StorageKey { get; init; }
    public string? StorageUri { get; init; }
    public string? Category { get; init; }
    public string? RecordType { get; init; }
    public long FileSizeBytes { get; init; }
    public DateOnly? DocumentDate { get; init; }
    public string? Notes { get; init; }
}

/// <summary>
/// PhilHealth Mod-11 PIN validation helper.
/// </summary>
public static class PhilHealthMod11Validator
{
    private static readonly int[] Weights = [6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

    public static bool Validate(string? pin)
    {
        if (string.IsNullOrWhiteSpace(pin)) return false;
        var digitsOnly = new string(pin.Where(char.IsDigit).ToArray());
        if (digitsOnly.Length != 12) return false;

        var sum = 0;
        for (var i = 0; i < 11; i++)
        {
            sum += (digitsOnly[i] - '0') * Weights[i];
        }

        var rem = sum % 11;
        var expected = rem switch
        {
            0 => 0,
            1 => 0,
            _ => 11 - rem
        };

        var actual = digitsOnly[11] - '0';
        return expected == actual;
    }
}
