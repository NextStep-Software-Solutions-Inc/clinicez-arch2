using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class EncounterPediatricMilestone : ClinicScopedEntity
{
    public Guid ConsultationEncounterId { get; set; }
    public ConsultationEncounter ConsultationEncounter { get; set; } = null!;

    public string MilestoneVisitAgeCode { get; set; } = string.Empty;
    public bool? IsGrossMotorAtPar { get; set; }
    public bool? IsFineMotorAtPar { get; set; }
    public bool? IsLanguageAtPar { get; set; }
    public bool? IsCognitiveAtPar { get; set; }
    public bool? IsPsychosocialAtPar { get; set; }
    public bool? IsOverallDevelopmentAtPar { get; set; }

    public string? GrossMotorRemarks { get; set; }
    public string? FineMotorRemarks { get; set; }
    public string? LanguageRemarks { get; set; }
    public string? CognitiveRemarks { get; set; }
    public string? PsychosocialRemarks { get; set; }
    public string? DevelopmentalRemarks { get; set; }

    public ICollection<EncounterPediatricDangerSign> DangerSigns { get; set; } = new List<EncounterPediatricDangerSign>();
}
