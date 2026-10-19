using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Queue.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Queue.Commands;

public sealed record CallQueueItemCommand(
    Guid Id,
    Guid? DoctorId = null,
    string? DoctorName = null,
    string? RoomOrStation = null,
    Guid? RoomId = null) : IRequest<QueueItemDto>;

public sealed class CallQueueItemCommandHandler : IRequestHandler<CallQueueItemCommand, QueueItemDto>
{
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly Features.Queue.Services.IQueueNotificationDispatcher? _notificationDispatcher;
    private readonly IRepository<ClinicRoom>? _roomRepository;
    private readonly IRepository<StaffMember>? _staffRepository;

    public CallQueueItemCommandHandler(
        IRepository<QueueItem> queueRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        Features.Queue.Services.IQueueNotificationDispatcher? notificationDispatcher = null,
        IRepository<ClinicRoom>? roomRepository = null,
        IRepository<StaffMember>? staffRepository = null)
    {
        _queueRepository = queueRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _notificationDispatcher = notificationDispatcher;
        _roomRepository = roomRepository;
        _staffRepository = staffRepository;
    }

    public CallQueueItemCommandHandler(
        IRepository<QueueItem> queueRepository,
        IRepository<StaffMember> staffRepository,
        IRepository<ClinicRoom> roomRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
        : this(queueRepository, unitOfWork, clinicContext, null, roomRepository, staffRepository)
    {
    }

    public async Task<QueueItemDto> Handle(CallQueueItemCommand request, CancellationToken cancellationToken)
    {
        var item = await _queueRepository.Query(q => q.Id == request.Id && q.ClinicId == _clinicContext.ClinicId)
            .Include(q => q.TriageVitals)
            .FirstOrDefaultAsync(cancellationToken);

        if (item == null)
        {
            throw new NotFoundException($"Queue item '{request.Id}' was not found in this clinic.");
        }

        item.Status = QueueStatus.InConsultation;
        item.CalledTime = DateTime.UtcNow;
        if (request.DoctorId.HasValue) item.DoctorId = request.DoctorId.Value;
        if (!string.IsNullOrWhiteSpace(request.DoctorName)) item.DoctorName = request.DoctorName;

        if (request.RoomId.HasValue && _roomRepository != null)
        {
            var room = await _roomRepository
                .Query(r => r.Id == request.RoomId.Value && r.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(cancellationToken);
            if (room != null)
            {
                item.RoomId = room.Id;
                item.RoomOrStation = room.Name;
            }
        }
        else if (!string.IsNullOrWhiteSpace(request.RoomOrStation))
        {
            item.RoomOrStation = request.RoomOrStation.Trim();
            if (_roomRepository != null)
            {
                var room = await _roomRepository
                    .Query(r => r.ClinicId == _clinicContext.ClinicId && r.Name.ToLower() == item.RoomOrStation.ToLower())
                    .FirstOrDefaultAsync(cancellationToken);
                if (room != null)
                {
                    item.RoomId = room.Id;
                    item.RoomOrStation = room.Name;
                }
            }
        }
        else if (_staffRepository != null)
        {
            var targetDoctorId = item.DoctorId ?? _clinicContext.StaffId;
            if (targetDoctorId.HasValue)
            {
                var doctor = await _staffRepository
                    .Query(s => s.Id == targetDoctorId.Value && s.ClinicId == _clinicContext.ClinicId)
                    .FirstOrDefaultAsync(cancellationToken);

                if (doctor != null)
                {
                    var doctorRoomIds = doctor.GetAssignedRoomIds();
                    if (doctorRoomIds.Count > 0 && _roomRepository != null)
                    {
                        var activeRooms = await _roomRepository
                            .Query(r => r.ClinicId == _clinicContext.ClinicId && doctorRoomIds.Contains(r.Id) && r.IsActive)
                            .OrderBy(r => r.DisplayOrder)
                            .ToListAsync(cancellationToken);

                        // Preservation Check: If item.RoomId is in doctor's ACTIVE assigned rooms, preserve it!
                        var preservedRoom = item.RoomId.HasValue
                            ? activeRooms.FirstOrDefault(r => r.Id == item.RoomId.Value)
                            : null;

                        if (preservedRoom != null)
                        {
                            item.RoomId = preservedRoom.Id;
                            item.RoomOrStation = preservedRoom.Name;
                        }
                        else if (activeRooms.Count > 0)
                        {
                            var firstActive = activeRooms.First();
                            item.RoomId = firstActive.Id;
                            item.RoomOrStation = firstActive.Name;
                        }
                        else
                        {
                            item.RoomId = null;
                            item.RoomOrStation = null;
                        }
                    }
                }
            }
        }

        item.UpdatedAt = DateTime.UtcNow;
        item.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "Doctor";

        if (_notificationDispatcher != null)
        {
            await _notificationDispatcher.DispatchCalledAlertAsync(item, item.DoctorName, item.RoomOrStation, cancellationToken);
            await _notificationDispatcher.EvaluateAndDispatchApproachingAlertsAsync(item.ClinicId, item.QueueDate, cancellationToken);
        }

        _queueRepository.Update(item);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        string? vitalsSummary = item.TriageVitals != null
            ? $"BP: {item.TriageVitals.SystolicBp}/{item.TriageVitals.DiastolicBp}, HR: {item.TriageVitals.HeartRateBpm}"
            : null;

        return new QueueItemDto(
            item.Id,
            item.TenantId,
            item.ClinicId,
            item.QueueNumber,
            item.SequenceNumber,
            item.QueueDate,
            item.PatientId,
            item.PatientName,
            item.AppointmentId,
            item.DoctorId,
            item.DoctorName,
            item.Priority,
            item.Status,
            item.CheckInTime,
            item.CalledTime,
            item.CompletedTime,
            item.ChiefComplaint,
            item.TriageVitals != null,
            vitalsSummary,
            item.RoomOrStation,
            item.RoomId);
    }
}

public sealed record CompleteQueueItemCommand(Guid Id) : IRequest<bool>;

public sealed class CompleteQueueItemCommandHandler : IRequestHandler<CompleteQueueItemCommand, bool>
{
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly Features.Queue.Services.IQueueNotificationDispatcher? _notificationDispatcher;

    public CompleteQueueItemCommandHandler(
        IRepository<QueueItem> queueRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        Features.Queue.Services.IQueueNotificationDispatcher? notificationDispatcher = null)
    {
        _queueRepository = queueRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _notificationDispatcher = notificationDispatcher;
    }

    public async Task<bool> Handle(CompleteQueueItemCommand request, CancellationToken cancellationToken)
    {
        var item = await _queueRepository.Query(q => q.Id == request.Id && q.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (item == null)
        {
            throw new NotFoundException($"Queue item '{request.Id}' was not found in this clinic.");
        }

        item.Status = QueueStatus.Completed;
        item.CompletedTime = DateTime.UtcNow;
        item.UpdatedAt = DateTime.UtcNow;
        item.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "Staff";

        if (_notificationDispatcher != null)
        {
            await _notificationDispatcher.EvaluateAndDispatchApproachingAlertsAsync(item.ClinicId, item.QueueDate, cancellationToken);
        }

        _queueRepository.Update(item);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return true;
    }
}
