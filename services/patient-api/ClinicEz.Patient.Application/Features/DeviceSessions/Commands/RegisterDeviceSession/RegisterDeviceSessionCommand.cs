using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;

namespace ClinicEz.Patient.Application.Features.DeviceSessions.Commands.RegisterDeviceSession;

public sealed record RegisterDeviceSessionCommand(
    Guid PatientId,
    string DeviceId,
    string DeviceLabel,
    string ClerkSessionId,
    string? PushToken) : IRequest<RegisterDeviceSessionResponse>;
