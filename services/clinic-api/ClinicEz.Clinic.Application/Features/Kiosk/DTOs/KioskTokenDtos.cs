using System;

namespace ClinicEz.Clinic.Application.Features.Kiosk.DTOs;

public sealed record MintKioskTokenRequest(string? DeviceLabel = null, int? ExpiryDays = null);

public sealed record MintKioskTokenResultDto(
    string Token,
    DateTime ExpiresAtUtc,
    int TokenVersion,
    Guid ClinicId,
    string DeviceLabel
);

public sealed record RevokeKioskTokenRequest(string? Reason = null);

public sealed record RevokeKioskTokenResultDto(
    Guid ClinicId,
    int PreviousVersion,
    int NewVersion,
    bool IsKioskIntakeEnabled,
    string Message
);

public sealed record KioskTokenStatusDto(
    Guid ClinicId,
    bool IsKioskIntakeEnabled,
    int CurrentTokenVersion
);
