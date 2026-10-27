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

public record CollectSpecimenLabOrderCommand(
    Guid OrderId,
    string? SpecimenType,
    string? ContainerType,
    string? AccessionBarcode,
    string? CollectorName,
    string? Notes
) : IRequest<ClinicLabOrderDto>;

public record CollectSpecimenRequest(
    string? SpecimenType,
    string? ContainerType,
    string? AccessionBarcode,
    string? CollectorName,
    string? Notes
);

public class CollectSpecimenLabOrderCommandHandler : IRequestHandler<CollectSpecimenLabOrderCommand, ClinicLabOrderDto>
{
    private readonly IRepository<ClinicLabOrder> _orderRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public CollectSpecimenLabOrderCommandHandler(
        IRepository<ClinicLabOrder> orderRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _orderRepo = orderRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<ClinicLabOrderDto> Handle(CollectSpecimenLabOrderCommand request, CancellationToken cancellationToken)
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
            throw new ValidationException("Completed lab orders cannot have specimen collection updated.");
        }

        if (order.Status == LabOrderStatus.Cancelled)
        {
            throw new ValidationException("Cancelled lab orders cannot have specimen collected.");
        }

        order.Status = LabOrderStatus.SpecimenCollected;
        order.Stage = LabOrderStage.SpecimenCollected;
        var specType = !string.IsNullOrWhiteSpace(request.SpecimenType) ? request.SpecimenType.Trim() : "Whole Blood";
        var barcode = !string.IsNullOrWhiteSpace(request.AccessionBarcode) ? request.AccessionBarcode.Trim() : "N/A";
        order.StageReason = $"Specimen collected ({specType}). Barcode: {barcode}";
        order.StageChangedAt = DateTime.UtcNow;

        foreach (var item in order.Items)
        {
            if (item.Status == LabOrderStatus.Ordered)
            {
                item.Status = LabOrderStatus.SpecimenCollected;
            }
        }

        var container = !string.IsNullOrWhiteSpace(request.ContainerType) ? request.ContainerType.Trim() : "Standard";
        var collector = !string.IsNullOrWhiteSpace(request.CollectorName) ? request.CollectorName.Trim() : "Staff";
        var userNote = !string.IsNullOrWhiteSpace(request.Notes) ? $" - {request.Notes.Trim()}" : "";
        var logNote = $"[Specimen Collected: {specType} ({container}) | Barcode: {barcode} | Collector: {collector}]{userNote}";

        order.Notes = string.IsNullOrWhiteSpace(order.Notes)
            ? logNote
            : $"{order.Notes}\n{logNote}";

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return CreateClinicLabOrderCommandHandler.MapToDto(order);
    }
}
