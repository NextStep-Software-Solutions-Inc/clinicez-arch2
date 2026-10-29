using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PhilHealthDailySequence : ClinicScopedEntity
{
    public string AccreditationNo { get; set; } = string.Empty;
    public string Prefix { get; set; } = string.Empty;
    public DateOnly ManilaDate { get; set; }
    public long LastValue { get; set; }
}
