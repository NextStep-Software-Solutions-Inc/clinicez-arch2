using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientAlert : ClinicScopedEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public PatientAlertCategory Category { get; set; } = PatientAlertCategory.ClinicalSafety;
    public string? Code { get; set; }
    public required string Title { get; set; }
    public PatientAlertSeverity Severity { get; set; } = PatientAlertSeverity.Warning;
    public PatientAlertStatus Status { get; set; } = PatientAlertStatus.Active;
    public DateTime? ExpiresAt { get; set; }
    public string? Notes { get; set; }

    public bool IsActive => Status == PatientAlertStatus.Active && (!ExpiresAt.HasValue || ExpiresAt.Value > DateTime.UtcNow);

    public Guid? RecordedByStaffId { get; set; }
    public string? RecordedByStaffName { get; set; }
}
