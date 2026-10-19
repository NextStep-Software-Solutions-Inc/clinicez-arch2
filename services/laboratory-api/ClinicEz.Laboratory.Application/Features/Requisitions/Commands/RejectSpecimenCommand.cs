using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Features.Requisitions.DTOs;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Laboratory.Application.Features.Requisitions.Commands;

public record RejectSpecimenCommand(
    Guid RequisitionId,
    Guid SpecimenId,
    SpecimenRejectionReason ReasonCode,
    string? Notes,
    string? PhlebotomistName,
    string? CorrectiveAction = null
) : IRequest<LabRequisitionDto>;

public class RejectSpecimenCommandHandler : IRequestHandler<RejectSpecimenCommand, LabRequisitionDto>
{
    private readonly IRepository<LabRequisition> _requisitionRepository;
    private readonly IUnitOfWork _unitOfWork;

    public RejectSpecimenCommandHandler(
        IRepository<LabRequisition> requisitionRepository,
        IUnitOfWork unitOfWork)
    {
        _requisitionRepository = requisitionRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<LabRequisitionDto> Handle(RejectSpecimenCommand request, CancellationToken cancellationToken)
    {
        var requisition = await _requisitionRepository.Query()
            .Include(r => r.Specimens)
            .Include(r => r.AnalyteResults)
            .Include(r => r.DiagnosticReport)
            .FirstOrDefaultAsync(r => r.Id == request.RequisitionId, cancellationToken);

        if (requisition == null)
        {
            throw new KeyNotFoundException($"Requisition with ID {request.RequisitionId} not found.");
        }

        var specimen = requisition.Specimens.FirstOrDefault(s => s.Id == request.SpecimenId);
        if (specimen == null)
        {
            throw new KeyNotFoundException($"Specimen with ID {request.SpecimenId} not found in requisition {requisition.AccessionNumber}.");
        }

        var reason = request.ReasonCode == SpecimenRejectionReason.None
            ? SpecimenRejectionReason.InsufficientVolume_QNS
            : request.ReasonCode;

        specimen.Status = SpecimenStatus.Rejected;
        specimen.RejectionReason = reason;
        specimen.RejectionNotes = request.Notes;
        specimen.RejectedAt = DateTime.UtcNow;
        specimen.RejectedByPhlebotomistName = request.PhlebotomistName ?? "Phlebotomist";
        specimen.CorrectiveAction = !string.IsNullOrWhiteSpace(request.CorrectiveAction)
            ? request.CorrectiveAction
            : "Request re-collection from patient.";

        // If all specimens are rejected, mark entire requisition as Rejected
        if (requisition.Specimens.All(s => s.Status == SpecimenStatus.Rejected))
        {
            requisition.Status = RequisitionStatus.Rejected;
        }

        _requisitionRepository.Update(requisition);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Queries.GetWorklistQueryHandler.MapToDto(requisition);
    }
}
