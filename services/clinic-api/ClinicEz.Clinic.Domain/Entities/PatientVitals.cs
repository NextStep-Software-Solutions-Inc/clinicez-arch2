using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientVitals : ClinicScopedEntity
{
    public Guid? QueueItemId { get; set; }
    public QueueItem? QueueItem { get; set; }

    public Guid? ConsultationEncounterId { get; set; }
    public ConsultationEncounter? ConsultationEncounter { get; set; }

    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public Guid? NurseId { get; set; }
    public string? RecordedByNurseName { get; set; }

    public DateTime RecordedAt { get; set; } = DateTime.UtcNow;

    // Vital Signs
    public int? SystolicBp { get; set; }
    public int? DiastolicBp { get; set; }
    public int? HeartRateBpm { get; set; }
    public decimal? TemperatureCelsius { get; set; }
    public int? RespiratoryRateBreathsPerMin { get; set; }

    public decimal? OxygenSaturationPercent { get; set; }
    public decimal? HeightCm { get; set; }
    public decimal? WeightKg { get; set; }
    public decimal? Bmi { get; set; }
    public int? PainScore { get; set; } // 0-10
    public decimal? BloodGlucoseRandomMgDl { get; set; }
    public string? Notes { get; set; }

    // Pre-Assessment & Nursing Triage Observations
    public string? PreAssessmentNotes { get; set; }
    public string? PreAssessmentRemarks { get; set; }
    public string? TriageAcuityReason { get; set; }

    // Visual Acuity (Snellen format: "20/20", "20/40", "CF", etc.)
    public string? VisionChartTypeCode { get; set; }
    public string? VisualAcuityLeft { get; set; }
    public string? VisualAcuityRight { get; set; }
    public string? VisionBothEyes { get; set; }
    public string? VisionCorrectedLeft { get; set; }
    public string? VisionCorrectedRight { get; set; }
    public string? VisionCorrectedBoth { get; set; }
    public string? NearVisionLeft { get; set; }
    public string? NearVisionRight { get; set; }
    public string? NearVisionBoth { get; set; }
    public string? VisualAcuityRemarks { get; set; }

    public bool? HasSamFormAccomplished { get; set; }
    public string? SamFormCode { get; set; }

    // Pediatric Anthropometrics
    public decimal? HeadCircumferenceCm { get; set; }
    public decimal? MidUpperArmCircumferenceCm { get; set; }
    public bool IsMeasuredRecumbent { get; set; }

    // WHO Pediatric Z-Score Metrics
    public decimal? ZScoreWeightForAge { get; set; }
    public decimal? ZScoreLengthForAge { get; set; }
    public decimal? ZScoreWeightForLength { get; set; }

    // Anthropometrics & Body Composition (Adult Metabolic Risk & Pediatric Growth)
    public decimal? WaistCircumferenceCm { get; set; }
    public decimal? HipCircumferenceCm { get; set; }
    public decimal? BodyLengthCm { get; set; }
    public decimal? SkinfoldThicknessMm { get; set; }
    public decimal? LimbsCircumferenceCm { get; set; }

    // WHO Child Growth Standards (0 to 60 Months)
    public string? GrowthZScoreCategory { get; set; }
    public string? GrowthZScoreCode { get; set; }
}
