using System;
using ClinicEz.Portal.Domain.Common;

namespace ClinicEz.Portal.Domain.Entities;

public enum EntitlementKind
{
    /// <summary>A numeric ceiling (<see cref="PlanEntitlement.Limit"/>).</summary>
    Limit,

    /// <summary>An on/off capability (<see cref="PlanEntitlement.Enabled"/>).</summary>
    Feature
}

/// <summary>One limit or feature granted by a <see cref="Plan"/>, keyed like <c>limit.clinics</c> or <c>feature.cross_tenant_interop</c>.</summary>
public class PlanEntitlement : BaseEntity
{
    public Guid PlanId { get; set; }
    public Plan? Plan { get; set; }

    public string Key { get; set; } = string.Empty;
    public EntitlementKind Kind { get; set; }
    public long? Limit { get; set; }
    public bool? Enabled { get; set; }
}

/// <summary>A per-workspace exception to its plan (a sales deal, a support grant). Wins over the plan's value.</summary>
public class EntitlementOverride : BaseEntity
{
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;

    public string Key { get; set; } = string.Empty;
    public EntitlementKind Kind { get; set; }
    public long? Limit { get; set; }
    public bool? Enabled { get; set; }
    public string? Reason { get; set; }
}
