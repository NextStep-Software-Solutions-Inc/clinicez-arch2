using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class Role : ClinicScopedEntity
{
    public required string Name { get; set; }
    public string? Description { get; set; }
    public bool IsSystem { get; set; } = false;
    public List<string> Permissions { get; set; } = new();

    public ICollection<StaffMember> StaffMembers { get; set; } = new List<StaffMember>();
}
