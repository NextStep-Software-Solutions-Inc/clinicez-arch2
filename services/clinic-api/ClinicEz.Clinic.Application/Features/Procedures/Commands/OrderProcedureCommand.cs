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

public record OrderProcedureCommand(
    Guid PatientId,
    string PatientName,
    Guid? QueueItemId = null,
    Guid? ConsultationId = null,
    string? ProcedureCode = null,
    string ProcedureName = "Nebulization Therapy",
    string Category = "Procedure",
    Guid? OrderedByDoctorId = null,
    string? OrderedByDoctorName = null,
    string? ClinicalNotes = null,
    Guid? TargetRoomId = null,
    string? TargetRoomName = null,
    int? ToothNumber = null,
    string? ToothSurface = null
) : IRequest<ClinicalProcedureDto>;

public class OrderProcedureCommandHandler : IRequestHandler<OrderProcedureCommand, ClinicalProcedureDto>
{
    private readonly IRepository<ClinicalProcedure> _procRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<QueueItem>? _queueRepo;
    private readonly IRepository<ClinicRoom>? _roomRepo;
    private readonly IRepository<ClinicServiceItem>? _serviceRepo;
    private readonly IRepository<StaffMember>? _staffRepo;

    public OrderProcedureCommandHandler(
        IRepository<ClinicalProcedure> procRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IRepository<QueueItem>? queueRepo = null,
        IRepository<ClinicRoom>? roomRepo = null,
        IRepository<ClinicServiceItem>? serviceRepo = null,
        IRepository<StaffMember>? staffRepo = null)
    {
        _procRepo = procRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _queueRepo = queueRepo;
        _roomRepo = roomRepo;
        _serviceRepo = serviceRepo;
        _staffRepo = staffRepo;
    }

