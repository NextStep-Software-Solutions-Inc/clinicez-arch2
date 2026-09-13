using MainPortalBE.Domain.Common;
using CLINICEZ.Shared.Common;
using System;
using System.Text.Json.Serialization;

namespace MainPortalBE.Domain.Entities;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum FacilityStatus
{
    Provisioning,
    Active,
    Suspended,
    Failed
}

public class Facility : BaseEntity
{
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public string Name { get; set; } = string.Empty;
    public FacilityType FacilityType { get; set; }
    public FacilityStatus Status { get; set; } = FacilityStatus.Provisioning;
}
