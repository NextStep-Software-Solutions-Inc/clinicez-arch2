using System;
using ClinicEz.Laboratory.Domain.Common;

namespace ClinicEz.Laboratory.Domain.Entities;

/// <summary>Rotating, hashed refresh token for facility-local laboratory sessions.</summary>
public sealed class LabRefreshToken : BaseEntity, ILabScopedEntity
{
    public Guid StaffMemberId { get; set; }
    public LabStaffMember? StaffMember { get; set; }

    public required string TenantId { get; set; }
    public Guid LaboratoryId { get; set; }

    /// <summary>SHA-256 hex hash of the opaque token. The raw token is never stored.</summary>
    public required string TokenHash { get; set; }

    /// <summary>Groups every token descended from one login so a reuse can revoke the whole chain.</summary>
    public Guid FamilyId { get; set; }

    public DateTime ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public Guid? ReplacedByTokenId { get; set; }
    public string? DeviceLabel { get; set; }
}
