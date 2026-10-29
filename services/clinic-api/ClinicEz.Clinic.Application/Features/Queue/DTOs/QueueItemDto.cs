using System;
using System.Collections.Generic;
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
    public static string? FormatVitalsSummary(PatientVitals? vitals)
    {
        if (vitals == null) return null;

        var parts = new List<string>();

        if (vitals.SystolicBp.HasValue && vitals.DiastolicBp.HasValue)
            parts.Add($"BP {vitals.SystolicBp.Value}/{vitals.DiastolicBp.Value}");
        else if (vitals.SystolicBp.HasValue)
            parts.Add($"BP {vitals.SystolicBp.Value}");

        if (vitals.HeartRateBpm.HasValue)
            parts.Add($"HR {vitals.HeartRateBpm.Value}");

        if (vitals.RespiratoryRateBreathsPerMin.HasValue)
            parts.Add($"RR {vitals.RespiratoryRateBreathsPerMin.Value}/min");

        if (vitals.TemperatureCelsius.HasValue)
            parts.Add($"Temp {vitals.TemperatureCelsius.Value}°C");

        if (vitals.OxygenSaturationPercent.HasValue)
            parts.Add($"SpO2 {vitals.OxygenSaturationPercent.Value}%");

        if (vitals.Bmi.HasValue)
            parts.Add($"BMI {vitals.Bmi.Value}");

        var zCategory = vitals.GrowthZScoreCategory;
        if (!string.IsNullOrWhiteSpace(zCategory))
            parts.Add($"Z: {zCategory.Trim()}");

        return parts.Count > 0 ? string.Join(" • ", parts) : null;
    }

    public static QueueItemDto ToDto(this QueueItem item)
    {
        string? vitalsSummary = FormatVitalsSummary(item.PatientVitals);

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
            item.PatientVitals != null,
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
