namespace ClinicEz.Patient.Application.Common.DTOs;

public sealed record VitalSignsDto(
    Guid Id,
    Guid PatientId,
    Guid ClinicId,
    Guid? ConsultationId,
    DateTime RecordedAt,
    decimal? WeightKg,
    decimal? HeightCm,
    decimal? Bmi,
    int? SystolicBp,
    int? DiastolicBp,
    int? HeartRateBpm,
    decimal? TemperatureCelsius,
    decimal? OxygenSaturationPercent,
    int? RespiratoryRateBreathsPerMin,
    decimal? FastingBloodGlucose,
    string? TakenBy,
    string? Facility,
    DateTime CreatedAt,
    DateTime? UpdatedAt);

public sealed record RecordPatientVitalsRequest(
    Guid? ClinicId,
    Guid? ConsultationId,
    DateTime? RecordedAt,
    decimal? WeightKg,
    decimal? HeightCm,
    decimal? Bmi,
    int? SystolicBp,
    int? DiastolicBp,
    int? HeartRateBpm,
    decimal? TemperatureCelsius,
    decimal? OxygenSaturationPercent,
    int? RespiratoryRateBreathsPerMin,
    decimal? FastingBloodGlucose,
    string? TakenBy,
    string? Facility);
