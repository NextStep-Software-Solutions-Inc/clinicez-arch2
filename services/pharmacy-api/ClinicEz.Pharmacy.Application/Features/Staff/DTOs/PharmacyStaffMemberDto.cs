using System;
using ClinicEz.Pharmacy.Domain.Enums;

namespace ClinicEz.Pharmacy.Application.Features.Staff.DTOs;

public sealed record PharmacyStaffMemberDto(
    Guid Id,
    string TenantId,
    Guid PharmacyId,
    string FirstName,
    string LastName,
    string? MiddleName,
    string? Title,
    PharmacyStaffRole Role,
    string? Email,
    string? PhoneNumber,
    string? PrcLicenseNumber,
    string? S2LicenseNumber,
    bool IsActive,
    DateTime CreatedAt);
