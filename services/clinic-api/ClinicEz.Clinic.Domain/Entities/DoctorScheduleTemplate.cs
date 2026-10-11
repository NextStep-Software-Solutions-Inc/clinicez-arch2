using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class DoctorScheduleTemplate : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid? BranchId { get; set; }
    public Guid DoctorId { get; set; }
    public required string DoctorName { get; set; }

    /// <summary>Day of the week (Sunday = 0, Monday = 1, etc.)</summary>
    public DayOfWeek DayOfWeek { get; set; }

    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }

    /// <summary>Indicates shift crosses midnight into subsequent day (e.g. 22:00 to 06:00).</summary>
    public bool IsOvernightShift { get; set; } = false;

    /// <summary>Slot interval / duration in minutes: 15, 30, 60.</summary>
    public int SlotDurationMinutes { get; set; } = 30;

    /// <summary>Alias for SlotDurationMinutes.</summary>
    public int SlotIntervalMinutes
    {
        get => SlotDurationMinutes;
        set => SlotDurationMinutes = value;
    }

    /// <summary>Maximum simultaneous patients per slot (default 1).</summary>
    public int MaxPatientsPerSlot { get; set; } = 1;

    public bool IsActive { get; set; } = true;
    public DateOnly EffectiveStartDate { get; set; }
    public DateOnly? EffectiveEndDate { get; set; }

    public ICollection<DoctorBreakTime> BreakTimes { get; set; } = new List<DoctorBreakTime>();
}
