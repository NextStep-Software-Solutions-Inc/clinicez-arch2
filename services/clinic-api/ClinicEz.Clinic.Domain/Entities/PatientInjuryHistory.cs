using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientInjuryHistory : ClinicScopedEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public string InjuryDescription { get; set; } = string.Empty;
    public DateOnly? InjuryDate { get; set; }
    public int? InjuryYear { get; set; }

    public string? MechanismOfInjury { get; set; }
    public string? BodySite { get; set; }
    public string? Icd10ExternalCauseCode { get; set; }
    public string? TreatedAtFacilityName { get; set; }
    public string? ResidualSequelae { get; set; }
}
