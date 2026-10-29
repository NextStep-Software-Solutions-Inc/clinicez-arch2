using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class DoctorLeave : ClinicScopedEntity
{
    public Guid? DoctorId { get; set; } // Null indicates clinic-wide holiday closure
    public required string DoctorName { get; set; }

    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }

    /// <summary>Set if leave covers only part of the day.</summary>
    public TimeOnly? PartialDayStartTime { get; set; }
    public TimeOnly? PartialDayEndTime { get; set; }

    public string? Reason { get; set; }
    public string Status { get; set; } = "Approved"; // "Approved", "Pending", "Cancelled"
    public string? LeaveType { get; set; } = "Vacation"; // "Vacation", "SickLeave", "CME", "Emergency", "Holiday"
}
