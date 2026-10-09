namespace ClinicEz.Patient.Application.Common.DTOs;

public sealed record RegisterDeviceSessionResponse(
    Guid SessionId,
    string DeviceId,
    string DeviceLabel,
    DateTime IssuedAt);

public sealed record DeviceSessionDto(
    Guid Id,
    string DeviceId,
    string DeviceLabel,
    DateTime CreatedAt,
    DateTime LastActiveAt);
