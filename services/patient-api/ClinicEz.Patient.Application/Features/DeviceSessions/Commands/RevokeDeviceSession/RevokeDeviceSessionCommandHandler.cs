using ClinicEz.Shared.Interfaces;
using MediatR;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Application.Features.DeviceSessions.Commands.RevokeDeviceSession;

public sealed class RevokeDeviceSessionCommandHandler : IRequestHandler<RevokeDeviceSessionCommand>
{
    private readonly IDeviceSessionRepository _deviceSessionRepository;
    private readonly ISessionService _sessionService;
    private readonly ICurrentUserService _currentUserService;
    private readonly ISyncNotificationService _notificationService;
    private readonly IUnitOfWork _unitOfWork;

    public RevokeDeviceSessionCommandHandler(
        IDeviceSessionRepository deviceSessionRepository,
        ISessionService sessionService,
        ICurrentUserService currentUserService,
        ISyncNotificationService notificationService,
        IUnitOfWork unitOfWork)
    {
        _deviceSessionRepository = deviceSessionRepository;
        _sessionService = sessionService;
        _currentUserService = currentUserService;
        _notificationService = notificationService;
        _unitOfWork = unitOfWork;
    }

    public async Task Handle(RevokeDeviceSessionCommand request, CancellationToken cancellationToken)
    {
        var actor = _currentUserService.UserId ?? "system";

        await _deviceSessionRepository.RevokeAllForPatientAsync(request.PatientId, actor, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // Remove Redis entry — subsequent JWT checks will be denied
        await _sessionService.RevokeSessionAsync(request.PatientId, cancellationToken);

        // Force-disconnect any remaining SignalR connections for this patient
        await _notificationService.NotifySessionRevokedAsync(
            request.PatientId,
            "Your session has been revoked.",
            cancellationToken);
    }
}

