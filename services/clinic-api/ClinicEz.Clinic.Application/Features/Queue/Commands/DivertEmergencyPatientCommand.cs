using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;

namespace ClinicEz.Clinic.Application.Features.Queue.Commands;

public sealed record DivertEmergencyPatientCommand(
    Guid QueueItemId,
    string DestinationHospital,
    string TransportMode,
    string ParamedicOrEscortName,
    string ClinicalHandoverSummary,
    Guid? DivertedByStaffId = null
) : IRequest<bool>;

public sealed class DivertEmergencyPatientCommandHandler : IRequestHandler<DivertEmergencyPatientCommand, bool>
{
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public DivertEmergencyPatientCommandHandler(
        IRepository<QueueItem> queueRepository,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _queueRepository = queueRepository;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<bool> Handle(DivertEmergencyPatientCommand request, CancellationToken ct)
    {
        if (request.QueueItemId == Guid.Empty)
        {
            throw new BadRequestException("QueueItemId is required.");
        }

        if (string.IsNullOrWhiteSpace(request.DestinationHospital))
        {
            throw new BadRequestException("Destination hospital is required for emergency diversion.");
        }

        if (string.IsNullOrWhiteSpace(request.TransportMode))
        {
            throw new BadRequestException("Transport mode is required for emergency diversion.");
        }

        if (string.IsNullOrWhiteSpace(request.ParamedicOrEscortName))
        {
            throw new BadRequestException("Paramedic or escort name is required for emergency diversion.");
        }

        if (string.IsNullOrWhiteSpace(request.ClinicalHandoverSummary))
        {
            throw new BadRequestException("Clinical handover summary is required for emergency diversion.");
        }

        var queueItem = await _queueRepository.GetByIdAsync(request.QueueItemId, ct)
            ?? throw new NotFoundException($"Queue item with ID '{request.QueueItemId}' not found.");

        if (_clinicContext.ClinicId != Guid.Empty && queueItem.ClinicId != _clinicContext.ClinicId)
        {
            throw new ForbiddenException("Queue item does not belong to the current clinic.");
        }

        if (queueItem.Status == QueueStatus.Completed ||
            queueItem.Status == QueueStatus.Cancelled ||
            queueItem.Status == QueueStatus.NoShow ||
            queueItem.Status == QueueStatus.DischargedNonDoctor ||
            queueItem.Status == QueueStatus.Diverted)
        {
            throw new BadRequestException($"Queue ticket is already closed with status '{queueItem.Status}'. Cannot divert.");
        }

        var now = DateTime.UtcNow;
        var staffId = request.DivertedByStaffId ?? _clinicContext.StaffId;

        queueItem.Status = QueueStatus.Diverted;
        queueItem.DivertedToFacility = request.DestinationHospital.Trim();
        queueItem.TransportMode = request.TransportMode.Trim();
        queueItem.ParamedicOrEscortName = request.ParamedicOrEscortName.Trim();
        queueItem.HandoverSummary = request.ClinicalHandoverSummary.Trim();
        queueItem.DivertedAt = now;
        queueItem.DivertedByStaffId = staffId;
        queueItem.CompletedTime = now;
        queueItem.UpdatedAt = now;
        queueItem.UpdatedBy = staffId?.ToString() ?? "ClinicStaff";

        _queueRepository.Update(queueItem);
        await _unitOfWork.SaveChangesAsync(ct);

        return true;
    }
}
