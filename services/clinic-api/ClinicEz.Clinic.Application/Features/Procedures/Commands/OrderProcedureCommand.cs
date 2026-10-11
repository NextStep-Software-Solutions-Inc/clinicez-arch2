using System;
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
    string? ClinicalNotes = null
) : IRequest<ClinicalProcedureDto>;

public class OrderProcedureCommandHandler : IRequestHandler<OrderProcedureCommand, ClinicalProcedureDto>
{
    private readonly IRepository<ClinicalProcedure> _procRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IRepository<QueueItem>? _queueRepo;

    public OrderProcedureCommandHandler(
        IRepository<ClinicalProcedure> procRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IRepository<QueueItem>? queueRepo = null)
    {
        _procRepo = procRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _queueRepo = queueRepo;
    }

    public async Task<ClinicalProcedureDto> Handle(OrderProcedureCommand request, CancellationToken cancellationToken)
    {
        if (request.PatientId == Guid.Empty || string.IsNullOrWhiteSpace(request.PatientName))
        {
            throw new BadRequestException("PatientId and PatientName are required to order a procedure.");
        }

        var procedure = new ClinicalProcedure
        {
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            PatientId = request.PatientId,
            PatientName = request.PatientName.Trim(),
            QueueItemId = request.QueueItemId,
            ConsultationId = request.ConsultationId,
            ProcedureCode = request.ProcedureCode?.Trim(),
            ProcedureName = request.ProcedureName.Trim(),
            Category = string.IsNullOrWhiteSpace(request.Category) ? "Procedure" : request.Category.Trim(),
            OrderedByDoctorId = request.OrderedByDoctorId,
            OrderedByDoctorName = request.OrderedByDoctorName?.Trim(),
            ScheduledAt = DateTime.UtcNow,
            Status = ProcedureStatus.Ordered,
            ClinicalNotes = request.ClinicalNotes?.Trim()
        };

        await _procRepo.AddAsync(procedure, cancellationToken);

        if (request.QueueItemId.HasValue && _queueRepo != null)
        {
            var queueItem = await _queueRepo.Query(q => q.Id == request.QueueItemId.Value && q.ClinicId == _clinicContext.ClinicId)
                .FirstOrDefaultAsync(cancellationToken);
            if (queueItem != null && queueItem.Status != QueueStatus.Completed && queueItem.Status != QueueStatus.Cancelled)
            {
                queueItem.Status = QueueStatus.PendingProcedure;
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
        p.Complications
    );
}
