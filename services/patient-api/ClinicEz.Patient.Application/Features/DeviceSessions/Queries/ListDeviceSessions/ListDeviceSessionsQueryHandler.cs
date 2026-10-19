using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Application.Features.DeviceSessions.Queries.ListDeviceSessions;

public sealed class ListDeviceSessionsQueryHandler
    : IRequestHandler<ListDeviceSessionsQuery, IReadOnlyList<DeviceSessionDto>>
{
    private readonly IDeviceSessionRepository _deviceSessionRepository;

    public ListDeviceSessionsQueryHandler(IDeviceSessionRepository deviceSessionRepository)
        => _deviceSessionRepository = deviceSessionRepository;

    public async Task<IReadOnlyList<DeviceSessionDto>> Handle(
        ListDeviceSessionsQuery request,
        CancellationToken cancellationToken)
    {
        var sessions = await _deviceSessionRepository.GetActiveByPatientIdAsync(request.PatientId, cancellationToken);

        return sessions
            .Select(s => new DeviceSessionDto(s.Id, s.DeviceId, s.DeviceLabel, s.CreatedAt, s.LastActiveAt))
            .ToList();
    }
}
