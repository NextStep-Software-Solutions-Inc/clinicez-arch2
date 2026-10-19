using System;
using System.Collections.Generic;
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

public sealed record BatchSaveDentalChartCommand(
    Guid PatientId,
    Guid? ConsultationId,
    List<ToothRecordInput> Teeth
) : IRequest<DentalChartDto>;

public sealed class BatchSaveDentalChartCommandHandler : IRequestHandler<BatchSaveDentalChartCommand, DentalChartDto>
{
    private readonly IRepository<DentalToothRecord> _toothRepo;
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly ISender _sender;

    public BatchSaveDentalChartCommandHandler(
        IRepository<DentalToothRecord> toothRepo,
        IRepository<ClinicPatient> patientRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        ISender sender)
    {
        _toothRepo = toothRepo ?? throw new ArgumentNullException(nameof(toothRepo));
        _patientRepo = patientRepo ?? throw new ArgumentNullException(nameof(patientRepo));
        _unitOfWork = unitOfWork ?? throw new ArgumentNullException(nameof(unitOfWork));
        _clinicContext = clinicContext ?? throw new ArgumentNullException(nameof(clinicContext));
        _sender = sender ?? throw new ArgumentNullException(nameof(sender));
    }

    public async Task<DentalChartDto> Handle(BatchSaveDentalChartCommand request, CancellationToken ct)
    {
        if (request.PatientId == Guid.Empty)
        {
            throw new BadRequestException("PatientId is required.");
        }

        var patient = await _patientRepo
            .Query(p => p.ClinicId == _clinicContext.ClinicId && p.Id == request.PatientId && !p.IsDeleted)
            .FirstOrDefaultAsync(ct);

        if (patient == null)
        {
            throw new NotFoundException($"Patient '{request.PatientId}' not found.");
        }

        var patientName = $"{patient.LastName}, {patient.FirstName}".Trim();

        if (request.Teeth == null || request.Teeth.Count == 0)
        {
            return await _sender.Send(new GetPatientDentalChartQuery(request.PatientId, request.ConsultationId), ct);
        }

        // 1. Pre-validate all teeth first to guarantee atomic failure before state modification
        foreach (var tooth in request.Teeth)
        {
            UpsertDentalToothRecordCommandHandler.ValidateToothNumber(tooth.ToothNumber);
            UpsertDentalToothRecordCommandHandler.NormalizeAndSortSurfaces(tooth.Surface);
        }

        // 2. Deduplicate by ToothNumber, retaining the last item per tooth if duplicated
        var distinctTeeth = request.Teeth
            .GroupBy(t => t.ToothNumber)
            .Select(g => g.Last())
            .ToList();

        // 3. Load existing records for the patient
        var existingTeeth = await _toothRepo
            .Query(t => t.ClinicId == _clinicContext.ClinicId && t.PatientId == request.PatientId && !t.IsDeleted)
            .ToListAsync(ct);

        // 4. Upsert distinct teeth
        foreach (var tooth in distinctTeeth)
        {
            var normalizedSurface = UpsertDentalToothRecordCommandHandler.NormalizeAndSortSurfaces(tooth.Surface);
            var existing = existingTeeth.FirstOrDefault(t => t.ToothNumber == tooth.ToothNumber);

            if (existing != null)
            {
                existing.Status = tooth.Status;
                existing.Surface = normalizedSurface;
                existing.Notes = string.IsNullOrWhiteSpace(tooth.Notes) ? null : tooth.Notes.Trim();
                if (request.ConsultationId.HasValue)
                {
                    existing.ConsultationId = request.ConsultationId.Value;
                }
                existing.PatientName = patientName;
                existing.UpdatedAt = DateTime.UtcNow;
                existing.UpdatedBy = _clinicContext.StaffName ?? "Staff";
                _toothRepo.Update(existing);
            }
            else
            {
                var newTooth = new DentalToothRecord
                {
                    Id = Guid.NewGuid(),
                    TenantId = _clinicContext.TenantId,
                    ClinicId = _clinicContext.ClinicId,
                    PatientId = request.PatientId,
                    PatientName = patientName,
                    ConsultationId = request.ConsultationId,
                    ToothNumber = tooth.ToothNumber,
                    Status = tooth.Status,
                    Surface = normalizedSurface,
                    Notes = string.IsNullOrWhiteSpace(tooth.Notes) ? null : tooth.Notes.Trim(),
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = _clinicContext.StaffName ?? "Staff"
                };
                await _toothRepo.AddAsync(newTooth, ct);
                existingTeeth.Add(newTooth);
            }
        }

        // 5. Commit batch changes atomically
        await _unitOfWork.SaveChangesAsync(ct);

        // 6. Return refreshed chart via query handler
        return await _sender.Send(new GetPatientDentalChartQuery(request.PatientId, request.ConsultationId), ct);
    }
}
