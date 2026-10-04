using ClinicEz.Patient.Domain.Common;
using ClinicEz.Patient.Domain.Enums;

namespace ClinicEz.Patient.Domain.Entities;

public sealed class PatientGovernmentId : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public GovernmentIdType IdType { get; set; }
    public string IdNumber { get; set; } = string.Empty;
    public DateOnly? IssuedAt { get; set; }
    public DateOnly? ExpiresAt { get; set; }
    public string? PhilhealthCategory { get; set; }

    public string? SponsorPin { get; set; }
    public string? SponsorLastName { get; set; }
    public string? SponsorFirstName { get; set; }
    public string? SponsorMiddleName { get; set; }
    public string? SponsorSuffix { get; set; }
    public DateOnly? SponsorDob { get; set; }
    public string? SponsorRelationship { get; set; }
}
