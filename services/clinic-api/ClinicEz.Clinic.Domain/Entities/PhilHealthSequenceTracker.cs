using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public enum PhilHealthSequenceType
{
    Case = 0,
    Enlistment = 1,
    Profiling = 2,
    Soap = 3,
    Medicine = 4,
    Transmittal = 5,
}

public sealed class PhilHealthSequenceTracker : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }

    public PhilHealthSequenceType SequenceType { get; set; }
    public required string EffectiveYear { get; set; } // e.g. "2026"
    public int CurrentSequence { get; set; } = 0;

    public DateTime LastAssignedAt { get; set; } = DateTime.UtcNow;
}
