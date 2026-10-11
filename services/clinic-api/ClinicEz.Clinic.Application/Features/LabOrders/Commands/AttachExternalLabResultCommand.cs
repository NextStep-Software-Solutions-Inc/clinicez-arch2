using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interoperability;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.LabOrders.Commands;

/// <summary>Clinic staff attach a result they received from an outside laboratory. It enters the chart Unverified, like any other external result.</summary>
public record AttachExternalLabResultCommand(
    Guid OrderId,
    string? ExternalLabName,
    string DocumentType, // Photo, PDF
    string? FileBase64,
    string? Notes,
    string? ContentType = null,
    string? FileName = null
) : IRequest<ClinicLabOrderDto>;

public class AttachExternalLabResultCommandHandler : IRequestHandler<AttachExternalLabResultCommand, ClinicLabOrderDto>
{
    private readonly IRepository<ClinicLabOrder> _orderRepo;
    private readonly IRepository<ClinicLabResult> _resultRepo;
    private readonly IClinicContext _clinicContext;
    private readonly ILabResultIntake _intake;

    public AttachExternalLabResultCommandHandler(
        IRepository<ClinicLabOrder> orderRepo,
        IRepository<ClinicLabResult> resultRepo,
        IClinicContext clinicContext,
        ILabResultIntake intake)
    {
        _orderRepo = orderRepo;
        _resultRepo = resultRepo;
        _clinicContext = clinicContext;
        _intake = intake;
    }

    public async Task<ClinicLabOrderDto> Handle(AttachExternalLabResultCommand request, CancellationToken cancellationToken)
    {
        var exists = await _orderRepo.Query(o => o.Id == request.OrderId).AnyAsync(cancellationToken);
        if (!exists)
        {
            throw new NotFoundException($"Clinic lab order with ID '{request.OrderId}' was not found.");
        }

        var (content, contentType) = LabResultUploadFiles.Decode(request.FileBase64, request.ContentType, request.DocumentType);
        await _intake.SubmitAsync(new LabResultSubmission(
            _clinicContext.ClinicId,
            request.OrderId,
            ResultSource.ExternalLab,
            content,
            request.FileName,
            contentType,
            request.ExternalLabName ?? "Independent External Laboratory",
            request.Notes), cancellationToken);

        var order = await _orderRepo.Query(o => o.Id == request.OrderId)
            .Include(o => o.Items)
            .AsNoTracking()
            .FirstAsync(cancellationToken);
        var results = await _resultRepo.Query(r => r.LabOrderId == request.OrderId)
            .AsNoTracking()
            .ToListAsync(cancellationToken);

        return CreateClinicLabOrderCommandHandler.MapToDto(order, results);
    }
}
