using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class StaffMember : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }

    public Guid? ClinicRoleId { get; set; }
    public ClinicRole? ClinicRole { get; set; }

    public required string FirstName { get; set; }
    public required string LastName { get; set; }
    public string? MiddleName { get; set; }
    public string? Title { get; set; }

    /// <summary>
    /// Stored as string in database: "Doctor", "Nurse", "Receptionist", "Admin"
    /// </summary>
    public StaffRole Role { get; set; }

    public string? Email { get; set; }
    public string? PhoneNumber { get; set; }

    // Professional credentials
    public string? PrcLicenseNumber { get; set; }
    public string? PtrNumber { get; set; }
    public string? S2LicenseNumber { get; set; }
    public string? Specialty { get; set; }

    public bool IsActive { get; set; } = true;
}
