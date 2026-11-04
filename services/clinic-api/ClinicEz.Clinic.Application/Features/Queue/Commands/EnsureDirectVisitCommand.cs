using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
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

namespace ClinicEz.Clinic.Application.Features.Queue.Commands;

[method: JsonConstructor]
public sealed record EnsureDirectVisitCommand(
    Guid PatientId,
    string PatientName,
    Guid? DoctorId = null,
    string? DoctorName = null,
    string? RoomOrStation = null,
    Guid? RoomId = null,
    VisitType VisitType = VisitType.Consultation,
    VisitWorkflowMode VisitWorkflowMode = VisitWorkflowMode.Regular,
    QueueStatus? InitialStatus = null,
    string? ChiefComplaint = null,
    DateOnly? QueueDate = null,
    bool AllowDuplicateActive = false) : IRequest<QueueItemDto>;

public sealed class EnsureDirectVisitCommandValidator : AbstractValidator<EnsureDirectVisitCommand>
{
    public EnsureDirectVisitCommandValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
        RuleFor(x => x.PatientName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.VisitType).IsInEnum();
        RuleFor(x => x.ChiefComplaint)
            .MaximumLength(255)
            .WithMessage("Chief complaint must not exceed 255 characters.");
    }
}

public sealed class EnsureDirectVisitCommandHandler : IRequestHandler<EnsureDirectVisitCommand, QueueItemDto>
{
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IRepository<ConsultationEncounter>? _encounterRepository;
    private readonly IRepository<Invoice>? _invoiceRepository;
    private readonly IRepository<Room>? _roomRepository;
    private readonly IRepository<StaffMember>? _staffRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IWorkspaceProfileProvider? _workspaceProfiles;
    private readonly IRepository<FacilitySettings>? _settingsRepository;

    public EnsureDirectVisitCommandHandler(
        IRepository<QueueItem> queueRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IRepository<ConsultationEncounter>? encounterRepository = null,
        IRepository<Invoice>? invoiceRepository = null,
        IRepository<Room>? roomRepository = null,
        IRepository<StaffMember>? staffRepository = null,
        IWorkspaceProfileProvider? workspaceProfiles = null,
        IRepository<FacilitySettings>? settingsRepository = null)
    {
        _queueRepository = queueRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _encounterRepository = encounterRepository;
        _invoiceRepository = invoiceRepository;
        _roomRepository = roomRepository;
        _staffRepository = staffRepository;
        _workspaceProfiles = workspaceProfiles;
        _settingsRepository = settingsRepository;
    }

    public async Task<QueueItemDto> Handle(EnsureDirectVisitCommand request, CancellationToken cancellationToken)
    {
        var today = request.QueueDate
            ?? await ClinicTimeZoneResolver.ResolveTodayAsync(_workspaceProfiles, _clinicContext.TenantId, cancellationToken, _settingsRepository);

        QueueStatus[] nonTerminalStatuses =
        [
            QueueStatus.Waiting,
            QueueStatus.Triaged,
            QueueStatus.InConsultation,
            QueueStatus.PendingProcedure,
            QueueStatus.ReEvaluation,
            QueueStatus.OnHold
        ];

        // Active visit reuse rule:
        // Reuses existing visit iff QueueDate == today && ClinicId == clinicId && PatientId == request.PatientId &&
        // Status in NonTerminal && VisitType in Clinical && !encounter.IsSigned && !hasPaidInvoice
        if (!request.AllowDuplicateActive)
        {
            var candidates = await _queueRepository.Query(q =>
                q.ClinicId == _clinicContext.ClinicId &&
                q.QueueDate == today &&
                q.PatientId == request.PatientId &&
                q.VisitType != VisitType.RetailPurchase &&
                q.VisitType != VisitType.CashierSettlement &&
                q.VisitType != VisitType.LaboratorySpecimen &&
                nonTerminalStatuses.Contains(q.Status))
                .Include(q => q.PatientVitals)
                .OrderBy(q => q.CheckInTime)
                .ToListAsync(cancellationToken);

            foreach (var candidate in candidates)
            {
                var isSigned = false;
                if (_encounterRepository != null)
                {
                    isSigned = await _encounterRepository.Query(e =>
                        e.ClinicId == _clinicContext.ClinicId &&
                        e.QueueItemId == candidate.Id &&
                        e.IsSigned)
                        .AnyAsync(cancellationToken);
                }

                if (isSigned) continue;

                var hasPaidInvoice = false;
                if (_invoiceRepository != null)
                {
                    hasPaidInvoice = await _invoiceRepository.Query(i =>
                        i.ClinicId == _clinicContext.ClinicId &&
                        i.QueueItemId == candidate.Id &&
                        i.Status == InvoiceStatus.Paid &&
                        !i.IsDeleted)
                        .AnyAsync(cancellationToken);
                }

                if (hasPaidInvoice) continue;

                // Eligible visit found! Reuse it.
                return candidate.ToDto();
            }
        }

        // Generate next direct visit sequence: DV-001, DV-002, ...
        var dvPattern = "DV-";
        var existingDvNumbers = await _queueRepository.Query(q =>
            q.ClinicId == _clinicContext.ClinicId &&
            q.QueueDate == today &&
            q.QueueNumber.StartsWith(dvPattern))
            .Select(q => q.QueueNumber)
            .ToListAsync(cancellationToken);

        int maxDvSequence = 0;
        foreach (var qNum in existingDvNumbers)
        {
            if (qNum.StartsWith(dvPattern, StringComparison.OrdinalIgnoreCase))
            {
                var suffix = qNum[dvPattern.Length..];
                if (int.TryParse(suffix, out var parsedSeq) && parsedSeq > maxDvSequence)
                {
                    maxDvSequence = parsedSeq;
                }
            }
        }

        var nextDvIndex = maxDvSequence + 1;
        var queueNumber = $"{dvPattern}{nextDvIndex:D3}";

        var resolvedDoctorId = request.DoctorId;
        var resolvedDoctorName = request.DoctorName;
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

        var initialStatus = request.InitialStatus ?? QueueStatus.InConsultation;
        var now = DateTime.UtcNow;

        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            QueueNumber = queueNumber,
            SequenceNumber = 0,
            IsDirectVisit = true,
            QueueDate = today,
            PatientId = request.PatientId,
            PatientName = request.PatientName.Trim(),
            DoctorId = resolvedDoctorId,
            DoctorName = resolvedDoctorName,
            RoomId = resolvedRoomId,
            RoomOrStation = resolvedRoomOrStation,
            Priority = QueuePriority.Routine,
            Status = initialStatus,
            VisitType = request.VisitType,
            VisitWorkflowMode = request.VisitWorkflowMode,
            CheckInTime = now,
            CalledTime = initialStatus == QueueStatus.InConsultation ? now : null,
            CompletedTime = (initialStatus == QueueStatus.Completed || initialStatus == QueueStatus.DischargedNonDoctor) ? now : null,
            ChiefComplaint = !string.IsNullOrWhiteSpace(request.ChiefComplaint) ? request.ChiefComplaint.Trim() : null,
            CreatedAt = now,
            CreatedBy = _clinicContext.StaffId?.ToString() ?? "DirectVisit"
        };

        await _queueRepository.AddAsync(queueItem, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // Note: Check-in push notifications to IPatientAppointmentPublisher are suppressed for direct visits.
        return queueItem.ToDto();
    }
}
