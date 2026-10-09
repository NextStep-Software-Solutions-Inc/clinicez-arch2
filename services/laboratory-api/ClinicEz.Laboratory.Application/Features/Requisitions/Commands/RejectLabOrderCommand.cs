using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Laboratory.Application.Features.Requisitions.DTOs;
using ClinicEz.Laboratory.Application.Features.Requisitions.Queries;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Laboratory.Application.Features.Requisitions.Commands;

public record RejectLabOrderCommand(Guid RequisitionId, string Reason) : IRequest<LabRequisitionDto>;

/// <summary>The laboratory declines an order (for example a test it does not offer); the clinic and the patient are told why.</summary>
public class RejectLabOrderCommandHandler : IRequestHandler<RejectLabOrderCommand, LabRequisitionDto>
{
    private readonly IRepository<LabRequisition> _requisitionRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILabOrderLifecycle _lifecycle;

    public RejectLabOrderCommandHandler(
        IRepository<LabRequisition> requisitionRepository,
        IUnitOfWork unitOfWork,
        ILabOrderLifecycle lifecycle)
    {
        _requisitionRepository = requisitionRepository;
        _unitOfWork = unitOfWork;
        _lifecycle = lifecycle;
    }

    public async Task<LabRequisitionDto> Handle(RejectLabOrderCommand request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            throw new BadRequestException("A reason is required to reject an order.");
        }

        var requisition = await _requisitionRepository.Query()
            .Include(r => r.Specimens)
            .Include(r => r.AnalyteResults)
            .Include(r => r.DiagnosticReport)
            .FirstOrDefaultAsync(r => r.Id == request.RequisitionId, cancellationToken)
            ?? throw new KeyNotFoundException($"Requisition with ID {request.RequisitionId} not found.");

        var moved = await _lifecycle.TransitionAsync(requisition, RequisitionStage.Rejected, request.Reason.Trim(), cancellationToken);
        if (!moved)
        {
            throw new ConflictException($"Requisition {requisition.Id} is already {requisition.Stage.ToString().ToLowerInvariant()} and can no longer be rejected.");
        }

        _requisitionRepository.Update(requisition);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return GetWorklistQueryHandler.MapToDto(requisition);
    }
}
