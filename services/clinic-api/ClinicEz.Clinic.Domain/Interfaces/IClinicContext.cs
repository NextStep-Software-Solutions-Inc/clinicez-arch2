using System;
using System.Collections.Generic;

namespace ClinicEz.Clinic.Domain.Interfaces;

public interface IClinicContext
{
    string TenantId { get; }
    Guid ClinicId { get; }
    Guid? BranchId { get; }
    Guid? StaffId { get; }
    string? StaffName { get; }
    string? StaffRole { get; }
    IReadOnlyList<string> Permissions { get; }
    bool HasPermission(string permission);
}
