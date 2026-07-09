using Clinic EZ.Shared.Exceptions;
using MediatR;
using PatientAppBE.Application.Common.DTOs;
using PatientAppBE.Application.Common.Interfaces;
using PatientAppBE.Domain.Entities;
using PatientAppBE.Domain.Interfaces;

namespace PatientAppBE.Application.Features.DeviceSessions.Commands.RegisterDeviceSession;

public sealed class RegisterDeviceSessionCommandHandler
    : IRequestHandler<RegisterDeviceSessionCommand, RegisterDeviceSessionResponse>
{
    private readonly IPatientRepository _patientRepository;
    private readonly IDeviceSessionRepository _deviceSessionRepository;
    private readonly ISessionService _sessionService;
    private readonly ISyncNotificationService _notificationService;
    private readonly IUnitOfWork _unitOfWork;

    private static readonly TimeSpan SessionTtl = TimeSpan.FromDays(30);

    public RegisterDeviceSessionCommandHandler(
        IPatientRepository patientRepository,
        IDeviceSessionRepository deviceSessionRepository,
        ISessionService sessionService,
        ISyncNotificationService notificationService,
        IUnitOfWork unitOfWork)
    {
        _patientRepository = patientRepository;
        _deviceSessionRepository = deviceSessionRepository;
        _sessionService = sessionService;
        _notificationService = notificationService;
        _unitOfWork = unitOfWork;
    }

    public async Task<RegisterDeviceSessionResponse> Handle(
        RegisterDeviceSessionCommand request,
        CancellationToken cancellationToken)
    {
        _ = await _patientRepository.GetByIdAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        // Notify old device before revoking so it can cleanly handle forced logout
        var activeSession = await _deviceSessionRepository.GetActiveByPatientIdAsync(request.PatientId, cancellationToken);
        if (activeSession is not null && activeSession.DeviceId != request.DeviceId)
        {
            await _notificationService.NotifySessionRevokedAsync(
                request.PatientId,
                "A new device has signed in to your account. This session has been revoked.",
                cancellationToken);
        }

        // Revoke all existing sessions (single-device enforcement)
        await _deviceSessionRepository.RevokeAllForPatientAsync(
            request.PatientId, request.ClerkSessionId, cancellationToken);

        var redisKey = $"patientapp:session:{request.PatientId}";

        var session = new DeviceSession
        {
            PatientId = request.PatientId,
            DeviceId = request.DeviceId,
            DeviceLabel = request.DeviceLabel,
            ClerkSessionId = request.ClerkSessionId,
            RedisKey = redisKey,
            PushToken = request.PushToken,
            LastActiveAt = DateTime.UtcNow,
            IsRevoked = false,
        };

        await _deviceSessionRepository.AddAsync(session, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // Register in Redis for fast validation on every subsequent request
        await _sessionService.SetSessionAsync(
            request.PatientId, request.DeviceId, request.DeviceLabel,
            request.ClerkSessionId, SessionTtl, cancellationToken);

        return new RegisterDeviceSessionResponse(session.Id, session.DeviceId, session.DeviceLabel, DateTime.UtcNow);
    }
}

