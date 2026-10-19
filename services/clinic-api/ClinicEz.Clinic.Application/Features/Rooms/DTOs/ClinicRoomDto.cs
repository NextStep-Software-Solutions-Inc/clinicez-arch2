using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Application.Features.Rooms.DTOs;

public sealed record ClinicRoomDto(
    Guid Id,
    string TenantId,
    Guid ClinicId,
    string Name,
    string? Code,
    ClinicRoomType Type,
    string? Description,
    int DisplayOrder,
    bool IsActive,
    int AssignedStaffCount,
    DateTime CreatedAt,
    IReadOnlyList<Guid>? AssignedStaffIds = null,
    IReadOnlyList<string>? AssignedStaffNames = null);
