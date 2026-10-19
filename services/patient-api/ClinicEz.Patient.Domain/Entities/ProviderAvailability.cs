using System;

using ClinicEz.Patient.Domain.Common;

namespace ClinicEz.Patient.Domain.Entities;

public sealed class ProviderAvailability : BaseEntity
{    
    public Guid ClinicHealthcareProviderId { get; set; }
    public ClinicHealthcareProvider ClinicHealthcareProvider { get; set; } = null!;

    public DayOfWeek DayOfWeek { get; set; }
    public TimeSpan StartTime { get; set; }
    public TimeSpan EndTime { get; set; }
    public bool IsActive { get; set; } = true;
}
