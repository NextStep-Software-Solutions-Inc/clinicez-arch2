using System;
using System.ComponentModel.DataAnnotations.Schema;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientReproductiveHistory : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid PatientId { get; set; }
    public ClinicPatient? Patient { get; set; }

    /// <summary>
    /// Indicates whether reproductive history is applicable (false for male patients and pre-menarche children).
    /// </summary>
    public bool IsApplicable { get; set; } = true;

    // Menstrual History
    public int? MenarcheAge { get; set; }
    public DateOnly? LastMenstrualPeriod { get; set; }
    public int? PeriodDurationDays { get; set; }
    public int? CycleIntervalDays { get; set; }
    public int? PadsPerDay { get; set; }
    public bool IsMenopausal { get; set; }
    public int? MenopauseAge { get; set; }
    public string? ContraceptiveMethod { get; set; }

    // Obstetric History (G-P-T-P-A-L / G-P-F-P-A-L)
    public int Gravidity { get; set; }
    [NotMapped] public int Gravida { get => Gravidity; set => Gravidity = value; }

    public int Parity { get; set; }
    [NotMapped] public int Para { get => Parity; set => Parity = value; }

    public int TermBirths { get; set; }
    [NotMapped] public int FullTermCount { get => TermBirths; set => TermBirths = value; }

    public int PretermBirths { get; set; }
    [NotMapped] public int PrematureCount { get => PretermBirths; set => PretermBirths = value; }

    public int Abortions { get; set; }
    [NotMapped] public int AbortionCount { get => Abortions; set => Abortions = value; }

    public int LivingChildren { get; set; }
    [NotMapped] public int LivingChildrenCount { get => LivingChildren; set => LivingChildren = value; }

    public string? DeliveryType { get; set; } // Vaginal, Cesarean, NotApplicable
    public bool HadPreEclampsiaHypertension { get; set; }
    public bool ReceivedFamilyPlanningCounseling { get; set; }

    public string? Remarks { get; set; }
}
