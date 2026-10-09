using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Laboratory.Application.Features.Requisitions.DTOs;
using ClinicEz.Laboratory.Application.Features.Requisitions.Queries;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Laboratory.Application.Features.Requisitions.Commands;

public record RefreshPaymentStatusCommand(Guid RequisitionId) : IRequest<LabRequisitionDto>;

/// <summary>
/// Asks billing again about an unpaid order by re-sending its invoice request (idempotent on the request id); billing
/// answers with <c>billing.payment.confirmed</c> if the cashier has already collected, and the order is then marked paid
/// by the usual handler. The returned DTO is the current state; staff poll until <c>Paid</c>.
/// </summary>
public class RefreshPaymentStatusCommandHandler : IRequestHandler<RefreshPaymentStatusCommand, LabRequisitionDto>
{
    private readonly IRepository<LabRequisition> _requisitionRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILabOrderBilling _billing;

    public RefreshPaymentStatusCommandHandler(
        IRepository<LabRequisition> requisitionRepository,
        IUnitOfWork unitOfWork,
        ILabOrderBilling billing)
    {
        _requisitionRepository = requisitionRepository;
        _unitOfWork = unitOfWork;
        _billing = billing;
    }

    public async Task<LabRequisitionDto> Handle(RefreshPaymentStatusCommand request, CancellationToken cancellationToken)
    {
        var requisition = await _requisitionRepository.Query()
            .Include(r => r.Specimens)
            .Include(r => r.AnalyteResults)
            .Include(r => r.DiagnosticReport)
            .FirstOrDefaultAsync(r => r.Id == request.RequisitionId, cancellationToken)
            ?? throw new KeyNotFoundException($"Requisition with ID {request.RequisitionId} not found.");

        if (await _billing.RefreshInvoiceAsync(requisition, cancellationToken))
        {
            _requisitionRepository.Update(requisition);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }

        return GetWorklistQueryHandler.MapToDto(requisition);
    }
}
