namespace ClinicEz.Patient.Domain.Entities;

/// <summary>
/// An organization (clinic network / group) discoverable by patients.
/// A patient joins an Organization (via invite code) to get access to linked Clinics.
/// Read-only from the patient's perspective after join — populated from the discovery catalogue.
/// Does not extend BaseEntity (no patient-owned audit stamps).
/// </summary>
public sealed class Organization
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Slug { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string? LogoUrl { get; set; }
    public string? CoverImageUrl { get; set; }
    public string? AddressHint { get; set; }
    public bool IsPublic { get; set; } = true;
    /// <summary>Patients join an organization by supplying this code.</summary>
    public string? InviteCode { get; set; }
    public string? PrivacyPolicyUrl { get; set; }
    public string? TermsAndConditionsUrl { get; set; }
    public string RolesJson { get; set; } = "[]";             // JSON array of OrganizationRole
    public string RequiredShareFieldsJson { get; set; } = "[]"; // JSON array of ShareableFieldKey
    public int FeaturedScore { get; set; }
    public int ActiveMemberCount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // Navigation
    public ICollection<OrganizationRole> Roles { get; set; } = [];
    public ICollection<ClinicOrganizationLink> ClinicLinks { get; set; } = [];
    public ICollection<OrganizationMembership> Memberships { get; set; } = [];
}
