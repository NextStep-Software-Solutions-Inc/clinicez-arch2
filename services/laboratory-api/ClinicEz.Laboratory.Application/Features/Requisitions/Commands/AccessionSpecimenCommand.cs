using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Common;
using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Laboratory.Application.Features.Requisitions.DTOs;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Laboratory.Application.Features.Requisitions.Commands;

public record SpecimenAccessionInput
{
    public Guid? SpecimenId { get; init; }
    public string? Barcode { get; init; }
    public string ContainerType { get; init; } = "Purple_EDTA";
    public string SpecimenType { get; init; } = "WholeBlood";
    public DateTime? CollectedAt { get; init; }
    public string? Notes { get; init; }
}

public record AccessionSpecimenCommand(
    Guid RequisitionId,
    string PhlebotomistName,
    List<SpecimenAccessionInput> Specimens
) : IRequest<LabRequisitionDto>;

public class AccessionSpecimenCommandHandler : IRequestHandler<AccessionSpecimenCommand, LabRequisitionDto>
{
    private readonly IRepository<LabRequisition> _requisitionRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILabOrderLifecycle _lifecycle;

    public AccessionSpecimenCommandHandler(
        IRepository<LabRequisition> requisitionRepository,
        IUnitOfWork unitOfWork,
        ILabOrderLifecycle lifecycle)
    {
        _requisitionRepository = requisitionRepository;
        _unitOfWork = unitOfWork;
        _lifecycle = lifecycle;
    }

    public async Task<LabRequisitionDto> Handle(AccessionSpecimenCommand request, CancellationToken cancellationToken)
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

        // A prepaid order cannot be collected until the cashier has confirmed payment.
        OrderWorkGate.EnsureCanWork(requisition);

        var collectionTime = DateTime.UtcNow;

        foreach (var input in request.Specimens)
        {
            Specimen? targetSpecimen = null;
            if (input.SpecimenId.HasValue)
            {
                targetSpecimen = requisition.Specimens.FirstOrDefault(s => s.Id == input.SpecimenId.Value);
            }
            if (targetSpecimen == null && !string.IsNullOrWhiteSpace(input.Barcode))
            {
                targetSpecimen = requisition.Specimens.FirstOrDefault(s => s.Barcode == input.Barcode.Trim());
            }

            if (targetSpecimen != null)
            {
                targetSpecimen.Status = SpecimenStatus.Collected;
                targetSpecimen.CollectedAt = input.CollectedAt ?? collectionTime;
                targetSpecimen.CollectedByPhlebotomistName = request.PhlebotomistName;
                targetSpecimen.ReceivedInLabAt = collectionTime;
                if (!string.IsNullOrWhiteSpace(input.Notes))
                {
                    targetSpecimen.Notes = input.Notes;
                }
            }
            else
            {
                Enum.TryParse<SpecimenContainerType>(input.ContainerType, true, out var containerType);
                var newSpecimen = new Specimen
                {
                    LabRequisitionId = requisition.Id,
                    Barcode = !string.IsNullOrWhiteSpace(input.Barcode) ? input.Barcode.Trim() : $"{requisition.AccessionNumber}-S{requisition.Specimens.Count + 1:D2}",
                    ContainerType = containerType,
                    SpecimenType = string.IsNullOrWhiteSpace(input.SpecimenType) ? "WholeBlood" : input.SpecimenType,
                    Status = SpecimenStatus.Collected,
                    CollectedAt = input.CollectedAt ?? collectionTime,
                    CollectedByPhlebotomistName = request.PhlebotomistName,
                    ReceivedInLabAt = collectionTime,
                    Notes = input.Notes
                };
                requisition.Specimens.Add(newSpecimen);
            }
        }

        requisition.Status = RequisitionStatus.SpecimenCollected;
        _requisitionRepository.Update(requisition);
        await _lifecycle.TransitionAsync(requisition, RequisitionStage.SpecimenCollected, null, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Queries.GetWorklistQueryHandler.MapToDto(requisition);
    }
}
