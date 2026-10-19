using MediatR;

namespace ClinicEz.Patient.Application.Features.DeviceSessions.Commands.RevokeAllDeviceSessions;

public sealed record RevokeAllDeviceSessionsCommand(Guid PatientId) : IRequest;
