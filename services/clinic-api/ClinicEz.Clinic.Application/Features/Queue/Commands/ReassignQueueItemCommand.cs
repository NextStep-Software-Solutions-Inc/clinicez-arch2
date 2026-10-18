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

public sealed record ReassignQueueItemCommand(
    Guid Id,
    Guid? DoctorId = null,
    string? DoctorName = null,
    Guid? RoomId = null,
    string? RoomOrStation = null) : IRequest<QueueItemDto>;

public sealed class ReassignQueueItemCommandHandler : IRequestHandler<ReassignQueueItemCommand, QueueItemDto>
{
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<ClinicRoom>? _roomRepository;
    private readonly IRepository<StaffMember>? _staffRepository;

    public ReassignQueueItemCommandHandler(
        IRepository<QueueItem> queueRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IRepository<ClinicRoom>? roomRepository = null,
        IRepository<StaffMember>? staffRepository = null)
    {
        _queueRepository = queueRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _roomRepository = roomRepository;
        _staffRepository = staffRepository;
    }

    public async Task<QueueItemDto> Handle(ReassignQueueItemCommand request, CancellationToken cancellationToken)
    {
        var item = await _queueRepository.Query(q => q.Id == request.Id && q.ClinicId == _clinicContext.ClinicId)
            .Include(q => q.TriageVitals)
            .FirstOrDefaultAsync(cancellationToken);

        if (item == null)
        {
            throw new NotFoundException($"Queue item '{request.Id}' was not found in this clinic.");
        }

        Guid? targetDoctorId = request.DoctorId;
        string? targetDoctorName = request.DoctorName;
        Guid? targetRoomId = request.RoomId;
        string? targetRoomOrStation = request.RoomOrStation?.Trim();

        if (targetDoctorId.HasValue && _staffRepository != null)
        {
            var doctor = await _staffRepository
                .Query(s => s.Id == targetDoctorId.Value && s.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(cancellationToken);

            if (doctor != null)
            {
                if (string.IsNullOrWhiteSpace(targetDoctorName))
                {
                    var prefix = !string.IsNullOrWhiteSpace(doctor.Title) ? $"{doctor.Title} " : "Dr. ";
                    targetDoctorName = $"{prefix}{doctor.FirstName} {doctor.LastName}".Trim();
                }

                // If no specific room was requested, default room to the primary room of the doctor selected
                if (!targetRoomId.HasValue && _roomRepository != null)
                {
                    var doctorRoomIds = doctor.GetAssignedRoomIds();
                    if (doctorRoomIds.Count > 0)
                    {
                        var activeRooms = await _roomRepository
                            .Query(r => r.ClinicId == _clinicContext.ClinicId && doctorRoomIds.Contains(r.Id) && r.IsActive)
                            .OrderBy(r => r.DisplayOrder)
                            .ToListAsync(cancellationToken);

                        var firstActive = activeRooms.FirstOrDefault();
                        if (firstActive != null)
                        {
                            targetRoomId = firstActive.Id;
                            targetRoomOrStation = firstActive.Name;
                        }
                    }
                }
            }
        }

        if (targetRoomId.HasValue && _roomRepository != null)
        {
            var room = await _roomRepository
                .Query(r => r.Id == targetRoomId.Value && r.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(cancellationToken);
            if (room != null)
            {
                targetRoomId = room.Id;
                targetRoomOrStation = room.Name;
            }
        }

        item.DoctorId = targetDoctorId;
        item.DoctorName = targetDoctorName;
        item.RoomId = targetRoomId;
        item.RoomOrStation = targetRoomOrStation;
        item.UpdatedAt = DateTime.UtcNow;
        item.UpdatedBy = _clinicContext.StaffId?.ToString() ?? "Reception";

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
            item.RoomId,
            item.ApproachingNotificationSent,
            item.CalledNotificationSent
        );
    }
}
