using System;

namespace ClinicEz.Clinic.Application.Features.Triage.DTOs;

public sealed record TriageVitalsDto(
    Guid Id,
    string TenantId,
    Guid ClinicId,
    Guid QueueItemId,
    Guid PatientId,
    Guid? NurseId,
    string? RecordedByNurseName,
    DateTime RecordedAt,
    int? SystolicBp,
    int? DiastolicBp,
    int? HeartRateBpm,
    decimal? TemperatureCelsius,
    int? RespiratoryRateBreathsPerMin,
    decimal? OxygenSaturationPercent,
    decimal? HeightCm,
    decimal? WeightKg,
    decimal? Bmi,
    int? PainScore,
    string? Notes,
    string? VisualAcuityLeft = null,
    string? VisualAcuityRight = null,
    decimal? HeadCircumferenceCm = null,
    decimal? MidUpperArmCircumferenceCm = null,
    bool IsMeasuredRecumbent = false,
    decimal? ZScoreWeightForAge = null,
    decimal? ZScoreLengthForAge = null,
    decimal? ZScoreWeightForLength = null,
    string? GrowthZScoreCategory = null,
    string? GrowthZScoreCode = null,
    decimal? WaistCircumferenceCm = null,
    decimal? HipCircumferenceCm = null,
    decimal? BodyLengthCm = null,
    decimal? SkinfoldThicknessMm = null,
    decimal? LimbsCircumferenceCm = null,
    string? PreAssessmentNotes = null,
    string? PreAssessmentRemarks = null,
    string? TriageAcuityReason = null)
{
    public string? PhilHealthZScoreCategory => GrowthZScoreCategory;
    public string? PhilHealthZScoreCode => GrowthZScoreCode;
}
