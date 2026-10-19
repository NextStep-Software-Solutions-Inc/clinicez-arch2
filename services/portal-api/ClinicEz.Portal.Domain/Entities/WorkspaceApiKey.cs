using ClinicEz.Portal.Domain.Common;
using System;

namespace ClinicEz.Portal.Domain.Entities;

/// <summary>
/// A read-only credential an external system uses to read a workspace's metadata (profile, facility list).
/// Only the SHA-256 of the key is stored; the plain key is shown once, at creation, and cannot be recovered.
/// It never grants access to a facility's own data (patients, records), which lives in the facility services.
/// </summary>
public class WorkspaceApiKey : BaseEntity
{
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;

    public string Name { get; set; } = string.Empty;

    /// <summary>First characters of the key, so a key can be recognised in the list without revealing it.</summary>
    public string KeyPrefix { get; set; } = string.Empty;

    /// <summary>Hex SHA-256 of the full key.</summary>
    public string KeyHash { get; set; } = string.Empty;

    /// <summary>Comma separated scopes, e.g. "workspace:read,facilities:read".</summary>
    public string Scopes { get; set; } = string.Empty;

    public string CreatedByName { get; set; } = string.Empty;

    public DateTime? LastUsedAt { get; set; }

    /// <summary>Set when revoked. A revoked key stays listed (for the record) but can never authenticate.</summary>
    public DateTime? RevokedAt { get; set; }
}
