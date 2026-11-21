using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientHomeMedication : ClinicScopedEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public string GenericDrugName { get; set; } = string.Empty;
    public string? BrandName { get; set; }
    public string? PhilHealthDrugCode { get; set; }

    public string? DoseStrength { get; set; }
    public string? Form { get; set; }
    public string? Route { get; set; }
    public string? Frequency { get; set; }
    public string? Duration { get; set; }

    public bool IsPndfListed { get; set; } = true;
    public string? PrescribingPhysicianName { get; set; }
    public DateOnly? StartDate { get; set; }
    public DateOnly? StoppedDate { get; set; }
    public bool IsActive { get; set; } = true;
    public string? Indication { get; set; }
    public string? Source { get; set; }
}
