using System;
using ClinicEz.Pharmacy.Domain.Common;

namespace ClinicEz.Pharmacy.Domain.Entities;

/// <summary>Rotating, hashed refresh token for facility-local sessions.</summary>
public sealed class PharmacyRefreshToken : BaseEntity
{
    public Guid StaffMemberId { get; set; }
    public PharmacyStaffMember? StaffMember { get; set; }

    public required string TenantId { get; set; }
    public Guid PharmacyId { get; set; }

    /// <summary>SHA-256 hex hash of the opaque token. The raw token is never stored.</summary>
    public required string TokenHash { get; set; }

    /// <summary>Groups every token descended from one login so a reuse can revoke the whole chain.</summary>
    public Guid FamilyId { get; set; }

    public DateTime ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public Guid? ReplacedByTokenId { get; set; }
    public string? DeviceLabel { get; set; }
}