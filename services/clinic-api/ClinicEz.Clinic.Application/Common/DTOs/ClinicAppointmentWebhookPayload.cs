using System;
using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Common.DTOs;

public sealed record ClinicProviderSnapshotDto(
    string Id,
    string Name,
    string? Specialty,
    string? AvatarUrl);

public sealed record ClinicAppointmentWebhookDto(
    string Id,
    string ClinicId,
    string ClinicName,
    ClinicProviderSnapshotDto Provider,
    string? ServiceType,
    string ScheduledAt,
    int DurationMinutes,
    string Status,
    string? Notes,
    string? Subject,
    string? ChiefComplaint,
    string? ClinicalAssessment = null,
    string? DoctorPlan = null,
    string? PrescriptionsSummary = null,
    string? PrescriptionPublicVerificationUrl = null);

public sealed record ClinicPushAppointmentsPayload(
    Guid ClinicId,
    Guid PatientId,
    IReadOnlyList<ClinicAppointmentWebhookDto> Appointments);
