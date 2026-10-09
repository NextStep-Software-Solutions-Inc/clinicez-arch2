namespace ClinicEz.Portal.Domain.Entities;

using ClinicEz.Portal.Domain.Common;
using System;

/// <summary>
/// A member's staff profile at a facility: which facility they work at and their job role there
/// ("Doctor", "Nurse", "Receptionist", ...). Workspace access lives in <see cref="WorkspaceMember"/>.
/// </summary>
public class StaffMember : BaseEntity
{
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;

    public Guid WorkspaceMemberId { get; set; }
    public WorkspaceMember WorkspaceMember { get; set; } = null!;

    public Guid? FacilityId { get; set; }
    public Facility? Facility { get; set; }

    public string Role { get; set; } = "Staff";
}
