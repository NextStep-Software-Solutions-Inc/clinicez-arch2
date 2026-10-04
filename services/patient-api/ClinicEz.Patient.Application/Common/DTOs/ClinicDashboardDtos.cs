namespace ClinicEz.Patient.Application.Common.DTOs;

// ── Responses from Clinic Dashboard API ─────────────────────────────────────

public sealed record ClinicProviderSnapshot(
    string Id,
    string Name,
    string? Specialty,
    string? AvatarUrl);

public sealed record ClinicAppointmentDto(
    string Id,
    string ClinicId,
    string ClinicName,
    ClinicProviderSnapshot Provider,
    string? ServiceType,
    string ScheduledAt,        // ISO-8601 UTC string from the clinic backend
    int DurationMinutes,
    string Status,
    string? Notes,
    string? Subject,
    string? ChiefComplaint,
    string? ClinicalAssessment = null,
    string? DoctorPlan = null,
    string? PrescriptionsSummary = null,
    string? PrescriptionPublicVerificationUrl = null);

public sealed record ClinicAppointmentsResponse(
    IReadOnlyList<ClinicAppointmentDto> Items,
    int TotalCount);
