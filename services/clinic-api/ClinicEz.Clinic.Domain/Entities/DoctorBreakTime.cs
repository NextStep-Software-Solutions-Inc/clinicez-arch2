using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class DoctorBreakTime : BaseEntity
{
    public Guid TemplateId { get; set; }
    public DoctorScheduleTemplate? Template { get; set; }

    /// <summary>Alias for TemplateId for backward compatibility</summary>
    public Guid DoctorScheduleTemplateId
    {
        get => TemplateId;
        set => TemplateId = value;
    }

    public required string Description { get; set; } // e.g. "Lunch Break", "Ward Rounds"
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
}
