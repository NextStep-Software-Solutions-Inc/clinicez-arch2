using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.DTOs;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Queue.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Queue.Commands;

public sealed record CheckInPatientCommand(
    Guid PatientId,
    string PatientName,
    Guid? AppointmentId = null,
    Guid? DoctorId = null,
    string? DoctorName = null,
    QueuePriority Priority = QueuePriority.Routine,
    string? ChiefComplaint = null) : IRequest<QueueItemDto>;

public sealed class CheckInPatientCommandValidator : AbstractValidator<CheckInPatientCommand>
{
    public CheckInPatientCommandValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
        RuleFor(x => x.PatientName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.Priority).IsInEnum();
    }
}

public sealed class CheckInPatientCommandHandler : IRequestHandler<CheckInPatientCommand, QueueItemDto>
{
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IRepository<Appointment> _appointmentRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IPatientWebhookNotifier _webhookNotifier;

    public CheckInPatientCommandHandler(
        IRepository<QueueItem> queueRepository,
        IRepository<Appointment> appointmentRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IPatientWebhookNotifier webhookNotifier)
    {
        _queueRepository = queueRepository;
        _appointmentRepository = appointmentRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _webhookNotifier = webhookNotifier;
    }

    public async Task<QueueItemDto> Handle(CheckInPatientCommand request, CancellationToken cancellationToken)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Sequence number generation for today in this clinic
        var lastSequence = await _queueRepository.Query(q => 
            q.ClinicId == _clinicContext.ClinicId && 
            q.QueueDate == today)
            .MaxAsync(q => (int?)q.SequenceNumber, cancellationToken) ?? 0;

        var nextSequence = lastSequence + 1;
        var queueNumber = $"Q-{nextSequence:D3}";

        Appointment? appointment = null;
        if (request.AppointmentId.HasValue)
        {
            appointment = await _appointmentRepository.Query(a => 
                a.Id == request.AppointmentId.Value && 
                a.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(cancellationToken);

            if (appointment != null)
            {
                appointment.Status = AppointmentStatus.CheckedIn;
                appointment.UpdatedAt = DateTime.UtcNow;
                _appointmentRepository.Update(appointment);
            }
        }

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            QueueNumber = queueNumber,
            SequenceNumber = nextSequence,
            QueueDate = today,
            PatientId = request.PatientId,
            PatientName = request.PatientName.Trim(),
            AppointmentId = request.AppointmentId,
            DoctorId = request.DoctorId,
            DoctorName = request.DoctorName ?? appointment?.DoctorName,
            Priority = request.Priority,
            Status = QueueStatus.Waiting,
            CheckInTime = DateTime.UtcNow,
            ChiefComplaint = request.ChiefComplaint ?? appointment?.Reason,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = _clinicContext.StaffId?.ToString() ?? "FrontDesk"
        };

        await _queueRepository.AddAsync(queueItem, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // Outbound notification pushing back to patient-api webhook for patient app synchronization
        var apptId = appointment?.Id ?? queueItem.Id;
        var scheduledAtStr = (appointment?.ScheduledAt ?? DateTime.UtcNow).ToString("O");
        var pushPayload = new ClinicPushAppointmentsPayload(
            _clinicContext.ClinicId,
            request.PatientId,
            new List<ClinicAppointmentWebhookDto>
            {
                new(
                    apptId.ToString(),
                    _clinicContext.ClinicId.ToString(),
                    "Clinic Operational Facility",
                    new ClinicProviderSnapshotDto(
                        (request.DoctorId ?? Guid.Empty).ToString(),
                        request.DoctorName ?? appointment?.DoctorName ?? "Attending Physician",
                        null,
                        null
                    ),
                    appointment?.ServiceType ?? "Consultation",
                    scheduledAtStr,
                    appointment?.DurationMinutes ?? 30,
                    AppointmentStatus.CheckedIn.ToString(),
                    $"Checked in at {queueItem.CheckInTime:HH:mm} (Queue {queueItem.QueueNumber})",
                    appointment?.DoctorName ?? "Consultation",
                    queueItem.ChiefComplaint
                )
            }
        );

        // Dispatch webhook in background / async
        _ = _webhookNotifier.PushAppointmentUpdateAsync(pushPayload, CancellationToken.None);

        return new QueueItemDto(
            queueItem.Id,
            queueItem.TenantId,
            queueItem.ClinicId,
            queueItem.QueueNumber,
            queueItem.SequenceNumber,
            queueItem.QueueDate,
            queueItem.PatientId,
            queueItem.PatientName,
            queueItem.AppointmentId,
            queueItem.DoctorId,
            queueItem.DoctorName,
            queueItem.Priority,
            queueItem.Status,
            queueItem.CheckInTime,
            queueItem.CalledTime,
            queueItem.CompletedTime,
            queueItem.ChiefComplaint,
            false,
            null);
    }
}
