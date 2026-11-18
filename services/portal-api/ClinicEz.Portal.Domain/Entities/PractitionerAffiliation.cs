using System;
using ClinicEz.Portal.Domain.Common;

namespace ClinicEz.Portal.Domain.Entities;

/// <summary>
/// Represents a verified or pending affiliation between a canonical <see cref="Practitioner"/> and a clinic <see cref="Facility"/>.
/// </summary>
public class PractitionerAffiliation : BaseEntity
{
    public Guid PractitionerId { get; set; }
    public Practitioner Practitioner { get; set; } = null!;

    public Guid FacilityId { get; set; }
    public Facility Facility { get; set; } = null!;

    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;

    public Guid ClinicStaffMemberId { get; set; }
    public string Role { get; set; } = string.Empty;
    public string? LocalDisplayName { get; set; }
    public string? LocalSpecialty { get; set; }
    public string? AvailabilitiesJson { get; set; }
    public string AffiliationStatus { get; set; } = "Active";
    public DateTime OptedInAtUtc { get; set; }
    public DateTime? ConfirmedViaOtpAtUtc { get; set; }
    public DateTime? WithdrawnAtUtc { get; set; }
}
