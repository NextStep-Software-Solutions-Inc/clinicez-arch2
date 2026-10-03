using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Features.Requisitions.DTOs;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Laboratory.Application.Features.Requisitions.Queries;

public record GetRackInventoryQuery(string? RackId = null) : IRequest<List<RackInventoryItemDto>>;

public class GetRackInventoryQueryHandler : IRequestHandler<GetRackInventoryQuery, List<RackInventoryItemDto>>
{
    private readonly IRepository<LabRequisition> _requisitionRepository;

    public GetRackInventoryQueryHandler(IRepository<LabRequisition> requisitionRepository)
    {
        _requisitionRepository = requisitionRepository;
    }

    public async Task<List<RackInventoryItemDto>> Handle(GetRackInventoryQuery request, CancellationToken cancellationToken)
    {
        var requisitions = await _requisitionRepository.Query()
            .Include(r => r.Specimens)
            .AsNoTracking()
            .ToListAsync(cancellationToken);

        var list = new List<RackInventoryItemDto>();

        foreach (var req in requisitions)
        {
            foreach (var spec in req.Specimens)
            {
                if (spec.StorageStatus == SpecimenStorageStatus.StoredInRack && !string.IsNullOrWhiteSpace(spec.RackId))
                {
                    if (string.IsNullOrWhiteSpace(request.RackId) || string.Equals(spec.RackId, request.RackId.Trim(), StringComparison.OrdinalIgnoreCase))
                    {
                        list.Add(new RackInventoryItemDto
                        {
                            SpecimenId = spec.Id,
                            RequisitionId = req.Id,
                            Barcode = spec.Barcode,
                            AccessionNumber = req.AccessionNumber,
                            PatientName = req.PatientName,
                            ContainerType = spec.ContainerType.ToString(),
                            SpecimenType = spec.SpecimenType,
                            RackId = spec.RackId,
                            RackPosition = spec.RackPosition ?? string.Empty,
                            StorageTemperature = spec.StorageTemperature.ToString(),
                            StorageStatus = spec.StorageStatus.ToString(),
                            StoredAt = spec.StoredAt
                        });
                    }
                }
            }
        }

        return list.OrderBy(x => x.RackId).ThenBy(x => x.RackPosition).ToList();
    }
}
