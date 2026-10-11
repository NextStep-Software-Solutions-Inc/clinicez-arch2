using System;
using ClinicEz.Laboratory.Domain.Common;
using ClinicEz.Laboratory.Domain.Enums;

namespace ClinicEz.Laboratory.Domain.Entities;

public sealed class LabStaffMember : BaseEntity, ILabScopedEntity
{
    public required string TenantId { get; set; }
    public Guid LaboratoryId { get; set; }

    public required string FirstName { get; set; }
    public required string LastName { get; set; }
    public string? MiddleName { get; set; }
    public string? Title { get; set; } // e.g. "MD, FPSP", "RMT"

    public LabStaffRole Role { get; set; }

    public string? Email { get; set; }
    public string? PhoneNumber { get; set; }

    // Professional regulation compliance (PRC / PTR)
    public string? PrcLicenseNumber { get; set; }
    public string? PtrNumber { get; set; }
    public string? Specialty { get; set; }

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
