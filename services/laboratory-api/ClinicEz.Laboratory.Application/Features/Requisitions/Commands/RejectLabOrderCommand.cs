using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Laboratory.Application.Features.Requisitions.DTOs;
using ClinicEz.Laboratory.Application.Features.Requisitions.Queries;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Laboratory.Application.Features.Requisitions.Commands;

public record RejectLabOrderCommand(Guid RequisitionId, string Reason) : IRequest<LabRequisitionDto>;

/// <summary>The laboratory declines an order (for example a test it does not offer); the clinic and the patient are told why.</summary>
public class RejectLabOrderCommandHandler : IRequestHandler<RejectLabOrderCommand, LabRequisitionDto>
{
    private readonly IRepository<LabRequisition> _requisitionRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILabOrderLifecycle _lifecycle;
    private readonly IInteropPublisher? _publisher;

    public RejectLabOrderCommandHandler(
        IRepository<LabRequisition> requisitionRepository,
        IUnitOfWork unitOfWork,
        ILabOrderLifecycle lifecycle,
        IInteropPublisher? publisher = null)
    {
        _requisitionRepository = requisitionRepository;
        _unitOfWork = unitOfWork;
        _lifecycle = lifecycle;
        _publisher = publisher;
    }

    public async Task<LabRequisitionDto> Handle(RejectLabOrderCommand request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            throw new BadRequestException("A reason is required to reject an order.");
        }

        var requisition = await _requisitionRepository.Query()
            .Include(r => r.Specimens)
            .Include(r => r.AnalyteResults)
            .Include(r => r.DiagnosticReport)
            .FirstOrDefaultAsync(r => r.Id == request.RequisitionId, cancellationToken)
            ?? throw new KeyNotFoundException($"Requisition with ID {request.RequisitionId} not found.");

        var moved = await _lifecycle.TransitionAsync(requisition, RequisitionStage.Rejected, request.Reason.Trim(), cancellationToken);
        if (!moved)
        {
            throw new ConflictException($"Requisition {requisition.Id} is already {requisition.Stage.ToString().ToLowerInvariant()} and can no longer be rejected.");
        }

        _requisitionRepository.Update(requisition);

        if (requisition.HasClinicEzPatient && requisition.PatientId != Guid.Empty && _publisher != null)
        {
            var grantId = CommsGrantIdGenerator.Create(requisition.TenantId, requisition.LaboratoryId.ToString(), "LabRequisition", requisition.Id.ToString());
            var from = Party.ForFacility(requisition.TenantId, requisition.LaboratoryId.ToString(), FacilityType.Laboratory);
            var toParty = Party.ForFacility(requisition.TenantId, requisition.LaboratoryId.ToString(), FacilityType.Laboratory, service: InteropServices.Comms);
            var revokePayload = new CommsEligibilityRevokedPayload(
                GrantId: grantId,
                TenantId: requisition.TenantId,
                FacilityId: requisition.LaboratoryId.ToString(),
                PatientId: requisition.PatientId,
                Reason: request.Reason.Trim(),
                RevokedAtUtc: DateTime.UtcNow,
                Version: 2);
            _publisher.Enqueue(InteropTypes.CommsEligibilityRevoked, from, toParty, correlationId: grantId, revokePayload);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return GetWorklistQueryHandler.MapToDto(requisition);
    }
}
