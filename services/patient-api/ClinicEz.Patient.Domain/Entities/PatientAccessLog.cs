using ClinicEz.Patient.Domain.Common;

namespace ClinicEz.Patient.Domain.Entities;

/// <summary>Append-only audit entry for a grant: who did what to the patient's data and when (<see cref="BaseEntity.CreatedAt"/>).</summary>
public sealed class PatientAccessLog : BaseEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public Guid GrantId { get; set; }
    public PatientAccessGrant Grant { get; set; } = null!;

    /// <summary>Address of the acting party, e.g. <c>facility:tenant/facilityId</c> or <c>patient:clerkUserId</c>.</summary>
    public string Actor { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string? Detail { get; set; }
}