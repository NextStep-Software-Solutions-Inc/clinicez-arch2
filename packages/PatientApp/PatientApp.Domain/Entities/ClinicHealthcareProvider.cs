using System;

namespace PatientApp.Domain.Entities;

/// <summary>
/// A healthcare provider associated with a clinic.
/// </summary>
public sealed class ClinicHealthcareProvider
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClinicId { get; set; }
    public Clinic Clinic { get; set; } = null!;

    public string Name { get; set; } = string.Empty;
    public string Specialty { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    public string? ProfessionalLicenseNo { get; set; }
    public bool IsActive { get; set; } = true;
    public int DisplayOrder { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
