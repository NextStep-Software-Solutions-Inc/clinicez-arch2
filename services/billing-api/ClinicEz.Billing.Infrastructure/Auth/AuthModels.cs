using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Shared.Common;

namespace ClinicEz.Billing.Infrastructure.Auth;

public sealed record LoginRequest(string TenantId, string FacilityId, string Email, string Password);

public sealed record AuthUserDto(
    Guid Id, string FullName, string Email, StaffRole Role, string TenantId, string FacilityId, IReadOnlyList<string> Permissions);

public sealed record AuthTokenDto(string AccessToken, DateTime ExpiresAtUtc, AuthUserDto User);

/// <summary>Creates a cashier / supervisor / admin for one counter (facility) of the cell.</summary>
public sealed record CreateStaffRequest(string FacilityId, FacilityType FacilityType, string Email, string FullName, string Password, StaffRole Role);

public sealed record StaffDto(
    Guid Id, string FacilityId, string Email, string FullName, StaffRole Role, bool IsActive, DateTime CreatedAtUtc, DateTime? LastLoginAtUtc);
