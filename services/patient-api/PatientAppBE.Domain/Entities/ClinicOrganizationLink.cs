namespace PatientAppBE.Domain.Entities;

/// <summary>
/// Read-only catalogue entry linking a Clinic to an Organization.
/// Populated by the backend admin; not created or edited by patients.
/// Used to determine which clinics a patient can discover through an org membership.
/// </summary>
public sealed class ClinicOrganizationLink
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClinicId { get; set; }
    public Clinic Clinic { get; set; } = null!;
    public Guid OrganizationId { get; set; }
    public Organization Organization { get; set; } = null!;

    /// <summary>partnered | sponsored | referral</summary>
    public string RelationType { get; set; } = "partnered";
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
