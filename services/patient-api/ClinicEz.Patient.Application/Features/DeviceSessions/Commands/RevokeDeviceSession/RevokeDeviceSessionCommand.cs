using MediatR;

namespace ClinicEz.Patient.Application.Features.DeviceSessions.Commands.RevokeDeviceSession;

public sealed record RevokeDeviceSessionCommand(Guid PatientId, Guid SessionId) : IRequest;
