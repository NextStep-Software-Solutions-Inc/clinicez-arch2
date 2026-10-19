using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Schedules.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Schedules.Services;

public sealed class SlotAvailabilityService : ISlotAvailabilityService
{
    private readonly IRepository<DoctorScheduleTemplate> _templateRepo;
    private readonly IRepository<DoctorLeave> _leaveRepo;
    private readonly IRepository<DoctorScheduleOverride> _overrideRepo;
    private readonly IRepository<Appointment> _appointmentRepo;
    private readonly IRepository<StaffMember> _staffRepo;

    private static readonly TimeSpan ManilaOffset = TimeSpan.FromHours(8);

    public SlotAvailabilityService(
        IRepository<DoctorScheduleTemplate> templateRepo,
        IRepository<DoctorLeave> leaveRepo,
        IRepository<DoctorScheduleOverride> overrideRepo,
        IRepository<Appointment> appointmentRepo,
        IRepository<StaffMember> staffRepo)
    {
        _templateRepo = templateRepo;
        _leaveRepo = leaveRepo;
        _overrideRepo = overrideRepo;
        _appointmentRepo = appointmentRepo;
        _staffRepo = staffRepo;
    }

    public async Task<DoctorAvailabilityDto> GetDoctorAvailabilityAsync(
        Guid clinicId,
        Guid doctorId,
        DateOnly date,
        int? requestedSlotDurationMinutes = null,
        CancellationToken ct = default)
    {
        // 1. Resolve Doctor Name
        var staff = await _staffRepo.Query()
            .FirstOrDefaultAsync(s => s.ClinicId == clinicId && s.Id == doctorId && !s.IsDeleted, ct);
        var doctorName = staff != null ? $"{staff.FirstName} {staff.LastName}".Trim() : "Attending Physician";

        // 2. Check Doctor Leaves & Clinic-wide closures
        var leaves = await _leaveRepo.Query()
            .Where(l => l.ClinicId == clinicId &&
                        (l.DoctorId == doctorId || l.DoctorId == null) &&
                        !l.IsDeleted &&
                        l.Status == "Approved" &&
                        l.StartDate <= date && date <= l.EndDate)
            .ToListAsync(ct);

        var fullDayLeave = leaves.FirstOrDefault(l => !l.PartialDayStartTime.HasValue);
        if (fullDayLeave != null)
        {
            return new DoctorAvailabilityDto(
                doctorId,
                doctorName,
                date,
                IsOnDuty: false,
                NonAvailabilityReason: !string.IsNullOrWhiteSpace(fullDayLeave.Reason) ? fullDayLeave.Reason : "Doctor on leave",
                Slots: new List<AvailableSlotItemDto>());
        }

        var partialLeave = leaves.FirstOrDefault(l => l.PartialDayStartTime.HasValue && l.PartialDayEndTime.HasValue);

        // 3. Check Date-Specific Overrides
        var dateOverride = await _overrideRepo.Query()
            .FirstOrDefaultAsync(o => o.ClinicId == clinicId && o.DoctorId == doctorId && o.Date == date && !o.IsDeleted, ct);

        if (dateOverride != null && !dateOverride.IsWorking)
        {
            return new DoctorAvailabilityDto(
                doctorId,
                doctorName,
                date,
                IsOnDuty: false,
                NonAvailabilityReason: !string.IsNullOrWhiteSpace(dateOverride.Reason) ? dateOverride.Reason : "Schedule cancelled for this date",
                Slots: new List<AvailableSlotItemDto>());
        }

        // 4. Retrieve Templates (today's template and yesterday's overnight template if applicable)
        List<DoctorBreakTime> breaks = new();
        List<(TimeOnly Start, TimeOnly End, int Interval)> shiftWindows = new();

        if (dateOverride != null && dateOverride.IsWorking)
        {
            var interval = requestedSlotDurationMinutes ?? dateOverride.SlotDurationMinutes;
            if (interval <= 0) interval = 30;

            if (dateOverride.IsOvernightShift && dateOverride.EndTime < dateOverride.StartTime)
            {
                // Overnight shift on this date: from StartTime to midnight
                shiftWindows.Add((dateOverride.StartTime, new TimeOnly(23, 59, 59), interval));
            }
            else
            {
                shiftWindows.Add((dateOverride.StartTime, dateOverride.EndTime, interval));
            }
        }
        else
        {
            var todayTemplates = await _templateRepo.Query()
                .Include(t => t.BreakTimes)
                .Where(t => t.ClinicId == clinicId &&
                            t.DoctorId == doctorId &&
                            !t.IsDeleted &&
                            t.IsActive &&
                            t.DayOfWeek == date.DayOfWeek &&
                            t.EffectiveStartDate <= date &&
                            (t.EffectiveEndDate == null || date <= t.EffectiveEndDate.Value))
                .ToListAsync(ct);

            foreach (var template in todayTemplates)
            {
                var interval = requestedSlotDurationMinutes ?? template.SlotDurationMinutes;
                if (interval <= 0) interval = 30;

                breaks.AddRange(template.BreakTimes.Where(b => !b.IsDeleted));

                if (template.IsOvernightShift && template.EndTime < template.StartTime)
                {
                    // Starts today and runs to midnight
                    shiftWindows.Add((template.StartTime, new TimeOnly(23, 59, 59), interval));
                }
                else
                {
                    shiftWindows.Add((template.StartTime, template.EndTime, interval));
                }
            }

            // Check yesterday's overnight shift that spills into today (00:00 to EndTime)
            var yesterday = date.AddDays(-1);
            var yesterdayOvernightTemplates = await _templateRepo.Query()
                .Include(t => t.BreakTimes)
                .Where(t => t.ClinicId == clinicId &&
                            t.DoctorId == doctorId &&
                            !t.IsDeleted &&
                            t.IsActive &&
                            t.IsOvernightShift &&
                            t.DayOfWeek == yesterday.DayOfWeek &&
                            t.EffectiveStartDate <= yesterday &&
                            (t.EffectiveEndDate == null || yesterday <= t.EffectiveEndDate.Value))
                .ToListAsync(ct);

            foreach (var overnight in yesterdayOvernightTemplates)
            {
                var interval = requestedSlotDurationMinutes ?? overnight.SlotDurationMinutes;
                if (interval <= 0) interval = 30;

                shiftWindows.Add((new TimeOnly(0, 0, 0), overnight.EndTime, interval));
                breaks.AddRange(overnight.BreakTimes.Where(b => !b.IsDeleted && b.EndTime <= overnight.EndTime));
            }
        }

        if (shiftWindows.Count == 0)
        {
            return new DoctorAvailabilityDto(
                doctorId,
                doctorName,
                date,
                IsOnDuty: false,
                NonAvailabilityReason: "No scheduled shift on this day",
                Slots: new List<AvailableSlotItemDto>());
        }

        // 5. Query Booked Appointments overlapping this date
        var dayStartUtc = new DateTimeOffset(date.ToDateTime(TimeOnly.MinValue), ManilaOffset).UtcDateTime;
        var dayEndUtc = new DateTimeOffset(date.AddDays(1).ToDateTime(TimeOnly.MinValue), ManilaOffset).UtcDateTime;

        var existingAppointments = await _appointmentRepo.Query()
            .Where(a => a.ClinicId == clinicId &&
                        a.DoctorId == doctorId &&
                        !a.IsDeleted &&
                        a.Status != AppointmentStatus.Cancelled &&
                        a.ScheduledAt < dayEndUtc &&
                        dayStartUtc < a.EndTimeUtc)
            .ToListAsync(ct);

        // 6. Generate Discrete Slots
        var slots = new List<AvailableSlotItemDto>();
        var seenStarts = new HashSet<TimeOnly>();

        foreach (var window in shiftWindows)
        {
            var cur = window.Start;
            var interval = window.Interval;

            while (true)
            {
                // Ensure slot start + interval does not exceed window.End
                var nextMinutes = cur.Hour * 60 + cur.Minute + interval;
                var endMinutes = window.End == new TimeOnly(23, 59, 59) ? 24 * 60 : (window.End.Hour * 60 + window.End.Minute);

                if (nextMinutes > endMinutes)
                {
                    break;
                }

                var slotEnd = window.End == new TimeOnly(23, 59, 59) && nextMinutes == 24 * 60
                    ? new TimeOnly(23, 59, 59)
                    : cur.AddMinutes(interval);

                if (seenStarts.Add(cur))
                {
                    var slotStartUtc = new DateTimeOffset(date.ToDateTime(cur), ManilaOffset).ToUniversalTime();
                    var slotEndUtc = slotStartUtc.AddMinutes(interval);

                    // Check if slot falls in a Break
                    var matchingBreak = breaks.FirstOrDefault(b =>
                        (b.StartTime <= cur && cur < b.EndTime) ||
                        (b.StartTime < slotEnd && slotEnd <= b.EndTime) ||
                        (cur <= b.StartTime && b.EndTime <= slotEnd));
                    var isBreak = matchingBreak != null;

                    // Check if slot falls in partial-day leave
                    var isLeave = partialLeave != null &&
                        partialLeave.PartialDayStartTime.HasValue &&
                        partialLeave.PartialDayEndTime.HasValue && (
                        (partialLeave.PartialDayStartTime.Value <= cur && cur < partialLeave.PartialDayEndTime.Value) ||
                        (partialLeave.PartialDayStartTime.Value < slotEnd && slotEnd <= partialLeave.PartialDayEndTime.Value));

                    // Check if past
                    var isPast = slotEndUtc <= DateTimeOffset.UtcNow;

                    // Check if booked
                    var bookedAppt = existingAppointments.FirstOrDefault(a =>
                        a.ScheduledAt < slotEndUtc.UtcDateTime && slotStartUtc.UtcDateTime < a.EndTimeUtc);

                    string status;
                    bool isAvailable = false;

                    if (bookedAppt != null)
                    {
                        status = "Booked";
                    }
                    else if (isBreak)
                    {
                        status = "Break";
                    }
                    else if (isLeave)
                    {
                        status = "OnLeave";
                    }
                    else if (isPast)
                    {
                        status = "Past";
                    }
                    else
                    {
                        status = "Available";
                        isAvailable = true;
                    }

                    var slotNotes = bookedAppt?.Notes ?? (isBreak ? matchingBreak?.Description : (isLeave ? partialLeave?.Reason : null));

                    slots.Add(new AvailableSlotItemDto(
                        StartTime: cur,
                        EndTime: slotEnd,
                        SlotStartUtc: slotStartUtc,
                        SlotEndUtc: slotEndUtc,
                        IsAvailable: isAvailable,
                        Status: status,
                        ExistingAppointmentId: bookedAppt?.Id,
                        PatientName: bookedAppt?.PatientName,
                        Notes: slotNotes));
                }

                if (nextMinutes >= endMinutes)
                {
                    break;
                }

                cur = cur.AddMinutes(interval);
            }
        }

        slots.Sort((a, b) => a.StartTime.CompareTo(b.StartTime));

        return new DoctorAvailabilityDto(
            DoctorId: doctorId,
            DoctorName: doctorName,
            Date: date,
            IsOnDuty: true,
            NonAvailabilityReason: null,
            Slots: slots);
    }
}
