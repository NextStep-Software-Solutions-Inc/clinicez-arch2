using System;
using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Features.Roles.DTOs;

public sealed record ClinicRoleDto(
    Guid Id,
    string TenantId,
    Guid ClinicId,
    string Name,
    string? Description,
    bool IsSystem,
    IReadOnlyList<string> Permissions,
    int StaffCount,
    DateTime CreatedAt);
