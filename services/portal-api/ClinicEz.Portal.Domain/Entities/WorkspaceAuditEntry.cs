using ClinicEz.Portal.Domain.Common;
using System;

namespace ClinicEz.Portal.Domain.Entities;

/// <summary>
/// Append-only record of a change made to a workspace's settings.
/// There is intentionally no update or delete path. Secrets must never be written to <see cref="ChangesJson"/>.
/// </summary>
public class WorkspaceAuditEntry : BaseEntity
{
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;

    public string ActorUserId { get; set; } = string.Empty;
    public string ActorName { get; set; } = string.Empty;
    public string ActorRole { get; set; } = string.Empty;

    /// <summary>Settings section, e.g. "general", "branding", "security".</summary>
    public string Section { get; set; } = string.Empty;

    /// <summary>What happened, e.g. "updated".</summary>
    public string Action { get; set; } = string.Empty;

    /// <summary>JSON object of changed field name to { old, new }.</summary>
    public string ChangesJson { get; set; } = "{}";
}
