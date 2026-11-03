namespace ClinicEz.Patient.Application.Common.DTOs;

public sealed record TodayMedicationDto(
    Guid Id,
    string MedicationName,
    string? Dosage,
    string? Instructions,
    string? ScheduledTime,
    bool IsTaken,
    DateTime? TakenAt);

public sealed record LogMedicationAdherenceRequest(
    DateTime? TakenAt = null,
    string? Notes = null);
