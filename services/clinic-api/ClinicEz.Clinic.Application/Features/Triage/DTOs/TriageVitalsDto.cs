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
    string? Notes);
