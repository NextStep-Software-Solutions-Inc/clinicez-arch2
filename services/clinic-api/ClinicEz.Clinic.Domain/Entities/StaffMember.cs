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

    /// <summary>
    /// Optional default room or station assigned to this Doctor or Nurse.
    /// </summary>
    public Guid? AssignedRoomId { get; set; }
    public ClinicRoom? AssignedRoom { get; set; }

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
    public string? PhilHealthPan { get; set; }

    public bool IsActive { get; set; } = true;

    // Facility-local credentials (no external identity provider; works fully offline on a LAN)
    public string? PasswordHash { get; set; }
    public bool MustChangePassword { get; set; }
    public int FailedLoginCount { get; set; }
    public DateTime? LockoutEnd { get; set; }
    public DateTime? LastLoginAt { get; set; }

    /// <summary>Incremented to revoke all issued access tokens and refresh tokens for this staff member.</summary>
    public int TokenVersion { get; set; }
}
