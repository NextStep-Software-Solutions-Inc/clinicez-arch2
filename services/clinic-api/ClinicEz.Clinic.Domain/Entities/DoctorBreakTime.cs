using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class DoctorBreakTime : BaseEntity
{
    public Guid TemplateId { get; set; }
    public DoctorScheduleTemplate? Template { get; set; }


    public required string Description { get; set; } // e.g. "Lunch Break", "Ward Rounds"
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
}
