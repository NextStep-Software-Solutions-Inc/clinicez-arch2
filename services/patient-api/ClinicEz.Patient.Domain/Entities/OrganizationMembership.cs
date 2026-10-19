using ClinicEz.Patient.Domain.Common;
using ClinicEz.Patient.Domain.Enums;

namespace ClinicEz.Patient.Domain.Entities;

/// <summary>
/// A patient's membership in an Organization.
/// Created when the patient joins an org via invite code.
/// Syncable — device creates the record offline, syncs to backend.
/// </summary>
public sealed class OrganizationMembership : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;
    public Guid OrganizationId { get; set; }
    public Organization Organization { get; set; } = null!;

    public string RoleId { get; set; } = string.Empty;
    public string RoleName { get; set; } = string.Empty;
    public ClinicMembershipStatus Status { get; set; } = ClinicMembershipStatus.Pending;

    public bool ConsentPrivacyPolicy { get; set; }
    public bool ConsentTermsAndConditions { get; set; }
    public bool ConsentDataSharing { get; set; }
    public DateTime? ConsentedAt { get; set; }
}
