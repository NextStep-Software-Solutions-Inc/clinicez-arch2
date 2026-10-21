using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Dental.DTOs;
using ClinicEz.Clinic.Application.Features.Dental.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Dental.Commands;

public sealed record VoidDentalToothRecordCommand(
    Guid PatientId,
    Guid RecordId,
    string? Reason = null
) : IRequest<DentalChartDto>;

public sealed class VoidDentalToothRecordCommandHandler : IRequestHandler<VoidDentalToothRecordCommand, DentalChartDto>
{
    private readonly IRepository<DentalToothRecord> _toothRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly ISender _sender;

    public VoidDentalToothRecordCommandHandler(
        IRepository<DentalToothRecord> toothRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        ISender sender)
    {
        _toothRepo = toothRepo ?? throw new ArgumentNullException(nameof(toothRepo));
        _unitOfWork = unitOfWork ?? throw new ArgumentNullException(nameof(unitOfWork));
        _clinicContext = clinicContext ?? throw new ArgumentNullException(nameof(clinicContext));
        _sender = sender ?? throw new ArgumentNullException(nameof(sender));
    }

    public async Task<DentalChartDto> Handle(VoidDentalToothRecordCommand request, CancellationToken ct)
    {
        if (request.PatientId == Guid.Empty)
        {
            throw new BadRequestException("PatientId is required.");
        }

        if (request.RecordId == Guid.Empty)
        {
            throw new BadRequestException("RecordId is required.");
        }

        var target = await _toothRepo
            .Query(t => t.ClinicId == _clinicContext.ClinicId
                     && t.PatientId == request.PatientId
                     && t.Id == request.RecordId
                     && !t.IsDeleted)
            .FirstOrDefaultAsync(ct);

        if (target == null)
        {
            throw new NotFoundException($"Dental tooth record '{request.RecordId}' not found.");
        }

        var now = DateTime.UtcNow;
        var staffName = _clinicContext.StaffName ?? "Attending Clinician";

        target.IsVoided = true;
        target.IsCurrent = false;
        target.ActiveSurface = null;
        target.VoidedAt = now;
        target.VoidedBy = staffName;
        target.VoidReason = string.IsNullOrWhiteSpace(request.Reason) ? "Voided by clinician" : request.Reason.Trim();
        target.UpdatedAt = now;
        target.UpdatedBy = staffName;

        var toothRecords = await _toothRepo
            .Query(t => t.ClinicId == _clinicContext.ClinicId
                     && t.PatientId == request.PatientId
                     && t.ToothNumber == target.ToothNumber
                     && !t.IsDeleted)
            .OrderBy(t => t.CreatedAt)
            .ToListAsync(ct);

        var inList = toothRecords.FirstOrDefault(r => r.Id == target.Id);
        if (inList != null)
        {
            inList.IsVoided = true;
            inList.IsCurrent = false;
            inList.ActiveSurface = null;
            inList.VoidedAt = now;
            inList.VoidedBy = staffName;
            inList.VoidReason = target.VoidReason;
            inList.UpdatedAt = now;
            inList.UpdatedBy = staffName;
        }

        UpsertDentalToothRecordCommandHandler.RecalculateToothStack(toothRecords, now);

        foreach (var rec in toothRecords)
        {
            _toothRepo.Update(rec);
        }

        await _unitOfWork.SaveChangesAsync(ct);

        return await _sender.Send(new GetPatientDentalChartQuery(request.PatientId), ct);
    }
}
