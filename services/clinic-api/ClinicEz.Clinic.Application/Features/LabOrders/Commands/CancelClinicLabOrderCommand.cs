using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interoperability;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.LabOrders.Commands;

public record CancelClinicLabOrderCommand(
    Guid OrderId,
    string? Reason = null
) : IRequest<ClinicLabOrderDto>;

public record CancelClinicLabOrderRequest(
    string? Reason
);

public class CancelClinicLabOrderCommandHandler : IRequestHandler<CancelClinicLabOrderCommand, ClinicLabOrderDto>
{
    private readonly IRepository<LabOrder> _orderRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public CancelClinicLabOrderCommandHandler(
        IRepository<LabOrder> orderRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _orderRepo = orderRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<ClinicLabOrderDto> Handle(CancelClinicLabOrderCommand request, CancellationToken cancellationToken)
    {
        var order = await _orderRepo.Query(o => o.Id == request.OrderId && o.ClinicId == _clinicContext.ClinicId)
            .Include(o => o.Items)
            .FirstOrDefaultAsync(cancellationToken);

        if (order == null)
        {
            throw new NotFoundException($"Lab order with ID '{request.OrderId}' not found.");
        }

        if (order.Status == LabOrderStatus.Completed ||
            order.Status == LabOrderStatus.ResultsReceived ||
            order.Status == LabOrderStatus.CompletedWithExternalReport)
        {
            throw new ValidationException("Completed lab orders or orders with received results cannot be cancelled.");
        }

        if (order.Status == LabOrderStatus.Cancelled)
        {
            return CreateClinicLabOrderCommandHandler.MapToDto(order);
        }

        order.Status = LabOrderStatus.Cancelled;
        order.Stage = LabOrderStage.Cancelled;
        order.StageReason = !string.IsNullOrWhiteSpace(request.Reason)
            ? request.Reason.Trim()
            : "Cancelled by clinician";
        order.StageChangedAt = DateTime.UtcNow;

        foreach (var item in order.Items)
        {
            if (item.Status != LabOrderStatus.Completed)
            {
                item.Status = LabOrderStatus.Cancelled;
            }
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return CreateClinicLabOrderCommandHandler.MapToDto(order);
    }
}
