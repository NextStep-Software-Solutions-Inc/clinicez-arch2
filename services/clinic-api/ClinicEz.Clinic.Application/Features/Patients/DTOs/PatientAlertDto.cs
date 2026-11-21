using System;

namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

public sealed record PatientAlertDto(
    Guid? Id,
    string Category,
    string? Code,
    string Title,
    string Severity,
    string Status,
    DateTime? ExpiresAt = null,
    string? Notes = null,
    Guid? RecordedByStaffId = null,
    string? RecordedByStaffName = null
)
{
    public bool IsActive => Status == "Active" && (!ExpiresAt.HasValue || ExpiresAt.Value > DateTime.UtcNow);
}
