using System;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Application.Features.Queue.DTOs;

public sealed record QueueItemDto(
    Guid Id,
    string TenantId,
    Guid ClinicId,
    string QueueNumber,
    int SequenceNumber,
    DateOnly QueueDate,
    Guid PatientId,
    string PatientName,
    Guid? AppointmentId,
    Guid? DoctorId,
    string? DoctorName,
    QueuePriority Priority,
    QueueStatus Status,
    DateTime CheckInTime,
    DateTime? CalledTime,
    DateTime? CompletedTime,
    string? ChiefComplaint,
    bool HasVitals,
    string? VitalsSummary,
    string? RoomOrStation = null);

public sealed record QueueMetricsDto(
    int InQueue,
    int UrgentTriage,
    int CompletedToday,
    int TotalCheckedIn);
