using System;
using System.Collections.Generic;

namespace ClinicEz.Clinic.Infrastructure.Auth;

public enum AuthFailure
{
    None = 0,
    InvalidCredentials,
    AccountLocked,
    WorkspaceNotFound,
    ActivationRequired,
    LicenseTampered,
    InvalidToken,
    WeakPassword,
    AlreadyBootstrapped,
    InvalidRequest,
    NotFound,
    SessionLocked
}

public sealed record SessionPolicyDto(
    int IdleLockMinutes,
    int MaxLockedSessionHours,
    bool AllowStaffPinUnlock);

public sealed record LockedSessionDto(
    Guid StaffId,
    string Name,
    string? Email,
    string Role,
    string? RoleName,
    string ClinicName,
    bool HasQuickUnlockPin,
    bool AllowStaffPinUnlock,
    DateTime LockedAtUtc,
    DateTime LockExpiresAtUtc);

public sealed record AuthUserDto(
    Guid Id,
    string Name,
    string Role,
    string? RoleName,
    Guid ClinicId,
    string TenantId,
    string ClinicName,
    IReadOnlyList<string> Permissions,
    bool MustChangePassword,
    string? Email = null,
    bool HasQuickUnlockPin = false,
    SessionPolicyDto? SessionPolicy = null);

public sealed record AuthTokensDto(
    string AccessToken,
    string? RefreshToken,
    DateTime AccessTokenExpiresAtUtc,
    DateTime RefreshTokenExpiresAtUtc,
    AuthUserDto User);

public sealed record AuthOutcome(
    bool Ok,
    AuthTokensDto? Tokens,
    AuthFailure Failure,
    string? Message,
    IReadOnlyList<string>? Errors = null,
    LockedSessionDto? LockedSession = null)
{
    public static AuthOutcome Success(AuthTokensDto tokens) => new(true, tokens, AuthFailure.None, null);

    public static AuthOutcome Locked(LockedSessionDto lockedSession, string? message = null) =>
        new(false, null, AuthFailure.SessionLocked, message ?? "Workstation is locked.", null, lockedSession);

    public static AuthOutcome Fail(AuthFailure failure, string message, IReadOnlyList<string>? errors = null) =>
        new(false, null, failure, message, errors);
}

public sealed record AuthStatusDto(
    bool WorkspaceFound,
    string LicenseStatus,
    bool RequiresBootstrap,
    string? ClinicName);

public sealed record LoginRequest(
    string? Workspace,
    string? Email,
    string? Password,
    string? DeviceLabel);

public sealed record RefreshRequest(string? RefreshToken);

public sealed record UnlockPinRequest(string? Pin, string? RefreshToken = null);

public sealed record UnlockPasswordRequest(string? Password, string? RefreshToken = null);

public sealed record SetQuickUnlockPinRequest(string? CurrentPassword, string? Pin);

public sealed record RemoveQuickUnlockPinRequest(string? CurrentPassword);

public sealed record BootstrapRequest(string? Workspace, string? LicenseToken, string? Email, string? Password, string? FullName);

public sealed record ChangePasswordRequest(string? CurrentPassword, string? NewPassword);

public sealed record SetCredentialsRequest(string? TemporaryPassword);

public sealed record RecoverAdminRequest(
    string? Workspace,
    string? LicenseToken,
    string? Email,
    string? NewPassword,
    string? DeviceLabel = null);
