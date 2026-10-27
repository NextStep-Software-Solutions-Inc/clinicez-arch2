using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Procedures.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Procedures.Commands;

public record CancelProcedureCommand(
    Guid ProcedureId,
    string? Reason = null
) : IRequest<ClinicalProcedureDto>;

public record CancelProcedureRequest(
    string? Reason
);

public class CancelProcedureCommandHandler : IRequestHandler<CancelProcedureCommand, ClinicalProcedureDto>
{
    private readonly IRepository<ClinicalProcedure> _procRepo;
    private readonly IRepository<QueueItem>? _queueRepo;
    private readonly IRepository<StaffMember>? _staffRepo;
    private readonly IRepository<ClinicRoom>? _roomRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public CancelProcedureCommandHandler(
        IRepository<ClinicalProcedure> procRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IRepository<QueueItem>? queueRepo = null,
        IRepository<StaffMember>? staffRepo = null,
        IRepository<ClinicRoom>? roomRepo = null)
    {
        _procRepo = procRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _queueRepo = queueRepo;
        _staffRepo = staffRepo;
        _roomRepo = roomRepo;
    }

    public async Task<ClinicalProcedureDto> Handle(CancelProcedureCommand request, CancellationToken cancellationToken)
    {
        var proc = await _procRepo.Query(p => p.Id == request.ProcedureId && p.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(cancellationToken);

        if (proc == null)
        {
            throw new NotFoundException($"Procedure with ID '{request.ProcedureId}' not found.");
        }

        if (proc.Status == ProcedureStatus.Completed)
        {
            throw new ValidationException("Completed procedures cannot be cancelled.");
        }

        if (proc.Status == ProcedureStatus.Cancelled)
        {
            return OrderProcedureCommandHandler.MapToDto(proc, _clinicContext.TenantId);
        }

        proc.Status = ProcedureStatus.Cancelled;
        if (!string.IsNullOrWhiteSpace(request.Reason))
        {
            var reasonText = request.Reason.Trim();
            proc.ClinicalNotes = string.IsNullOrWhiteSpace(proc.ClinicalNotes)
                ? $"Cancelled: {reasonText}"
                : $"{proc.ClinicalNotes} (Cancelled: {reasonText})";
        }

        // If the patient was sent to the treatment room for this procedure, check if other active procedures remain
        if (proc.QueueItemId.HasValue && _queueRepo != null)
        {
            var queueItem = await _queueRepo.Query(q => q.Id == proc.QueueItemId.Value && q.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(cancellationToken);

            if (queueItem != null && queueItem.Status == QueueStatus.PendingProcedure)
            {
                var remainingActive = await _procRepo.Query(p =>
                    p.QueueItemId == queueItem.Id &&
                    p.Id != proc.Id &&
                    (p.Status == ProcedureStatus.Ordered || p.Status == ProcedureStatus.InProgress)
                ).AnyAsync(cancellationToken);

                if (!remainingActive)
                {
                    // Revert back to InConsultation (if doctor assigned) or Triaged
                    queueItem.Status = queueItem.DoctorId.HasValue ? QueueStatus.InConsultation : QueueStatus.Triaged;

                    if (queueItem.DoctorId.HasValue && _staffRepo != null)
                    {
                        var doctor = await _staffRepo.Query(s => s.Id == queueItem.DoctorId.Value && s.ClinicId == _clinicContext.ClinicId)
                            .FirstOrDefaultAsync(cancellationToken);
                        if (doctor != null)
                        {
                            var doctorRoomIds = doctor.GetAssignedRoomIds();
                            if (doctorRoomIds.Count > 0 && _roomRepo != null)
                            {
                                var activeRooms = await _roomRepo
                                    .Query(r => r.ClinicId == _clinicContext.ClinicId && doctorRoomIds.Contains(r.Id) && r.IsActive)
                                    .OrderBy(r => r.DisplayOrder)
                                    .ToListAsync(cancellationToken);
                                var firstRoom = activeRooms.FirstOrDefault();
                                if (firstRoom != null)
                                {
                                    queueItem.RoomId = firstRoom.Id;
                                    queueItem.RoomOrStation = firstRoom.Name;
                                }
                            }
                        }
                    }

                    queueItem.UpdatedAt = DateTime.UtcNow;
                    _queueRepo.Update(queueItem);
                }
            }
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return OrderProcedureCommandHandler.MapToDto(proc, _clinicContext.TenantId);
    }
}