    public async Task<ClinicalProcedureDto> Handle(OrderProcedureCommand request, CancellationToken cancellationToken)
    {
        if (request.PatientId == Guid.Empty || string.IsNullOrWhiteSpace(request.PatientName))
        {
            throw new BadRequestException("PatientId and PatientName are required to order a procedure.");
        }

        bool isDoctorOrder = false;
        if (request.OrderedByDoctorId.HasValue && request.OrderedByDoctorId.Value != Guid.Empty)
        {
            if (_staffRepo != null)
            {
                var doctor = await _staffRepo.Query(s => s.Id == request.OrderedByDoctorId.Value && s.ClinicId == _clinicContext.ClinicId)
                    .FirstOrDefaultAsync(cancellationToken);
                if (doctor != null && !string.IsNullOrWhiteSpace(doctor.PrcLicenseNumber))
                {
                    isDoctorOrder = true;
                }
            }
            else
            {
                isDoctorOrder = true;
            }
        }

        if (!isDoctorOrder && _serviceRepo != null)
        {
            var codeUpper = request.ProcedureCode?.Trim().ToUpperInvariant();
            var nameLower = request.ProcedureName?.Trim().ToLowerInvariant();

            var serviceItem = await _serviceRepo.Query(s => s.ClinicId == _clinicContext.ClinicId &&
                ((!string.IsNullOrEmpty(codeUpper) && s.Code.ToUpper() == codeUpper) ||
                 (!string.IsNullOrEmpty(nameLower) && s.Name.ToLower() == nameLower)))
                .FirstOrDefaultAsync(cancellationToken);

            if (serviceItem == null || !serviceItem.IsNurseOrderable)
            {
                throw new BadRequestException("Only procedures flagged as nurse-orderable in the clinic catalog can be ordered by non-doctor staff. Doctor order required.");
            }
        }

        Guid? resolvedRoomId = request.TargetRoomId;
        string? resolvedRoomName = string.IsNullOrWhiteSpace(request.TargetRoomName) ? null : request.TargetRoomName.Trim();

        if (_roomRepo != null)
        {
            if (resolvedRoomId.HasValue)
            {
                var room = await _roomRepo
                    .Query(r => r.Id == resolvedRoomId.Value && r.ClinicId == _clinicContext.ClinicId)
                    .FirstOrDefaultAsync(cancellationToken);
                if (room != null)
                {
                    resolvedRoomId = room.Id;
                    resolvedRoomName = room.Name;
                }
            }
            else if (!string.IsNullOrWhiteSpace(resolvedRoomName))
            {
                var room = await _roomRepo
                    .Query(r => r.ClinicId == _clinicContext.ClinicId && r.Name.ToLower() == resolvedRoomName.ToLower())
                    .FirstOrDefaultAsync(cancellationToken);
                if (room != null)
                {
                    resolvedRoomId = room.Id;
                    resolvedRoomName = room.Name;
                }
            }
            else
            {
                var treatmentRoom = await _roomRepo
                    .Query(r => r.ClinicId == _clinicContext.ClinicId && r.IsActive && r.Type == ClinicRoomType.Treatment)
                    .OrderBy(r => r.DisplayOrder)
                    .ThenBy(r => r.Name)
                    .FirstOrDefaultAsync(cancellationToken);
                if (treatmentRoom != null)
                {
                    resolvedRoomId = treatmentRoom.Id;
                    resolvedRoomName = treatmentRoom.Name;
                }
            }
        }

        resolvedRoomName ??= "Treatment Room";

        var procedure = new ClinicalProcedure
        {
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            PatientId = request.PatientId,
            PatientName = request.PatientName.Trim(),
            QueueItemId = request.QueueItemId,
            ConsultationId = request.ConsultationId,
            ProcedureCode = request.ProcedureCode?.Trim(),
            ProcedureName = string.IsNullOrWhiteSpace(request.ProcedureName) ? "Nebulization Therapy" : request.ProcedureName.Trim(),
            Category = string.IsNullOrWhiteSpace(request.Category) ? "Procedure" : request.Category.Trim(),
            OrderedByDoctorId = request.OrderedByDoctorId,
            OrderedByDoctorName = request.OrderedByDoctorName?.Trim(),
            ScheduledAt = DateTime.UtcNow,
            Status = ProcedureStatus.Ordered,
            ClinicalNotes = request.ClinicalNotes?.Trim(),
            TargetRoomId = resolvedRoomId,
            TargetRoomName = resolvedRoomName,
            ToothNumber = request.ToothNumber,
            ToothSurface = string.IsNullOrWhiteSpace(request.ToothSurface) ? null : request.ToothSurface.Trim().ToUpperInvariant()
        };

        await _procRepo.AddAsync(procedure, cancellationToken);

        if (request.QueueItemId.HasValue && _queueRepo != null)
        {
            var queueItem = await _queueRepo.Query(q => q.Id == request.QueueItemId.Value && q.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(cancellationToken);
            if (queueItem != null && queueItem.Status != QueueStatus.Completed && queueItem.Status != QueueStatus.Cancelled)
            {
                queueItem.Status = QueueStatus.PendingProcedure;
                queueItem.RoomId = resolvedRoomId;
                queueItem.RoomOrStation = resolvedRoomName;
                queueItem.UpdatedAt = DateTime.UtcNow;
                _queueRepo.Update(queueItem);
            }
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return MapToDto(procedure, _clinicContext.TenantId);
    }

    public static ClinicalProcedureDto MapToDto(ClinicalProcedure p, string tenantId) => new(
        p.Id,
        p.TenantId ?? tenantId,
        p.ClinicId,
        p.PatientId,
        p.PatientName,
        p.QueueItemId,
        p.ConsultationId,
        p.ProcedureCode,
        p.ProcedureName,
        p.Category,
        p.OrderedByDoctorId,
        p.OrderedByDoctorName,
        p.PerformedByStaffId,
        p.PerformedByStaffName,
        p.PerformedAt,
        p.ScheduledAt,
        p.Status,
        p.PreProcedureVitalsJson,
        p.PostProcedureVitalsJson,
        p.MedicationAdministered,
        p.LotNumber,
        p.ExpirationDate,
        p.SiteRoute,
        p.ClinicalNotes,
        p.Complications,
        p.TargetRoomId,
        p.TargetRoomName,
        p.ToothNumber,
        p.ToothSurface
    );
}
