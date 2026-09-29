using System;
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

public record AttachExternalLabResultCommand(
    Guid OrderId,
    string? ExternalLabName,
    string DocumentType, // Photo, PDF
    string? DocumentUrl,
    string? FileBase64,
    string? Notes,
    string UploadedBy = "ClinicStaff"
) : IRequest<ClinicLabOrderDto>;

public class AttachExternalLabResultCommandHandler : IRequestHandler<AttachExternalLabResultCommand, ClinicLabOrderDto>
{
    private readonly IRepository<ClinicLabOrder> _orderRepo;
    private readonly IUnitOfWork _unitOfWork;

    public AttachExternalLabResultCommandHandler(
        IRepository<ClinicLabOrder> orderRepo,
        IUnitOfWork unitOfWork)
    {
        _orderRepo = orderRepo;
        _unitOfWork = unitOfWork;
    }

    public async Task<ClinicLabOrderDto> Handle(AttachExternalLabResultCommand request, CancellationToken cancellationToken)
    {
        var order = await _orderRepo.Query(o => o.Id == request.OrderId)
            .Include(o => o.Items)
            .FirstOrDefaultAsync(cancellationToken);

        if (order == null)
        {
            throw new NotFoundException($"Clinic lab order with ID '{request.OrderId}' was not found.");
        }

        order.ExternalLabName = request.ExternalLabName?.Trim() ?? "Independent External Laboratory";
        order.ExternalReportType = string.IsNullOrWhiteSpace(request.DocumentType) ? "PDF" : request.DocumentType.Trim();
        order.ExternalReportUrl = request.DocumentUrl?.Trim();
        order.ExternalReportFileBase64 = request.FileBase64?.Trim();
        order.UploadedBy = request.UploadedBy;
        order.Status = LabOrderStatus.CompletedWithExternalReport;
        order.ReportReleasedAt = DateTime.UtcNow;

        if (!string.IsNullOrWhiteSpace(request.Notes))
        {
            order.Notes = string.IsNullOrWhiteSpace(order.Notes)
                ? request.Notes.Trim()
                : $"{order.Notes} • External Note: {request.Notes.Trim()}";
        }

        foreach (var item in order.Items)
        {
            item.Status = LabOrderStatus.CompletedWithExternalReport;
        }

        _orderRepo.Update(order);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return CreateClinicLabOrderCommandHandler.MapToDto(order);
    }
}
