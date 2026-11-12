using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Queue.DTOs;
using ClinicEz.Clinic.Application.Features.Queue.Services;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Queue.Commands;

public sealed record EscalateVitalsToConsultationCommand(
    Guid QueueItemId,
    QueuePriority Priority = QueuePriority.Emergency,
    string? EscalationReason = null,
    Guid? DoctorId = null,
    string? DoctorName = null,
    Guid? RoomId = null,
    string? RoomOrStation = null) : IRequest<QueueItemDto>;

public sealed class EscalateVitalsToConsultationCommandValidator : AbstractValidator<EscalateVitalsToConsultationCommand>
{
    public EscalateVitalsToConsultationCommandValidator()
    {
        RuleFor(x => x.QueueItemId).NotEmpty();
        RuleFor(x => x.Priority).IsInEnum();
        RuleFor(x => x.EscalationReason).MaximumLength(1000);
    }
}

public sealed class EscalateVitalsToConsultationCommandHandler : IRequestHandler<EscalateVitalsToConsultationCommand, QueueItemDto>
{
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<PatientVitals>? _vitalsRepository;
    private readonly IQueueNotificationDispatcher? _notificationDispatcher;

    public EscalateVitalsToConsultationCommandHandler(
        IRepository<QueueItem> queueRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IRepository<PatientVitals>? vitalsRepository = null,
        IQueueNotificationDispatcher? notificationDispatcher = null)
    {
        _queueRepository = queueRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _vitalsRepository = vitalsRepository;
        _notificationDispatcher = notificationDispatcher;
    }

    public async Task<QueueItemDto> Handle(EscalateVitalsToConsultationCommand request, CancellationToken cancellationToken)
    {
        var queueItem = await _queueRepository
            .Query(q => q.Id == request.QueueItemId && q.ClinicId == _clinicContext.ClinicId)
            .Include(q => q.PatientVitals)
            .FirstOrDefaultAsync(cancellationToken);

        if (queueItem == null)
        {
            throw new NotFoundException($"Queue item '{request.QueueItemId}' was not found in this clinic.");
        }

        if (queueItem.Status is QueueStatus.Cancelled or QueueStatus.NoShow or QueueStatus.Diverted
            || (queueItem.Status == QueueStatus.Completed && queueItem.VisitType.IsPhysicianConsultation()))
        {
            throw new BadRequestException($"Cannot escalate a visit that is already closed with status '{queueItem.Status}'.");
        }

        var now = DateTime.UtcNow;
        var staffActor = _clinicContext.StaffId?.ToString() ?? "Nurse";
        var hasCompletedTriage = queueItem.Status == QueueStatus.Triaged || queueItem.PatientVitals != null;

        queueItem.VisitType = request.Priority is QueuePriority.Emergency or QueuePriority.Urgent
            ? VisitType.UrgentCareVisit
            : VisitType.AcuteIllnessConsultation;
        queueItem.Priority = request.Priority;

        if (request.DoctorId.HasValue)
        {
            queueItem.DoctorId = request.DoctorId.Value;
        }

        if (!string.IsNullOrWhiteSpace(request.DoctorName))
        {
            queueItem.DoctorName = request.DoctorName.Trim();
        }

        if (request.RoomId.HasValue)
        {
            queueItem.RoomId = request.RoomId.Value;
        }

        if (!string.IsNullOrWhiteSpace(request.RoomOrStation))
        {
            queueItem.RoomOrStation = request.RoomOrStation.Trim();
        }

        queueItem.CompletedTime = null;
        queueItem.DischargedAt = null;
        queueItem.DischargedByStaffId = null;
        queueItem.DischargeNotes = null;
        queueItem.Status = hasCompletedTriage ? QueueStatus.Triaged : QueueStatus.Waiting;
        queueItem.UpdatedAt = now;
        queueItem.UpdatedBy = staffActor;

        if (!string.IsNullOrWhiteSpace(request.EscalationReason))
        {
            var reason = request.EscalationReason.Trim();
            if (queueItem.PatientVitals != null)
            {
                queueItem.PatientVitals.TriageAcuityReason = reason;
                queueItem.PatientVitals.PreAssessmentNotes = string.IsNullOrWhiteSpace(queueItem.PatientVitals.PreAssessmentNotes)
                    ? $"Escalated to Doctor Consultation ({request.Priority}): {reason}"
                    : $"{queueItem.PatientVitals.PreAssessmentNotes} | Escalated ({request.Priority}): {reason}";
                queueItem.PatientVitals.UpdatedAt = now;
                queueItem.PatientVitals.UpdatedBy = staffActor;
                _vitalsRepository?.Update(queueItem.PatientVitals);
            }
            else if (string.IsNullOrWhiteSpace(queueItem.ChiefComplaint))
            {
                queueItem.ChiefComplaint = reason;
            }
        }

        _queueRepository.Update(queueItem);

        if (_notificationDispatcher != null)
        {
            await _notificationDispatcher.EvaluateAndDispatchApproachingAlertsAsync(queueItem.ClinicId, queueItem.QueueDate, cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return queueItem.ToDto();
    }
}
