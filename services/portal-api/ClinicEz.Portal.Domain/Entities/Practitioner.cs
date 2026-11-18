using System;
using System.Collections.Generic;
using ClinicEz.Portal.Domain.Common;
using ClinicEz.Shared.Common;

namespace ClinicEz.Portal.Domain.Entities;

/// <summary>
/// Canonical platform-level healthcare practitioner record keyed by (ProfessionKind, NormalizedPrcLicenseNo).
/// </summary>
public class Practitioner : BaseEntity
{
    public Guid? MergedIntoPractitionerId { get; set; }
    public string ProfessionKind { get; set; } = string.Empty;
    public string NormalizedPrcLicenseNo { get; set; } = string.Empty;
    public string DisplayPrcLicenseNo { get; set; } = string.Empty;
    public DateOnly? PrcExpiryDate { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? Title { get; set; }
    public string PrimarySpecialty { get; set; } = string.Empty;
    public string? PublicBio { get; set; }
    public string? AvatarUrl { get; set; }
    public string? CredentialsJson { get; set; }
    public string? VerificationContact { get; set; }
    public PractitionerVerificationLevel VerificationStatus { get; set; } = PractitionerVerificationLevel.Unverified;
    public Guid? LatestVerificationRequestId { get; set; }
    public DateTime? VerifiedAtUtc { get; set; }
    public string? VerifiedByAdminUserId { get; set; }

    public ICollection<PractitionerAffiliation> Affiliations { get; set; } = new List<PractitionerAffiliation>();
}
