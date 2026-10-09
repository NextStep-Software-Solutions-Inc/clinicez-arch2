using System;
using ClinicEz.Portal.Domain.Common;

namespace ClinicEz.Portal.Domain.Entities;

/// <summary>
/// A facility's explicit share of the workspace pool limits (staff, storage, terminals). A null value means "no explicit
/// share": the facility takes an equal split of whatever the explicit shares leave over. The sum of all shares never exceeds
/// the pool; the license signed for the facility carries its share.
/// </summary>
public class FacilityAllocation : BaseEntity
{
    public Guid TenantId { get; set; }
    public Guid FacilityId { get; set; }
    public Facility Facility { get; set; } = null!;

    public int? MaxStaff { get; set; }
    public int? MaxStorageMb { get; set; }
    public int? ConcurrentTerminals { get; set; }
}
