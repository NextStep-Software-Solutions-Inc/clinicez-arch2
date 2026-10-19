using System;
using ClinicEz.Laboratory.Domain.Enums;

namespace ClinicEz.Laboratory.Application.Features.Staff.DTOs;

public sealed record LabStaffMemberDto(
    Guid Id,
    string TenantId,
    Guid LaboratoryId,
    string FirstName,
    string LastName,
    string? MiddleName,
    string? Title,
    LabStaffRole Role,
    string? Email,
    string? PhoneNumber,
    string? PrcLicenseNumber,
    string? PtrNumber,
    string? Specialty,
    bool IsActive,
    DateTime CreatedAt);
