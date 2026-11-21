using System;
using System.Collections.Generic;
using ClinicEz.Shared.Common;

namespace ClinicEz.Patient.Domain.Entities;

/// <summary>
/// Canonical platform-verified practitioner identity projected from Portal control plane.
/// Does not inherit <c>BaseEntity</c> (matching <see cref="Clinic"/> and <see cref="ClinicHealthcareProvider"/>).
/// </summary>
public sealed class Practitioner
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? MergedIntoPractitionerId { get; set; }
    public string ProfessionKind { get; set; } = "Doctor";
    public string NormalizedPrcLicenseNo { get; set; } = string.Empty;
    public string DisplayPrcLicenseNo { get; set; } = string.Empty;
    public DateOnly? PrcExpiryDate { get; set; }
    public PractitionerVerificationLevel VerificationLevel { get; set; } = PractitionerVerificationLevel.Unverified;
    public string Name { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string PrimarySpecialty { get; set; } = string.Empty;
    public string? Bio { get; set; }
    public string? AvatarUrl { get; set; }
    public DateTime? VerifiedAtUtc { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public ICollection<ClinicHealthcareProvider> ClinicProviders { get; set; } = [];
}
