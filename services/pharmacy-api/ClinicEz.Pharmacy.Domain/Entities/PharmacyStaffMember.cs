using System;
using ClinicEz.Pharmacy.Domain.Common;
using ClinicEz.Pharmacy.Domain.Enums;

namespace ClinicEz.Pharmacy.Domain.Entities;

public sealed class PharmacyStaffMember : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid PharmacyId { get; set; }

    public required string FirstName { get; set; }
    public required string LastName { get; set; }
    public string? MiddleName { get; set; }
    public string? Title { get; set; } // e.g. "RPh", "PharmD"

    public PharmacyStaffRole Role { get; set; }

    public string? Email { get; set; }
    public string? PhoneNumber { get; set; }

    // Professional regulations compliance (PRC / S2 PDEA)
    public string? PrcLicenseNumber { get; set; }
    public string? S2LicenseNumber { get; set; }

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
