using MediatR;

namespace PatientApp.Application.Features.DeviceSessions.Commands.RevokeDeviceSession;

public sealed record RevokeDeviceSessionCommand(Guid PatientId) : IRequest;
