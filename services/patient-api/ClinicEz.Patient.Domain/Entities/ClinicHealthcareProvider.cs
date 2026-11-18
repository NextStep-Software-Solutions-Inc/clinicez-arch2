using System;

namespace ClinicEz.Patient.Domain.Entities;

/// <summary>
/// A healthcare provider associated with a clinic.
/// </summary>
public sealed class ClinicHealthcareProvider
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClinicId { get; set; }
    public Clinic Clinic { get; set; } = null!;
    public Guid? PractitionerId { get; set; }
    public Practitioner? Practitioner { get; set; }

    public string Name { get; set; } = string.Empty;
    public string Specialty { get; set; } = string.Empty;
    public string Role { get; set; } = "Doctor";
    public string? AvatarUrl { get; set; }
    public string? ProfessionalLicenseNo { get; set; }
    public string? NormalizedLicenseNo { get; set; }
    public bool IsDirectoryOptIn { get; set; } = true;
    public string AffiliationStatus { get; set; } = "Active";
    public bool HasIdentityConflict { get; set; } = false;
    public bool IsActive { get; set; } = true;
    public int DisplayOrder { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public ICollection<ProviderAvailability> ProviderAvailabilities { get; set; } = new List<ProviderAvailability>();
}
