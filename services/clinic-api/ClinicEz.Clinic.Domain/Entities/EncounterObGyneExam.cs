using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class EncounterObGyneExam : ClinicScopedEntity
{
    public Guid ConsultationEncounterId { get; set; }
    public ConsultationEncounter ConsultationEncounter { get; set; } = null!;

    public decimal? FundicHeightCm { get; set; }
    public int? FetalHeartToneBpm { get; set; }
    public int? EstimatedFetalWeightGrams { get; set; }

    public string? LeopoldL1 { get; set; }
    public string? LeopoldL2 { get; set; }
    public string? LeopoldL3 { get; set; }
    public string? LeopoldL4 { get; set; }

    public string? PerinealInspection { get; set; }
    public string? SpeculumExam { get; set; }
    public string? InternalExam { get; set; }
    public string? BimanualExam { get; set; }
    public string? RectovaginalExam { get; set; }
    public string? Remarks { get; set; }
}
