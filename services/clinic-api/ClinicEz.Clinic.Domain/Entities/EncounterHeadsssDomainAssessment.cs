using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class EncounterHeadsssDomainAssessment : ClinicScopedEntity
{
    public Guid ConsultationEncounterId { get; set; }
    public ConsultationEncounter ConsultationEncounter { get; set; } = null!;

    public HeadsssDomain Domain { get; set; }
    public bool AssentConsentStatus { get; set; } = true;
    public string? GuideQuestionCodes { get; set; }
    public string? PatientAnswers { get; set; }
    public string? RedFlagCodes { get; set; }
    public bool RequiresUrgentReferral { get; set; } = false;
    public string? ActionTakenOrIntervention { get; set; }
}
