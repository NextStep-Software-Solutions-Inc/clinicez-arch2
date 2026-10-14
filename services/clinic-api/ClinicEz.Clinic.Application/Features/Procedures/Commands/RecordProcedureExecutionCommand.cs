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

public record RecordProcedureExecutionCommand(
    Guid ProcedureId,
    Guid? PerformedByStaffId = null,
    string? PerformedByStaffName = null,
    string? PreProcedureVitalsJson = null,
    string? PostProcedureVitalsJson = null,
    string? MedicationAdministered = null,
    string? LotNumber = null,
    DateTime? ExpirationDate = null,
    string? SiteRoute = null,
    string? ClinicalNotes = null,
    string? Complications = null
) : IRequest<ClinicalProcedureDto>;

public class RecordProcedureExecutionCommandHandler : IRequestHandler<RecordProcedureExecutionCommand, ClinicalProcedureDto>
{
    private readonly IRepository<ClinicalProcedure> _procRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<QueueItem>? _queueRepo;
    private readonly IRepository<StaffMember>? _staffRepo;

    public RecordProcedureExecutionCommandHandler(
        IRepository<ClinicalProcedure> procRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IRepository<QueueItem>? queueRepo = null,
        IRepository<StaffMember>? staffRepo = null)
    {
        _procRepo = procRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _queueRepo = queueRepo;
        _staffRepo = staffRepo;
    }

    public async Task<ClinicalProcedureDto> Handle(RecordProcedureExecutionCommand request, CancellationToken cancellationToken)
    {
        var proc = await _procRepo.Query(p => p.Id == request.ProcedureId)
            .FirstOrDefaultAsync(cancellationToken);

        if (proc == null)
        {
            throw new NotFoundException($"Procedure with ID '{request.ProcedureId}' not found.");
        }

        proc.PerformedByStaffId = request.PerformedByStaffId ?? _clinicContext.StaffId;
        proc.PerformedByStaffName = request.PerformedByStaffName?.Trim() ?? "Nurse Station";
        proc.PerformedAt = DateTime.UtcNow;
        proc.Status = ProcedureStatus.Completed;
        proc.PreProcedureVitalsJson = request.PreProcedureVitalsJson?.Trim();
        proc.PostProcedureVitalsJson = request.PostProcedureVitalsJson?.Trim();
        proc.MedicationAdministered = request.MedicationAdministered?.Trim();
        proc.LotNumber = request.LotNumber?.Trim();
        proc.ExpirationDate = request.ExpirationDate;
        proc.SiteRoute = request.SiteRoute?.Trim();
        proc.ClinicalNotes = request.ClinicalNotes?.Trim();
        proc.Complications = request.Complications?.Trim();

        if (proc.QueueItemId.HasValue && _queueRepo != null)
        {
            var queueItem = await _queueRepo.Query(q => q.Id == proc.QueueItemId.Value && q.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(cancellationToken);
            if (queueItem != null && queueItem.Status == QueueStatus.PendingProcedure)
            {
                queueItem.Status = QueueStatus.ReEvaluation;
                var targetDoctorId = queueItem.DoctorId ?? proc.OrderedByDoctorId;
                if (targetDoctorId.HasValue && _staffRepo != null)
                {
                    var doctor = await _staffRepo
                        .Query(s => s.Id == targetDoctorId.Value && s.ClinicId == _clinicContext.ClinicId)
                        .Include(s => s.AssignedRoom)
                        .FirstOrDefaultAsync(cancellationToken);
                    if (doctor?.AssignedRoom != null && doctor.AssignedRoom.IsActive)
                    {
                        queueItem.RoomId = doctor.AssignedRoom.Id;
                        queueItem.RoomOrStation = doctor.AssignedRoom.Name;
                    }
                    else if (queueItem.RoomId == proc.TargetRoomId || queueItem.RoomOrStation == proc.TargetRoomName)
                    {
                        queueItem.RoomId = null;
                        queueItem.RoomOrStation = null;
                    }
                }
                queueItem.UpdatedAt = DateTime.UtcNow;
                _queueRepo.Update(queueItem);
            }
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return OrderProcedureCommandHandler.MapToDto(proc, _clinicContext.TenantId);
    }
}
