using MediatR;
using PatientAppBE.Application.Common.DTOs;

namespace PatientAppBE.Application.Features.DeviceSessions.Commands.RegisterDeviceSession;

public sealed record RegisterDeviceSessionCommand(
    Guid PatientId,
    string DeviceId,
    string DeviceLabel,
    string ClerkSessionId,
    string? PushToken) : IRequest<RegisterDeviceSessionResponse>;
