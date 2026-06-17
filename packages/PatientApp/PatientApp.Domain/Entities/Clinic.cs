namespace PatientApp.Domain.Entities;

/// <summary>
/// A clinic registered in the PatientApp catalogue.
/// Patients discover clinics through public search or via their Organization memberships.
/// Patients join a Clinic directly (no invite code required — only consent).
/// The clinic's <c>BaseUrl</c> is the registered endpoint for all Clinic Dashboard API calls.
/// </summary>
public sealed class Clinic
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Address { get; set; }
    public bool IsPublic { get; set; } = true;
    public bool SupportsAppointments { get; set; } = true;
    public string BaseUrl { get; set; } = string.Empty;
    public string? LogoUrl { get; set; }
    public string? CoverImageUrl { get; set; }
    public string? PrivacyPolicyUrl { get; set; }
    public string? TermsAndConditionsUrl { get; set; }
    public string SpecialtiesJson { get; set; } = "[]";
    public string RequiredShareFieldsJson { get; set; } = "[]";
    public int FeaturedScore { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // Navigation
    public ICollection<ClinicOrganizationLink> OrganizationLinks { get; set; } = [];
    public ICollection<ClinicMembership> Memberships { get; set; } = [];
    public ICollection<BookingDraft> BookingDrafts { get; set; } = [];
}
