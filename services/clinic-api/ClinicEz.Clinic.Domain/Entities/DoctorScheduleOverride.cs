using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class DoctorScheduleOverride : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid DoctorId { get; set; }
    public required string DoctorName { get; set; }

    public DateOnly Date { get; set; }
    public bool IsWorking { get; set; } = true;
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
    public bool IsOvernightShift { get; set; } = false;
    public int SlotDurationMinutes { get; set; } = 30;
    public string? Reason { get; set; }
}
