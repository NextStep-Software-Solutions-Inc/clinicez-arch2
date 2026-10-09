using MediatR;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Application.Features.DeviceSessions.Commands.RevokeAllDeviceSessions;

/// <summary>Signs the patient out of every device ("sign out everywhere").</summary>
public sealed class RevokeAllDeviceSessionsCommandHandler : IRequestHandler<RevokeAllDeviceSessionsCommand>
{
    private readonly IDeviceSessionRepository _deviceSessionRepository;
    private readonly ISyncNotificationService _notificationService;
    private readonly IUnitOfWork _unitOfWork;

    public RevokeAllDeviceSessionsCommandHandler(
        IDeviceSessionRepository deviceSessionRepository,
        ISyncNotificationService notificationService,
        IUnitOfWork unitOfWork)
    {
        _deviceSessionRepository = deviceSessionRepository;
        _notificationService = notificationService;
        _unitOfWork = unitOfWork;
    }

    public async Task Handle(RevokeAllDeviceSessionsCommand request, CancellationToken cancellationToken)
    {
        await _deviceSessionRepository.RevokeAllForPatientAsync(request.PatientId, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _notificationService.NotifySessionRevokedAsync(
            request.PatientId,
            "You have been signed out of all devices.",
            cancellationToken: cancellationToken);
    }
}
