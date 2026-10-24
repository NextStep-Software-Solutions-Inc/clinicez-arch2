using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.DTOs;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Common.Helpers;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Queue.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Workspace;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

using System.Text.Json.Serialization;

namespace ClinicEz.Clinic.Application.Features.Queue.Commands;

[method: JsonConstructor]
public sealed record CheckInPatientCommand(
    Guid PatientId,
    string PatientName,
    Guid? AppointmentId = null,
    Guid? DoctorId = null,
    string? DoctorName = null,
    QueuePriority Priority = QueuePriority.Routine,
    string? ChiefComplaint = null,
    string? RoomOrStation = null,
    Guid? RoomId = null,
    DateOnly? QueueDate = null,
    VisitType VisitType = VisitType.Consultation) : IRequest<QueueItemDto>;

public sealed class CheckInPatientCommandValidator : AbstractValidator<CheckInPatientCommand>
{
    public CheckInPatientCommandValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
        RuleFor(x => x.PatientName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.Priority).IsInEnum();
        RuleFor(x => x.VisitType).IsInEnum();
        RuleFor(x => x.ChiefComplaint)
            .MaximumLength(255)
            .WithMessage("Chief complaint must not exceed 255 characters.");
    }
}

public sealed class CheckInPatientCommandHandler : IRequestHandler<CheckInPatientCommand, QueueItemDto>
{
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IRepository<Appointment> _appointmentRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IClinicIdentityProvider _clinicIdentity;
    private readonly IPatientAppointmentPublisher _appointmentPublisher;
    private readonly IRepository<ClinicRoom>? _roomRepository;
    private readonly IRepository<StaffMember>? _staffRepository;
    private readonly IWorkspaceProfileProvider? _workspaceProfiles;
    private readonly IRepository<ClinicSettings>? _settingsRepository;

    public CheckInPatientCommandHandler(
        IRepository<QueueItem> queueRepository,
        IRepository<Appointment> appointmentRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IClinicIdentityProvider clinicIdentity,
        IPatientAppointmentPublisher appointmentPublisher,
        IRepository<ClinicRoom>? roomRepository = null,
        IRepository<StaffMember>? staffRepository = null,
        IWorkspaceProfileProvider? workspaceProfiles = null,
        IRepository<ClinicSettings>? settingsRepository = null)
    {
        _queueRepository = queueRepository;
        _appointmentRepository = appointmentRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _clinicIdentity = clinicIdentity;
        _appointmentPublisher = appointmentPublisher;
        _roomRepository = roomRepository;
        _staffRepository = staffRepository;
        _workspaceProfiles = workspaceProfiles;
        _settingsRepository = settingsRepository;
    }

