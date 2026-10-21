using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Dental.DTOs;
using ClinicEz.Clinic.Application.Features.Dental.Queries;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
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
            .Query(p => p.Id == request.PatientId && !p.IsDeleted)
            .FirstOrDefaultAsync(ct);

        if (patient == null)
        {
            throw new NotFoundException($"Patient '{request.PatientId}' not found.");
        }

        var patientName = $"{patient.LastName}, {patient.FirstName}".Trim();
        var staffName = _clinicContext.StaffName ?? "Staff";

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

        // 2. Load existing active records for the patient
        var existingTeeth = await _toothRepo
            .Query(t => t.ClinicId == _clinicContext.ClinicId && t.PatientId == request.PatientId && !t.IsDeleted)
            .OrderBy(t => t.CreatedAt)
            .ToListAsync(ct);

        // 3. Deduplicate batch inputs per tooth while preserving distinct conditions:
        // Group by ToothNumber so distinct statuses on the same tooth are preserved.
        // If an item has Healthy, it clears previous conditions on that tooth.
        // If multiple items on the same tooth have the exact same surface (e.g. Decayed on "m" then Filled on "m"), the last one wins.
        var processedInputs = new List<ToothRecordInput>();
        var toothGroups = request.Teeth.GroupBy(t => t.ToothNumber);

        foreach (var group in toothGroups)
        {
            var list = group.ToList();
            var lastHealthyIdx = list.FindLastIndex(t => t.Status == ToothStatus.Healthy);
            var lastNonHealthyIdx = list.FindLastIndex(t => t.Status != ToothStatus.Healthy);

            if (lastHealthyIdx > lastNonHealthyIdx)
            {
                processedInputs.Add(list[lastHealthyIdx]);
            }
            else
            {
                var nonHealthyList = list.Skip(lastHealthyIdx + 1).ToList();

                var itemsForTooth = new List<ToothRecordInput>();
                for (int i = 0; i < nonHealthyList.Count; i++)
                {
                    var item = nonHealthyList[i];
                    var normSurface = UpsertDentalToothRecordCommandHandler.NormalizeAndSortSurfaces(item.Surface);
                    bool superseded = false;
                    for (int j = i + 1; j < nonHealthyList.Count; j++)
                    {
                        var later = nonHealthyList[j];
                        var laterSurface = UpsertDentalToothRecordCommandHandler.NormalizeAndSortSurfaces(later.Surface);
                        if (later.Status == item.Status
                            || normSurface == null
                            || laterSurface == null
                            || normSurface.All(c => laterSurface.Contains(c)))
                        {
                            superseded = true;
                            break;
                        }
                    }

                    if (!superseded)
                    {
                        itemsForTooth.Add(item);
                    }
                }

                processedInputs.AddRange(itemsForTooth);
            }
        }

        // 4. Apply tooth records
        var now = DateTime.UtcNow;
        var newlyAddedIds = new HashSet<Guid>();
        var touchedToothNumbers = new HashSet<int>();
        void UpdateIfExisting(DentalToothRecord record)
        {
            if (!newlyAddedIds.Contains(record.Id))
            {
                _toothRepo.Update(record);
            }
        }

        int orderOffset = 0;
        foreach (var tooth in processedInputs)
        {
            orderOffset++;
            var recordTimestamp = now.AddMilliseconds(orderOffset);
            touchedToothNumbers.Add(tooth.ToothNumber);

            var rawNormalizedSurface = UpsertDentalToothRecordCommandHandler.NormalizeAndSortSurfaces(tooth.Surface);
            var (normalizedSurface, effectiveActiveSurface) = UpsertDentalToothRecordCommandHandler.ResolveEffectiveSurfaces(tooth.Status, rawNormalizedSurface);

            // Case A: RemoveCondition == true
            if (tooth.RemoveCondition)
            {
                var matches = existingTeeth
                    .Where(t => t.ToothNumber == tooth.ToothNumber
                             && t.Status == tooth.Status
                             && !t.IsDeleted
                             && (!request.ConsultationId.HasValue || t.ConsultationId == request.ConsultationId))
                    .ToList();
                if (matches.Count == 0)
                {
                    matches = existingTeeth
                        .Where(t => t.ToothNumber == tooth.ToothNumber && t.Status == tooth.Status && !t.IsDeleted && t.IsCurrent)
                        .ToList();
                }
                foreach (var m in matches)
                {
                    m.IsDeleted = true;
                    m.IsCurrent = false;
                    m.ActiveSurface = null;
                    m.DeletedAt = recordTimestamp;
                    m.DeletedBy = staffName;
                    UpdateIfExisting(m);
                }
                continue;
            }

            // Case B: Status == ToothStatus.Healthy
            if (tooth.Status == ToothStatus.Healthy)
            {
                var healthyRecord = existingTeeth
                    .FirstOrDefault(t => t.ToothNumber == tooth.ToothNumber
                                      && t.Status == ToothStatus.Healthy
                                      && !t.IsDeleted
                                      && !t.IsVoided
                                      && t.IsCurrent
                                      && t.ConsultationId == request.ConsultationId);

                if (healthyRecord != null)
                {
                    healthyRecord.Surface = null;
                    healthyRecord.ActiveSurface = null;
                    healthyRecord.IsCurrent = true;
                    healthyRecord.SupersededAt = null;
                    healthyRecord.SupersededByRecordId = null;
                    healthyRecord.Notes = string.IsNullOrWhiteSpace(tooth.Notes) ? null : tooth.Notes.Trim();
                    healthyRecord.PatientName = patientName;
                    healthyRecord.RecordedBy = staffName;
                    healthyRecord.UpdatedAt = recordTimestamp;
                    healthyRecord.UpdatedBy = staffName;
                    UpdateIfExisting(healthyRecord);
                }
                else
                {
                    healthyRecord = new DentalToothRecord
                    {
                        Id = Guid.NewGuid(),
                        TenantId = !string.IsNullOrWhiteSpace(_clinicContext.TenantId) ? _clinicContext.TenantId : patient.TenantId,
                        ClinicId = _clinicContext.ClinicId != Guid.Empty ? _clinicContext.ClinicId : patient.ClinicId,
                        PatientId = request.PatientId,
                        PatientName = patientName,
                        ConsultationId = request.ConsultationId,
                        ToothNumber = tooth.ToothNumber,
                        Status = ToothStatus.Healthy,
                        Surface = null,
                        ActiveSurface = null,
                        IsCurrent = true,
                        RecordedBy = staffName,
                        Notes = string.IsNullOrWhiteSpace(tooth.Notes) ? null : tooth.Notes.Trim(),
                        CreatedAt = recordTimestamp,
                        CreatedBy = staffName
                    };
                    await _toothRepo.AddAsync(healthyRecord, ct);
                    newlyAddedIds.Add(healthyRecord.Id);
                    existingTeeth.Add(healthyRecord);
                }

                var nonHealthy = existingTeeth
                    .Where(t => t.ToothNumber == tooth.ToothNumber && t.Status != ToothStatus.Healthy && !t.IsDeleted && !t.IsVoided)
                    .ToList();
                foreach (var nh in nonHealthy)
                {
                    nh.IsDeleted = true;
                    nh.DeletedAt = recordTimestamp;
                    nh.DeletedBy = staffName;
                    nh.IsCurrent = false;
                    nh.ActiveSurface = null;
                    nh.SupersededAt = recordTimestamp;
                    nh.SupersededByRecordId = healthyRecord.Id;
                    UpdateIfExisting(nh);
                }
                continue;
            }

            // Remove any active Healthy placeholders on this tooth
            var healthyPlaceholders = existingTeeth
                .Where(t => t.ToothNumber == tooth.ToothNumber && t.Status == ToothStatus.Healthy && !t.IsDeleted)
                .ToList();
            foreach (var h in healthyPlaceholders)
            {
                h.IsDeleted = true;
                h.IsCurrent = false;
                h.ActiveSurface = null;
                h.DeletedAt = recordTimestamp;
                h.DeletedBy = staffName;
                UpdateIfExisting(h);
            }

            // Only update in-place if the record belongs to the exact same ConsultationId
            var existingSameEncounter = existingTeeth
                .FirstOrDefault(t => t.ToothNumber == tooth.ToothNumber
                                  && t.Status == tooth.Status
                                  && !t.IsDeleted
                                  && !t.IsVoided
                                  && t.IsCurrent
                                  && t.ConsultationId == request.ConsultationId);

            if (existingSameEncounter != null)
            {
                existingSameEncounter.Surface = normalizedSurface;
                existingSameEncounter.ActiveSurface = effectiveActiveSurface;
                existingSameEncounter.IsCurrent = true;
                existingSameEncounter.SupersededAt = null;
                existingSameEncounter.SupersededByRecordId = null;
                existingSameEncounter.Notes = string.IsNullOrWhiteSpace(tooth.Notes) ? null : tooth.Notes.Trim();
                existingSameEncounter.PatientName = patientName;
                existingSameEncounter.RecordedBy = staffName;
                existingSameEncounter.UpdatedAt = recordTimestamp;
                existingSameEncounter.UpdatedBy = staffName;
                UpdateIfExisting(existingSameEncounter);
            }
            else
            {
                var newRecord = new DentalToothRecord
                {
                    Id = Guid.NewGuid(),
                    TenantId = !string.IsNullOrWhiteSpace(_clinicContext.TenantId) ? _clinicContext.TenantId : patient.TenantId,
                    ClinicId = _clinicContext.ClinicId != Guid.Empty ? _clinicContext.ClinicId : patient.ClinicId,
                    PatientId = request.PatientId,
                    PatientName = patientName,
                    ConsultationId = request.ConsultationId,
                    ToothNumber = tooth.ToothNumber,
                    Status = tooth.Status,
                    Surface = normalizedSurface,
                    ActiveSurface = effectiveActiveSurface,
                    IsCurrent = true,
                    RecordedBy = staffName,
                    Notes = string.IsNullOrWhiteSpace(tooth.Notes) ? null : tooth.Notes.Trim(),
                    CreatedAt = recordTimestamp,
                    CreatedBy = staffName
                };
                await _toothRepo.AddAsync(newRecord, ct);
                newlyAddedIds.Add(newRecord.Id);
                existingTeeth.Add(newRecord);
            }
        }

        // Recalculate stack state for every touched tooth
        foreach (var toothNumber in touchedToothNumbers)
        {
            var recordsForTooth = existingTeeth
                .Where(t => t.ToothNumber == toothNumber && !t.IsDeleted)
                .OrderBy(t => t.CreatedAt)
                .ToList();

            UpsertDentalToothRecordCommandHandler.RecalculateToothStack(recordsForTooth, now);

            foreach (var rec in recordsForTooth)
            {
                UpdateIfExisting(rec);
            }
        }

        // 5. Commit batch changes atomically
        await _unitOfWork.SaveChangesAsync(ct);

        // 6. Return refreshed chart via query handler
        return await _sender.Send(new GetPatientDentalChartQuery(request.PatientId, request.ConsultationId), ct);
    }
}
