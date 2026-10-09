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

public record SubmitPublicLabUploadCommand(
    string Token,
    string? ExternalLabName,
    string DocumentType, // Photo, PDF
    string? DocumentUrl,
    string? FileBase64,
    string? Notes,
    string UploadedBy = "ExternalLab",
    string? ContactNumber = null,
    string? PathologistName = null,
    string? PathologistPrcLicense = null
) : IRequest<ClinicLabOrderDto>;

public class SubmitPublicLabUploadCommandHandler : IRequestHandler<SubmitPublicLabUploadCommand, ClinicLabOrderDto>
{
    private readonly IRepository<ClinicLabOrder> _orderRepo;
    private readonly IUnitOfWork _unitOfWork;

    public SubmitPublicLabUploadCommandHandler(
        IRepository<ClinicLabOrder> orderRepo,
        IUnitOfWork unitOfWork)
    {
        _orderRepo = orderRepo;
        _unitOfWork = unitOfWork;
    }

    public async Task<ClinicLabOrderDto> Handle(SubmitPublicLabUploadCommand request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Token))
        {
            throw new BadRequestException("Upload token is required.");
        }

        var order = await _orderRepo.Query(o => o.PublicUploadToken == request.Token)
            .Include(o => o.Items)
            .FirstOrDefaultAsync(cancellationToken);

        if (order == null)
        {
            throw new NotFoundException("Invalid or expired laboratory upload link.");
        }

        order.ExternalLabName = request.ExternalLabName?.Trim() ?? "External Diagnostic Center";
        order.ExternalReportType = string.IsNullOrWhiteSpace(request.DocumentType) ? "PDF" : request.DocumentType.Trim();
        order.ExternalReportUrl = request.DocumentUrl?.Trim();
        order.ExternalReportFileBase64 = request.FileBase64?.Trim();
        order.UploadedBy = request.UploadedBy;
        order.Status = LabOrderStatus.CompletedWithExternalReport;
        order.ReportReleasedAt = DateTime.UtcNow;

        if (!string.IsNullOrWhiteSpace(request.PathologistName))
        {
            order.VerifiedByPathologist = request.PathologistName.Trim();
        }
        if (!string.IsNullOrWhiteSpace(request.PathologistPrcLicense))
        {
            order.PathologistPrcLicense = request.PathologistPrcLicense.Trim();
        }

        if (!string.IsNullOrWhiteSpace(request.ContactNumber))
        {
            order.Notes = string.IsNullOrWhiteSpace(order.Notes)
                ? $"Facility Contact: {request.ContactNumber.Trim()}"
                : $"{order.Notes} • Facility Contact: {request.ContactNumber.Trim()}";
        }

        if (!string.IsNullOrWhiteSpace(request.Notes))
        {
            order.Notes = string.IsNullOrWhiteSpace(order.Notes)
                ? request.Notes.Trim()
                : $"{order.Notes} • Public Upload Note: {request.Notes.Trim()}";
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
