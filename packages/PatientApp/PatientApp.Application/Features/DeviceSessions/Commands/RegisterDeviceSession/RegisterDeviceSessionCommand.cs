using MediatR;
using PatientApp.Application.Common.DTOs;

namespace PatientApp.Application.Features.DeviceSessions.Commands.RegisterDeviceSession;

public sealed record RegisterDeviceSessionCommand(
    Guid PatientId,
    string DeviceId,
    string DeviceLabel,
    string ClerkSessionId) : IRequest<RegisterDeviceSessionResponse>;
