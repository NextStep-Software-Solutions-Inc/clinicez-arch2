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

public record StoreSpecimenCommand(
    Guid RequisitionId,
    Guid SpecimenId,
    string RackId,
    string RackPosition,
    string? Temperature = null
) : IRequest<LabRequisitionDto>;

public class StoreSpecimenCommandHandler : IRequestHandler<StoreSpecimenCommand, LabRequisitionDto>
{
    private readonly IRepository<LabRequisition> _requisitionRepository;
    private readonly IUnitOfWork _unitOfWork;

    public StoreSpecimenCommandHandler(
        IRepository<LabRequisition> requisitionRepository,
        IUnitOfWork unitOfWork)
    {
        _requisitionRepository = requisitionRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<LabRequisitionDto> Handle(StoreSpecimenCommand request, CancellationToken cancellationToken)
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

        Enum.TryParse<StorageTemperature>(request.Temperature, true, out var temp);

        specimen.RackId = request.RackId.Trim();
        specimen.RackPosition = request.RackPosition.Trim().ToUpperInvariant();
        specimen.StorageTemperature = temp != 0 ? temp : StorageTemperature.Refrigerated_2_8C;
        specimen.StorageStatus = SpecimenStorageStatus.StoredInRack;
        specimen.StoredAt = DateTime.UtcNow;

        _requisitionRepository.Update(requisition);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Queries.GetWorklistQueryHandler.MapToDto(requisition);
    }
}
