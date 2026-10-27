using System;
using ClinicEz.Patient.Domain.Common;

namespace ClinicEz.Patient.Domain.Entities;

/// <summary>
/// Synchronized eligibility grant indicating that a patient is permitted
/// to initiate a triaged inquiry to a specific facility.
/// </summary>
public sealed class PatientEligibilityGrant : BaseEntity
{
    public Guid GrantId { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public string TenantId { get; set; } = string.Empty;
    public string FacilityId { get; set; } = string.Empty;
    public string FacilityType { get; set; } = string.Empty; // "Clinic", "Pharmacy", "Laboratory"
    public string FacilityName { get; set; } = string.Empty;

    public string ContextType { get; set; } = string.Empty; // "Appointment", "Encounter", "Prescription", "LabOrder"
    public string ContextId { get; set; } = string.Empty;

    public DateTime? ExpiresAtUtc { get; set; }
    public DateTime? WindowStartUtc { get; set; }
    public DateTime? WindowEndUtc { get; set; }

    public bool IsActive { get; set; } = true;
    public int Version { get; set; } = 1;
    public DateTime SyncedAtUtc { get; set; } = DateTime.UtcNow;
}
