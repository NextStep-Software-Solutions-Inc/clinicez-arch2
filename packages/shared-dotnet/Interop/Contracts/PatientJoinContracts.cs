using System;
using System.Collections.Generic;
using System.Linq;

namespace ClinicEz.Shared.Interop.Contracts;

/// <summary>
/// Payload carried by <see cref="InteropTypes.PatientJoinRequested"/> envelopes from Portal to Clinic.
/// Ingests public patient registration requests into clinic quarantine with outside document review.
/// Upgraded with structured 10-digit PSGC address fields for cascading location selection.
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

    // =========================================================================
    // Address Fields: Structured Cascading 10-digit PSGC + Fallback
    // =========================================================================

    /// <summary>Legacy single free-text address string (preserved for fallback and raw text input).</summary>
    public string? Address { get; init; }

    /// <summary>10-digit Philippine Standard Geographic Code for the Region (e.g. "1300000000").</summary>
    public string? RegionPsgc { get; init; }

    /// <summary>10-digit Philippine Standard Geographic Code for the Province (e.g. "1339000000").</summary>
    public string? ProvincePsgc { get; init; }

    /// <summary>10-digit Philippine Standard Geographic Code for the City/Municipality (e.g. "1339010000").</summary>
    public string? CityMunicipalityPsgc { get; init; }

    /// <summary>10-digit Philippine Standard Geographic Code for the Barangay (e.g. "1339010001").</summary>
    public string? BarangayPsgc { get; init; }

    /// <summary>Descriptive name of the Region.</summary>
    public string? RegionName { get; init; }

    /// <summary>Descriptive name of the Province.</summary>
    public string? ProvinceName { get; init; }

    /// <summary>Descriptive name of the City or Municipality.</summary>
    public string? CityMunicipalityName { get; init; }

    /// <summary>Descriptive name of the Barangay.</summary>
    public string? BarangayName { get; init; }

    /// <summary>House / unit number, building name, and street / subdivision.</summary>
    public string? StreetAddress { get; init; }

    /// <summary>4-digit Philippine postal ZIP code.</summary>
    public string? ZipCode { get; init; }

    /// <summary>Optional multi-address list (e.g. Permanent and Current addresses with IsSameAsPermanent toggle).</summary>
    public List<PatientJoinAddressItem>? Addresses { get; init; }

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
}

/// <summary>
/// Structured address item carried in public join intake payloads.
/// Supports Permanent and Current address separation with 10-digit PSGC hierarchy.
/// </summary>
public sealed record PatientJoinAddressItem
{
    /// <summary>Address classification: "Permanent" or "Current".</summary>
    public string AddressType { get; init; } = "Permanent";

    /// <summary>Whether the current address is identical to permanent address.</summary>
    public bool IsSameAsPermanent { get; init; }

    public string? RegionPsgc { get; init; }
    public string? ProvincePsgc { get; init; }
    public string? CityMunicipalityPsgc { get; init; }
    public string? BarangayPsgc { get; init; }

    public string? RegionName { get; init; }
    public string? ProvinceName { get; init; }
    public string? CityMunicipalityName { get; init; }
    public string? BarangayName { get; init; }

    public string? StreetAddress { get; init; }
    public string? ZipCode { get; init; }
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
