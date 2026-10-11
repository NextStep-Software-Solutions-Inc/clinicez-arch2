using ClinicEz.Shared.Exceptions;
using MediatR;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Application.Features.DeviceSessions.Commands.RevokeDeviceSession;

/// <summary>Revokes a single device session of a patient, leaving the patient's other devices signed in.</summary>
public sealed class RevokeDeviceSessionCommandHandler : IRequestHandler<RevokeDeviceSessionCommand>
{
    private readonly IDeviceSessionRepository _deviceSessionRepository;
    private readonly ISyncNotificationService _notificationService;
    private readonly IUnitOfWork _unitOfWork;

    public RevokeDeviceSessionCommandHandler(
        IDeviceSessionRepository deviceSessionRepository,
        ISyncNotificationService notificationService,
        IUnitOfWork unitOfWork)
    {
        _deviceSessionRepository = deviceSessionRepository;
        _notificationService = notificationService;
        _unitOfWork = unitOfWork;
    }

    public async Task Handle(RevokeDeviceSessionCommand request, CancellationToken cancellationToken)
    {
        var session = await _deviceSessionRepository.GetActiveByIdAsync(
                request.PatientId, request.SessionId, cancellationToken)
            ?? throw new NotFoundException($"Device session '{request.SessionId}' was not found.");

        session.Revoke(DateTime.UtcNow);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _notificationService.NotifySessionRevokedAsync(
            request.PatientId,
            "This device has been signed out from another device.",
            session.DeviceId,
            cancellationToken);
    }
}
