using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientGuardian : ClinicScopedEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public string? PhilHealthPin { get; set; }
    public string LastName { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string? MiddleName { get; set; }
    public string? Suffix { get; set; }
    public DateOnly? BirthDate { get; set; }
    public BiologicalSex? Sex { get; set; }
    public string ContactNumber { get; set; } = string.Empty;

    /// <summary>
    /// Canonical relationship code (e.g. "MOTHER", "FATHER", "LEGAL_GUARDIAN", "MTH", "FTH").
    /// </summary>
    public string RelationshipCode { get; set; } = string.Empty;
    public string? RelationshipOtherSpecify { get; set; }

    public bool IsPrimaryGuardian { get; set; } = true;
    public bool IsEmergencyContact { get; set; } = true;
}
