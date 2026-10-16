using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class TriageVitals : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }

    public Guid QueueItemId { get; set; }
    public QueueItem? QueueItem { get; set; }

    public Guid PatientId { get; set; }
    public Guid? NurseId { get; set; }
    public string? RecordedByNurseName { get; set; }

    public DateTime RecordedAt { get; set; } = DateTime.UtcNow;

    // Vital Signs
    public int? SystolicBp { get; set; }
    public int? DiastolicBp { get; set; }
    public int? HeartRateBpm { get; set; }
    public decimal? TemperatureCelsius { get; set; }
    public int? RespiratoryRateBreathsPerMin { get; set; }

    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    public int? RespiratoryRate
    {
        get => RespiratoryRateBreathsPerMin;
        set => RespiratoryRateBreathsPerMin = value;
    }

    public decimal? OxygenSaturationPercent { get; set; }
    public decimal? HeightCm { get; set; }
    public decimal? WeightKg { get; set; }
    public decimal? Bmi { get; set; }
    public int? PainScore { get; set; } // 0-10
    public string? Notes { get; set; }

    // Pre-Assessment & Nursing Triage Observations
    public string? PreAssessmentNotes { get; set; }
    public string? PreAssessmentRemarks { get; set; }
    public string? TriageAcuityReason { get; set; }

    // Visual Acuity (Snellen format: "20/20", "20/40", "CF", etc.)
    public string? VisualAcuityLeft { get; set; }
    public string? VisualAcuityRight { get; set; }

    // Pediatric Anthropometrics
    public decimal? HeadCircumferenceCm { get; set; }
    public decimal? MidUpperArmCircumferenceCm { get; set; }
    public bool IsMeasuredRecumbent { get; set; }

    // WHO Pediatric Z-Score Metrics
    public decimal? ZScoreWeightForAge { get; set; }
    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    public decimal? WeightForAgeZScore
    {
        get => ZScoreWeightForAge;
        set => ZScoreWeightForAge = value;
    }

    public decimal? ZScoreLengthForAge { get; set; }
    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    public decimal? HeightForAgeZScore
    {
        get => ZScoreLengthForAge;
        set => ZScoreLengthForAge = value;
    }

    public decimal? ZScoreWeightForLength { get; set; }
    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    public decimal? WeightForHeightZScore
    {
        get => ZScoreWeightForLength;
        set => ZScoreWeightForLength = value;
    }

    public string? PhilHealthZScoreCategory { get; set; }
    public string? PhilHealthZScoreCode { get; set; }
}
