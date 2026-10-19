using System;
using System.Collections.Generic;
using ClinicEz.Laboratory.Domain.Enums;

namespace ClinicEz.Laboratory.Infrastructure.Auth;

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
    NotFound
}

public sealed record AuthUserDto(
    Guid Id,
    string Name,
    string Role,
    string? RoleName,
    Guid LaboratoryId,
    string TenantId,
    string LaboratoryName,
    IReadOnlyList<string> Permissions,
    bool MustChangePassword);

public sealed record AuthTokensDto(
    string AccessToken,
    string RefreshToken,
    DateTime AccessTokenExpiresAtUtc,
    DateTime RefreshTokenExpiresAtUtc,
    AuthUserDto User);

public sealed record AuthOutcome(
    bool Ok,
    AuthTokensDto? Tokens,
    AuthFailure Failure,
    string? Message,
    IReadOnlyList<string>? Errors = null)
{
    public static AuthOutcome Success(AuthTokensDto tokens) => new(true, tokens, AuthFailure.None, null);

    public static AuthOutcome Fail(AuthFailure failure, string message, IReadOnlyList<string>? errors = null) =>
        new(false, null, failure, message, errors);
}

public sealed record AuthStatusDto(
    bool WorkspaceFound,
    LabLicenseStatus? LicenseStatus,
    bool RequiresBootstrap,
    string? LaboratoryName);

public sealed record LoginRequest(string? Workspace, string? Email, string? Password, string? DeviceLabel);

public sealed record RefreshRequest(string? RefreshToken);

public sealed record BootstrapRequest(string? Workspace, string? LicenseToken, string? Email, string? Password, string? FullName);

public sealed record ChangePasswordRequest(string? CurrentPassword, string? NewPassword);

public sealed record SetCredentialsRequest(string? TemporaryPassword);
