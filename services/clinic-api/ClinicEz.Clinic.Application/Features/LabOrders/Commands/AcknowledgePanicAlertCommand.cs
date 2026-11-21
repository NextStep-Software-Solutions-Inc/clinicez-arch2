using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Application.Features.LabOrders.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.LabOrders.Commands;

public record AcknowledgePanicAlertCommand(
    Guid LabOrderId,
    string AcknowledgedByDoctorName,
    string? Notes = null
) : IRequest<ClinicLabOrderDto>;

public class AcknowledgePanicAlertCommandHandler : IRequestHandler<AcknowledgePanicAlertCommand, ClinicLabOrderDto>
{
    private readonly IRepository<LabOrder> _orderRepo;
    private readonly IUnitOfWork _unitOfWork;

    public AcknowledgePanicAlertCommandHandler(
        IRepository<LabOrder> orderRepo,
        IUnitOfWork unitOfWork)
    {
        _orderRepo = orderRepo;
        _unitOfWork = unitOfWork;
    }

    public async Task<ClinicLabOrderDto> Handle(AcknowledgePanicAlertCommand request, CancellationToken cancellationToken)
    {
        var order = await _orderRepo.Query(o => o.Id == request.LabOrderId)
            .Include(o => o.Items)
            .FirstOrDefaultAsync(cancellationToken);

        if (order == null)
        {
            throw new KeyNotFoundException($"Lab order {request.LabOrderId} not found.");
        }

        order.PanicAcknowledgedAt = DateTime.UtcNow;
        order.PanicAcknowledgedBy = request.AcknowledgedByDoctorName;

        if (!string.IsNullOrWhiteSpace(request.Notes))
        {
            order.Notes = string.IsNullOrWhiteSpace(order.Notes)
                ? $"[Panic Acknowledgment]: {request.Notes.Trim()}"
                : $"{order.Notes}\n[Panic Acknowledgment]: {request.Notes.Trim()}";
        }

        _orderRepo.Update(order);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return CreateClinicLabOrderCommandHandler.MapToDto(order);
    }
}
