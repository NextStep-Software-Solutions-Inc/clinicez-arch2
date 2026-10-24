using System;
using ClinicEz.Clinic.Domain.Entities;
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
    string? RoomOrStation = null,
    Guid? RoomId = null,
    VisitType VisitType = VisitType.Consultation,
    string? DischargeNotes = null,
    DateTime? DischargedAt = null,
    Guid? DischargedByStaffId = null,
    string? DivertedToFacility = null,
    string? TransportMode = null,
    string? ParamedicOrEscortName = null,
    string? HandoverSummary = null,
    DateTime? DivertedAt = null,
    Guid? DivertedByStaffId = null);

public static class QueueItemMappingExtensions
{
    public static QueueItemDto ToDto(this QueueItem item)
    {
        string? vitalsSummary = item.TriageVitals != null
            ? $"BP: {item.TriageVitals.SystolicBp}/{item.TriageVitals.DiastolicBp} • HR: {item.TriageVitals.HeartRateBpm}"
            : null;

        return new QueueItemDto(
            item.Id,
            item.TenantId,
            item.ClinicId,
            item.QueueNumber,
            item.SequenceNumber,
            item.QueueDate,
            item.PatientId,
            item.PatientName,
            item.AppointmentId,
            item.DoctorId,
            item.DoctorName,
            item.Priority,
            item.Status,
            item.CheckInTime,
            item.CalledTime,
            item.CompletedTime,
            item.ChiefComplaint,
            item.TriageVitals != null,
            vitalsSummary,
            item.RoomOrStation,
            item.RoomId,
            item.VisitType,
            item.DischargeNotes,
            item.DischargedAt,
            item.DischargedByStaffId,
            item.DivertedToFacility,
            item.TransportMode,
            item.ParamedicOrEscortName,
            item.HandoverSummary,
            item.DivertedAt,
            item.DivertedByStaffId);
    }
}

public sealed record QueueMetricsDto(
    int InQueue,
    int UrgentTriage,
    int CompletedToday,
    int TotalCheckedIn);
