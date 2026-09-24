using System;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Application.Features.Staff.DTOs;

public sealed record StaffMemberDto(
    Guid Id,
    string TenantId,
    Guid ClinicId,
    Guid? ClinicRoleId,
    string? RoleName,
    string FirstName,
    string LastName,
    string? MiddleName,
    string? Title,
    StaffRole Role,
    string? Email,
    string? PhoneNumber,
    string? PrcLicenseNumber,
    string? PtrNumber,
    string? S2LicenseNumber,
    string? Specialty,
    bool IsActive,
    DateTime CreatedAt);
