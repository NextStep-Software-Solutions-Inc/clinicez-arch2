using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;

namespace ClinicEz.Patient.Application.Features.DeviceSessions.Queries.ListDeviceSessions;

public sealed record ListDeviceSessionsQuery(Guid PatientId) : IRequest<IReadOnlyList<DeviceSessionDto>>;
