using ClinicEz.Shared.Exceptions;
using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Application.Features.DeviceSessions.Commands.RegisterDeviceSession;

/// <summary>
/// Registers (or refreshes) the calling device. Sessions are per device: registering a
/// second device never revokes the first, and re-registering a known device updates its
/// existing session instead of creating a new one.
/// </summary>
public sealed class RegisterDeviceSessionCommandHandler
    : IRequestHandler<RegisterDeviceSessionCommand, RegisterDeviceSessionResponse>
{
    private readonly IPatientRepository _patientRepository;
    private readonly IDeviceSessionRepository _deviceSessionRepository;
    private readonly IUnitOfWork _unitOfWork;

    public RegisterDeviceSessionCommandHandler(
        IPatientRepository patientRepository,
        IDeviceSessionRepository deviceSessionRepository,
        IUnitOfWork unitOfWork)
    {
        _patientRepository = patientRepository;
        _deviceSessionRepository = deviceSessionRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<RegisterDeviceSessionResponse> Handle(
        RegisterDeviceSessionCommand request,
        CancellationToken cancellationToken)
    {
        _ = await _patientRepository.GetByIdAsync(request.PatientId, cancellationToken)
            ?? throw new NotFoundException($"Patient '{request.PatientId}' was not found.");

        var now = DateTime.UtcNow;
        var session = await _deviceSessionRepository.GetActiveByDeviceAsync(
            request.PatientId, request.DeviceId, cancellationToken);

        if (session is null)
        {
            session = new DeviceSession
            {
                PatientId = request.PatientId,
                DeviceId = request.DeviceId,
            };
            await _deviceSessionRepository.AddAsync(session, cancellationToken);
        }

        session.DeviceLabel = request.DeviceLabel;
        session.ClerkSessionId = request.ClerkSessionId;
        session.PushToken = request.PushToken;
        session.LastActiveAt = now;

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new RegisterDeviceSessionResponse(
            session.Id,
            session.DeviceId,
            session.DeviceLabel,
            session.CreatedAt);
    }
}
