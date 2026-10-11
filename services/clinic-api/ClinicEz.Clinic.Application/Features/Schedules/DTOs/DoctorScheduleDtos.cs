using System;
using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Features.Schedules.DTOs;

public sealed record DoctorBreakTimeDto(
    Guid? Id,
    string Description,
    TimeOnly StartTime,
    TimeOnly EndTime);

public sealed record DoctorScheduleTemplateDto(
    Guid Id,
    Guid DoctorId,
    string DoctorName,
    DayOfWeek DayOfWeek,
    TimeOnly StartTime,
    TimeOnly EndTime,
    bool IsOvernightShift,
    int SlotDurationMinutes,
    int MaxPatientsPerSlot,
    bool IsActive,
    DateOnly EffectiveStartDate,
    DateOnly? EffectiveEndDate,
    List<DoctorBreakTimeDto> Breaks);

public sealed record AvailableSlotItemDto(
    TimeOnly StartTime,
    TimeOnly EndTime,
    DateTimeOffset SlotStartUtc,
    DateTimeOffset SlotEndUtc,
    bool IsAvailable,
    string Status, // "Available", "Booked", "Break", "Past", "OnLeave"
    Guid? ExistingAppointmentId = null,
    string? PatientName = null,
    string? Notes = null);

public sealed record DoctorAvailabilityDto(
    Guid DoctorId,
    string DoctorName,
    DateOnly Date,
    bool IsOnDuty,
    string? NonAvailabilityReason,
    List<AvailableSlotItemDto> Slots);

public sealed record DoctorLeaveDto(
    Guid Id,
    Guid? DoctorId,
    string DoctorName,
    DateOnly StartDate,
    DateOnly EndDate,
    TimeOnly? PartialDayStartTime,
    TimeOnly? PartialDayEndTime,
    string? Reason,
    string Status,
    string? LeaveType,
    DateTime CreatedAt);
