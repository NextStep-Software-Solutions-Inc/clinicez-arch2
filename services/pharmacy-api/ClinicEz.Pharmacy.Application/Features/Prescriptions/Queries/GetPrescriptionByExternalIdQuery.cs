using ClinicEz.Pharmacy.Application.Features.Prescriptions.DTOs;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Pharmacy.Application.Features.Prescriptions.Queries;

/// <summary>Looks an order up by the clinic's prescription id (the claim result's <c>PrescriptionId</c>), e.g. to open a just-claimed prescription.</summary>
public record GetPrescriptionByExternalIdQuery(Guid PrescriptionId) : IRequest<PrescriptionOrderDto>;

public class GetPrescriptionByExternalIdQueryHandler : IRequestHandler<GetPrescriptionByExternalIdQuery, PrescriptionOrderDto>
{
    private readonly IRepository<PrescriptionOrder> _orderRepo;
    private readonly ISender _sender;

    public GetPrescriptionByExternalIdQueryHandler(IRepository<PrescriptionOrder> orderRepo, ISender sender)
    {
        _orderRepo = orderRepo;
        _sender = sender;
    }

    public async Task<PrescriptionOrderDto> Handle(GetPrescriptionByExternalIdQuery request, CancellationToken cancellationToken)
    {
        var id = await _orderRepo.Query(o => o.ExternalPrescriptionId == request.PrescriptionId)
            .Select(o => (Guid?)o.Id)
            .FirstOrDefaultAsync(cancellationToken);

        if (id is null)
        {
            throw new NotFoundException($"No prescription with ID '{request.PrescriptionId}' has reached this pharmacy yet.");
        }

        return await _sender.Send(new GetPrescriptionDetailsQuery(id.Value), cancellationToken);
    }
}
