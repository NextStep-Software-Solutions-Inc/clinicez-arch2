namespace ClinicEz.Patient.Domain.Entities;

/// <summary>
/// A clinic registered in the PatientApp catalogue.
/// Patients discover clinics through public search or via their Organization memberships.
/// Patients join a Clinic directly (no invite code required — only consent).
/// The clinic is never called directly: every exchange with it travels as an interop hub envelope
/// addressed to (<c>TenantId</c>, <c>Id</c>).
/// </summary>
public sealed class Clinic
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    /// <summary>Owning workspace, learned from the portal directory feed. Required to address the clinic on the hub.</summary>
    public string? TenantId { get; set; }
    public string? Description { get; set; }
    public string? Address { get; set; }
    public bool IsWorkspaceEligible { get; set; } = false;
    public bool IsDirectoryPublished { get; set; } = false;
    public bool IsPublic { get; set; } = false;
    public bool SupportsAppointments { get; set; } = true;
    public string? OperatingHours { get; set; }
    public bool IsGated { get; set; } = false;
    public string? JoinCode { get; set; }
    public DateTime? JoinCodeExpiresAt { get; set; }
    public string? LogoUrl { get; set; }
    public string? CoverImageUrl { get; set; }
    public string? PrivacyPolicyUrl { get; set; }
    public string? TermsAndConditionsUrl { get; set; }
    public string SpecialtiesJson { get; set; } = "[]";
    public string RequiredShareFieldsJson { get; set; } = "[]";
    public int FeaturedScore { get; set; }
    public int ActiveMemberCount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // Navigation
    public ICollection<ClinicOrganizationLink> OrganizationLinks { get; set; } = [];
    public ICollection<ClinicMembership> Memberships { get; set; } = [];
    public ICollection<BookingDraft> BookingDrafts { get; set; } = [];
    public ICollection<ClinicHealthcareProvider> HealthcareProviders { get; set; } = [];
    public ICollection<ClinicService> Services { get; set; } = [];

    public void SetWorkspaceEligibility(bool isEligible)
    {
        IsWorkspaceEligible = isEligible;
        SyncPublicStatus();
    }

    public void SetDirectoryPublished(bool isPublished)
    {
        IsDirectoryPublished = isPublished;
        SyncPublicStatus();
    }

    public void SyncPublicStatus()
    {
        IsPublic = IsWorkspaceEligible && IsDirectoryPublished;
    }
}
