using PatientApp.Domain.Common;
using PatientApp.Domain.Enums;

namespace PatientApp.Domain.Entities;

/// <summary>
/// A patient's membership in a Clinic.
/// Created when the patient joins a Clinic directly (consent only — no invite code).
/// Syncable — created offline, synced to backend.
/// </summary>
public sealed class ClinicMembership : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;
    public Guid ClinicId { get; set; }
    public Clinic Clinic { get; set; } = null!;

    public ClinicMembershipStatus Status { get; set; } = ClinicMembershipStatus.Active;

    public bool ConsentPrivacyPolicy { get; set; }
    public bool ConsentTermsAndConditions { get; set; }
    public bool ConsentDataSharing { get; set; }
    public DateTime? ConsentedAt { get; set; }
}
