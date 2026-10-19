namespace ClinicEz.Patient.Application.Common.DTOs;

public sealed record AppointmentProviderSnapshot(
    Guid Id,
    string Name,
    string? Specialty,
    string? AvatarUrl);

public sealed record AppointmentDto(
    Guid Id,
    Guid ClinicId,
    string ClinicName,
    AppointmentProviderSnapshot Provider,
    string? ServiceType,
    string ScheduledAt, // ISO-8601 UTC string
    int DurationMinutes,
    string Status,
    string? Notes,
    string? Subject,
    string? ChiefComplaint,
    string? ClinicalAssessment = null,
    string? DoctorPlan = null,
    string? PrescriptionsSummary = null,
    string? PrescriptionPublicVerificationUrl = null);

public sealed record AppointmentsResponse(
    IReadOnlyList<AppointmentDto> Items,
    int TotalCount);
