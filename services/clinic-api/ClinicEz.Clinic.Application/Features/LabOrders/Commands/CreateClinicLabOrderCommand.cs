using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.LabOrders.Commands;

public record CreateClinicLabOrderCommand(
    Guid PatientId,
    string PatientName,
    Guid? ConsultationId = null,
    Guid? OrderedByDoctorId = null,
    string? OrderedByDoctorName = null,
    string? ClinicalDiagnosis = null,
    string? Notes = null,
    List<CreateLabOrderItemRequest>? Items = null
) : IRequest<ClinicLabOrderDto>;

public class CreateClinicLabOrderCommandHandler : IRequestHandler<CreateClinicLabOrderCommand, ClinicLabOrderDto>
{
    private readonly IRepository<ClinicLabOrder> _orderRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public CreateClinicLabOrderCommandHandler(
        IRepository<ClinicLabOrder> orderRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _orderRepo = orderRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<ClinicLabOrderDto> Handle(CreateClinicLabOrderCommand request, CancellationToken cancellationToken)
    {
        if (request.PatientId == Guid.Empty || string.IsNullOrWhiteSpace(request.PatientName))
        {
            throw new BadRequestException("PatientId and PatientName are required to create a lab order.");
        }

        var today = DateTime.UtcNow.Date;
        var tomorrow = today.AddDays(1);
        var todayCount = await _orderRepo.Query(o => o.OrderDate >= today && o.OrderDate < tomorrow)
            .CountAsync(cancellationToken);

        var dateTag = today.ToString("yyyyMMdd");
        var orderNumber = $"LAB-{dateTag}-{(todayCount + 1):D3}";

        var items = new List<ClinicLabOrderItem>();
        if (request.Items != null && request.Items.Any())
        {
            foreach (var item in request.Items)
            {
                items.Add(new ClinicLabOrderItem
                {
                    TestName = item.TestName.Trim(),
                    Category = string.IsNullOrWhiteSpace(item.Category) ? "Diagnostic" : item.Category.Trim(),
                    Instructions = item.Instructions?.Trim(),
                    Status = LabOrderStatus.Ordered
                });
            }
        }
        else
        {
            // Default CBC request if none specified
            items.Add(new ClinicLabOrderItem
            {
                TestName = "Complete Blood Count (CBC) with Platelet",
                Category = "Hematology",
                Instructions = "Standard EDTA whole blood tube",
                Status = LabOrderStatus.Ordered
            });
        }

        var order = new ClinicLabOrder
        {
            TenantId = _clinicContext.TenantId,
            ClinicId = _clinicContext.ClinicId,
            OrderNumber = orderNumber,
            PatientId = request.PatientId,
            PatientName = request.PatientName.Trim(),
            ConsultationId = request.ConsultationId,
            OrderedByDoctorId = request.OrderedByDoctorId,
            OrderedByDoctorName = request.OrderedByDoctorName?.Trim(),
            OrderDate = DateTime.UtcNow,
            Status = LabOrderStatus.Ordered,
            ClinicalDiagnosis = request.ClinicalDiagnosis?.Trim(),
            Notes = request.Notes?.Trim(),
            Items = items
        };

        await _orderRepo.AddAsync(order, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return MapToDto(order);
    }

    public static ClinicLabOrderDto MapToDto(ClinicLabOrder order) => new(
        order.Id,
        order.TenantId ?? string.Empty,
        order.ClinicId,
        order.OrderNumber,
        order.PatientId,
        order.PatientName,
        order.ConsultationId,
        order.OrderedByDoctorId,
        order.OrderedByDoctorName,
        order.OrderDate,
        order.Status,
        order.ClinicalDiagnosis,
        order.Notes,
        order.Items.Select(i => new ClinicLabOrderItemDto(
            i.Id,
            i.TestName,
            i.Category,
            i.Instructions,
            i.Status
        )).ToList()
    );
}
