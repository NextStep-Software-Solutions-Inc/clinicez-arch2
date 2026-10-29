using System;
using System.ComponentModel.DataAnnotations.Schema;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientReproductiveHistory : ClinicScopedEntity
{
    public Guid PatientId { get; set; }
    public Patient? Patient { get; set; }

    /// <summary>
    /// Indicates whether reproductive history is applicable (false for male patients and pre-menarche children).
    /// </summary>
    public bool IsApplicable { get; set; } = true;

    // Menstrual & Sexual History
    public int? MenarcheAge { get; set; }
    public int? CoitarcheAge { get; set; } // Age at first sexual intercourse (PhilHealth MENSHIST @pOnsetSexIc)
    public DateOnly? LastMenstrualPeriod { get; set; }
    public int? PeriodDurationDays { get; set; }
    public int? CycleIntervalDays { get; set; }
    public int? PadsPerDay { get; set; }
    public bool IsMenopausal { get; set; }
    public int? MenopauseAge { get; set; }
    public string? ContraceptiveMethod { get; set; }

    // Pregnancy Status
    public bool IsCurrentlyPregnant { get; set; } = false;
    public DateOnly? ExpectedDeliveryDate { get; set; }

    // Screenings
    public DateOnly? LastPapSmearDate { get; set; }
    public DateOnly? LastMammogramDate { get; set; }

    // Obstetric History (G-P-T-P-A-L / G-P-F-P-A-L)
    public int Gravidity { get; set; }
    public int Parity { get; set; }
    public int TermBirths { get; set; }
    public int PretermBirths { get; set; }
    public int Abortions { get; set; }
    public int LivingChildren { get; set; }

    public string? DeliveryType { get; set; } // Vaginal, Cesarean, NotApplicable
    public bool HadPreEclampsiaHypertension { get; set; }
    public bool ReceivedFamilyPlanningCounseling { get; set; }

    public string? Remarks { get; set; }

    // YAKAP 2.0 Annex A mh_repro statutory fields
    public bool? HasMenarche { get; set; }
    public bool? HasLastMenstrualPeriod { get; set; }
    public bool? IsMenstrualRegular { get; set; }
    public bool? HasDysmenorrhea { get; set; }
    public string? DysmenorrheaSeverity { get; set; }
    public string? ContraceptiveUseStatusCode { get; set; }
    public string? DesiredContraceptiveMethodCodes { get; set; }
    public int? LastPapSmearYear { get; set; }
    public string? LastPapSmearResult { get; set; }
    public int? LastMammogramYear { get; set; }
    public string? LastMammogramResult { get; set; }
    public int MiscarriagesCount { get; set; } = 0;
    public int EctopicCount { get; set; } = 0;
    public int StillbirthsCount { get; set; } = 0;
    public bool HadGestationalDiabetes { get; set; } = false;
    public bool HadPostpartumHemorrhage { get; set; } = false;
    public int? PreviousCsCount { get; set; }
    public int? LastDeliveryYear { get; set; }
    public string? PrenatalCheckupCountCode { get; set; }
    public string? AgeOfGestation { get; set; }
    public bool? HasGynecologicalDisease { get; set; }
    public string? GynecologicalDiseaseSpec { get; set; }
    public bool? HasGynecologicalSti { get; set; }
    public string? GynecologicalStiSpec { get; set; }

    public string? MenstrualFrequencyCode { get; set; }
    public int? VisualInspectionAceticAcidYear { get; set; }
    public int? HpvDnaTestYear { get; set; }
    public int? ClinicalBreastExamYear { get; set; }
}
