using MediatR;

namespace PatientAppBE.Application.Features.DeviceSessions.Commands.RevokeDeviceSession;

public sealed record RevokeDeviceSessionCommand(Guid PatientId) : IRequest;