    public async Task<QueueItemDto> Handle(CheckInPatientCommand request, CancellationToken cancellationToken)
    {
        var today = request.QueueDate
            ?? await ClinicTimeZoneResolver.ResolveTodayAsync(_workspaceProfiles, _clinicContext.TenantId, cancellationToken, _settingsRepository);

        // Enforce active queue day uniqueness: prevent duplicate active tickets today.
        // Terminal tickets (Completed, Cancelled, NoShow, DischargedNonDoctor, Diverted) do not conflict.
        // Non-consultation visits (e.g. retail purchase, cashier settlement, vitals check) do not conflict.
        if (request.VisitType == VisitType.Consultation)
        {
            QueueStatus[] activeStatuses =
            [
                QueueStatus.Waiting,
                QueueStatus.Triaged,
                QueueStatus.InConsultation,
                QueueStatus.PendingProcedure,
                QueueStatus.ReEvaluation,
                QueueStatus.OnHold
            ];

            var activeTicket = await _queueRepository.Query(q =>
                q.ClinicId == _clinicContext.ClinicId &&
                q.QueueDate == today &&
                q.PatientId == request.PatientId &&
                q.VisitType == VisitType.Consultation &&
                activeStatuses.Contains(q.Status))
                .OrderByDescending(q => q.CheckInTime)
                .FirstOrDefaultAsync(cancellationToken);

            if (activeTicket != null)
            {
                throw new ActiveQueueTicketConflictException(
                    activeTicket.Id,
                    activeTicket.QueueNumber,
                    activeTicket.Status,
                    activeTicket.PatientName);
            }
        }

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

        var rawComplaint = !string.IsNullOrWhiteSpace(request.ChiefComplaint)
            ? request.ChiefComplaint
            : appointment?.Reason;

        var sanitizedComplaint = SanitizeChiefComplaint(rawComplaint);

        var resolvedDoctorId = request.DoctorId ?? appointment?.DoctorId;
        var resolvedDoctorName = request.DoctorName ?? appointment?.DoctorName;
        Guid? resolvedRoomId = request.RoomId;
        string? resolvedRoomOrStation = request.RoomOrStation?.Trim();

        if (resolvedRoomId.HasValue && _roomRepository != null)
        {
            var room = await _roomRepository
                .Query(r => r.Id == resolvedRoomId.Value && r.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(cancellationToken);
            if (room != null)
            {
                resolvedRoomId = room.Id;
                resolvedRoomOrStation = room.Name;
            }
        }
        else if (!string.IsNullOrWhiteSpace(resolvedRoomOrStation) && _roomRepository != null)
        {
            var room = await _roomRepository
                .Query(r => r.ClinicId == _clinicContext.ClinicId && r.Name.ToLower() == resolvedRoomOrStation.ToLower())
                .FirstOrDefaultAsync(cancellationToken);
            if (room != null)
            {
                resolvedRoomId = room.Id;
                resolvedRoomOrStation = room.Name;
            }
        }
        if (resolvedDoctorId.HasValue && _staffRepository != null)
        {
            var doctor = await _staffRepository
                .Query(s => s.Id == resolvedDoctorId.Value && s.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(cancellationToken);
            if (doctor != null)
            {
                if (string.IsNullOrWhiteSpace(resolvedDoctorName))
                {
                    var prefix = !string.IsNullOrWhiteSpace(doctor.Title) ? $"{doctor.Title} " : "Dr. ";
                    resolvedDoctorName = $"{prefix}{doctor.FirstName} {doctor.LastName}".Trim();
                }

                var doctorRoomIds = doctor.GetAssignedRoomIds();
                if (!resolvedRoomId.HasValue && doctorRoomIds.Count > 0 && _roomRepository != null)
                {
                    var activeRooms = await _roomRepository
                        .Query(r => r.ClinicId == _clinicContext.ClinicId && doctorRoomIds.Contains(r.Id) && r.IsActive)
                        .OrderBy(r => r.DisplayOrder)
                        .ToListAsync(cancellationToken);

                    var firstActive = activeRooms.FirstOrDefault();
                    if (firstActive != null)
                    {
                        resolvedRoomId = firstActive.Id;
                        resolvedRoomOrStation = firstActive.Name;
                    }
                }
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
            DoctorId = resolvedDoctorId,
            DoctorName = resolvedDoctorName,
            RoomId = resolvedRoomId,
            Priority = request.Priority,
            Status = QueueStatus.Waiting,
            VisitType = request.VisitType,
            CheckInTime = DateTime.UtcNow,
            ChiefComplaint = sanitizedComplaint,
            RoomOrStation = resolvedRoomOrStation,
            CreatedAt = DateTime.UtcNow,
            CreatedBy = _clinicContext.StaffId?.ToString() ?? "FrontDesk"
        };

        await _queueRepository.AddAsync(queueItem, cancellationToken);

        // Notify the patient app through the interop outbox, committed together with the check-in. A clinic that has
        // not been provisioned yet has no identity to announce, so there is nothing to notify.
        var clinic = await _clinicIdentity.GetAsync(cancellationToken);
        if (clinic != null)
        {
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
                        clinic.Name,
                        new ClinicProviderSnapshotDto(
                            (resolvedDoctorId ?? Guid.Empty).ToString(),
                            resolvedDoctorName ?? "Attending Physician",
                            null,
                            null
                        ),
                        appointment?.ServiceType ?? "Consultation",
                        scheduledAtStr,
                        appointment?.DurationMinutes ?? 30,
                        AppointmentStatus.CheckedIn.ToString(),
                        $"Checked in at {queueItem.CheckInTime:HH:mm} (Queue {queueItem.QueueNumber})",
                        resolvedDoctorName ?? "Consultation",
                        queueItem.ChiefComplaint,
                        DraftId: appointment?.DraftId
                    )
                }
            );

            await _appointmentPublisher.PublishAppointmentUpdatedAsync(pushPayload, cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

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
            null,
            queueItem.RoomOrStation,
            queueItem.RoomId,
            queueItem.VisitType,
            queueItem.DischargeNotes,
            queueItem.DischargedAt,
            queueItem.DischargedByStaffId);
    }

    private static string? SanitizeChiefComplaint(string? rawInput)
    {
        if (string.IsNullOrWhiteSpace(rawInput))
            return null;

        var cleaned = new string(rawInput
            .Where(c => !char.IsControl(c) || c == '\r' || c == '\n' || c == '\t')
            .ToArray())
            .Trim();

        if (string.IsNullOrWhiteSpace(cleaned))
            return null;

        return cleaned.Length > 255 ? cleaned[..255] : cleaned;
    }
}
