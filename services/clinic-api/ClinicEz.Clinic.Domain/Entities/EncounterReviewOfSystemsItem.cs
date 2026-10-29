using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class EncounterReviewOfSystemsItem : ClinicScopedEntity
{
    public Guid ConsultationEncounterId { get; set; }
    public ConsultationEncounter ConsultationEncounter { get; set; } = null!;

    public RosSystem System { get; set; }
    public string SymptomCode { get; set; } = "00";
    public string? SymptomTitle { get; set; }
    public bool IsNormal { get; set; } = true;
    public string? OtherSpecification { get; set; }
    public string? Remarks { get; set; }
}
