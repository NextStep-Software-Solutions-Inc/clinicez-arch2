using System;
using System.ComponentModel.DataAnnotations;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientCodeSequenceTracker : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public int Year { get; set; }
    [ConcurrencyCheck]
    public int CurrentSequence { get; set; } = 0;
    public DateTime LastAssignedAt { get; set; } = DateTime.UtcNow;
}

