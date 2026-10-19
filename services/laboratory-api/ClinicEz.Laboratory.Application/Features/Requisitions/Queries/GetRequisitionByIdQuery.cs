using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Features.Requisitions.DTOs;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Laboratory.Application.Features.Requisitions.Queries;

public record GetRequisitionByIdQuery(Guid? Id = null, string? AccessionNumber = null) : IRequest<LabRequisitionDto?>;

public class GetRequisitionByIdQueryHandler : IRequestHandler<GetRequisitionByIdQuery, LabRequisitionDto?>
{
    private readonly IRepository<LabRequisition> _requisitionRepository;

    public GetRequisitionByIdQueryHandler(IRepository<LabRequisition> requisitionRepository)
    {
        _requisitionRepository = requisitionRepository;
    }

    public async Task<LabRequisitionDto?> Handle(GetRequisitionByIdQuery request, CancellationToken cancellationToken)
    {
        var query = _requisitionRepository.Query()
            .Include(r => r.Specimens)
            .Include(r => r.AnalyteResults)
            .Include(r => r.DiagnosticReport)
            .AsNoTracking();

        LabRequisition? requisition;
        if (request.Id.HasValue)
        {
            requisition = await query.FirstOrDefaultAsync(r => r.Id == request.Id.Value, cancellationToken);
        }
        else if (!string.IsNullOrWhiteSpace(request.AccessionNumber))
        {
            requisition = await query.FirstOrDefaultAsync(r => r.AccessionNumber == request.AccessionNumber.Trim(), cancellationToken);
        }
        else
        {
            return null;
        }

        return requisition == null ? null : GetWorklistQueryHandler.MapToDto(requisition);
    }
}
