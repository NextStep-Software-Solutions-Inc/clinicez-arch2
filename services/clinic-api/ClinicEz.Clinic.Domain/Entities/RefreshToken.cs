using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

/// <summary>Rotating, hashed refresh token for facility-local sessions.</summary>
public sealed class RefreshToken : ClinicScopedEntity
{
    public Guid StaffMemberId { get; set; }
    public StaffMember? StaffMember { get; set; }

    /// <summary>SHA-256 hex hash of the opaque token. The raw token is never stored.</summary>
    public required string TokenHash { get; set; }

    /// <summary>Groups every token descended from one login so a reuse can revoke the whole chain.</summary>
    public Guid FamilyId { get; set; }

    public DateTime ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public Guid? ReplacedByTokenId { get; set; }
    public string? DeviceLabel { get; set; }
}
