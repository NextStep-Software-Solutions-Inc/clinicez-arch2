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
            .Query(p => p.ClinicId == _clinicContext.ClinicId && p.Id == request.PatientId && !p.IsDeleted)
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
            .ToListAsync(ct);

        // 3. Deduplicate batch inputs per tooth while preserving distinct conditions:
        // Group by (ToothNumber, Status) so distinct statuses on the same tooth are preserved.
        // If an item has Healthy, it clears previous conditions on that tooth.
        // If multiple items on the same tooth have the exact same surface (e.g. Decay on "m" then Filled on "m"), the last one wins.
        var processedInputs = new List<ToothRecordInput>();
        var toothGroups = request.Teeth.GroupBy(t => t.ToothNumber);

        foreach (var group in toothGroups)
        {
            var list = group.ToList();
            var lastHealthyIdx = list.FindLastIndex(t => t.Status == ToothStatus.Healthy);
            var lastNonHealthyIdx = list.FindLastIndex(t => t.Status != ToothStatus.Healthy);

            if (lastHealthyIdx > lastNonHealthyIdx)
            {
                // The final intent for this tooth was Healthy!
                processedInputs.Add(list[lastHealthyIdx]);
            }
            else
            {
                // Non-healthy conditions: ignore any Healthy items that came before the non-healthy items
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
        void UpdateIfExisting(DentalToothRecord record)
        {
            if (!newlyAddedIds.Contains(record.Id))
            {
                _toothRepo.Update(record);
            }
        }

        foreach (var tooth in processedInputs)
        {
            var rawNormalizedSurface = UpsertDentalToothRecordCommandHandler.NormalizeAndSortSurfaces(tooth.Surface);
            var (normalizedSurface, effectiveActiveSurface) = UpsertDentalToothRecordCommandHandler.ResolveEffectiveSurfaces(tooth.Status, rawNormalizedSurface);

            // Case A: RemoveCondition == true
            if (tooth.RemoveCondition)
            {
                var matches = existingTeeth
                    .Where(t => t.ToothNumber == tooth.ToothNumber && t.Status == tooth.Status && !t.IsDeleted)
                    .ToList();
                foreach (var m in matches)
                {
                    m.IsDeleted = true;
                    m.IsCurrent = false;
                    m.ActiveSurface = null;
                    m.DeletedAt = now;
                    m.DeletedBy = staffName;
                    UpdateIfExisting(m);
                }
                continue;
            }

            // Case B: Status == ToothStatus.Healthy
            if (tooth.Status == ToothStatus.Healthy)
            {
                var healthyRecord = existingTeeth
                    .FirstOrDefault(t => t.ToothNumber == tooth.ToothNumber && t.Status == ToothStatus.Healthy && !t.IsDeleted && t.IsCurrent);

                if (healthyRecord != null)
                {
                    healthyRecord.Surface = null;
                    healthyRecord.ActiveSurface = null;
                    healthyRecord.IsCurrent = true;
                    healthyRecord.SupersededAt = null;
                    healthyRecord.SupersededByRecordId = null;
                    healthyRecord.Notes = string.IsNullOrWhiteSpace(tooth.Notes) ? null : tooth.Notes.Trim();
                    if (request.ConsultationId.HasValue)
                    {
                        healthyRecord.ConsultationId = request.ConsultationId.Value;
                    }
                    healthyRecord.PatientName = patientName;
                    healthyRecord.RecordedBy = staffName;
                    healthyRecord.UpdatedAt = now;
                    healthyRecord.UpdatedBy = staffName;
                    UpdateIfExisting(healthyRecord);
                }
                else
                {
                    healthyRecord = new DentalToothRecord
                    {
                        Id = Guid.NewGuid(),
                        TenantId = _clinicContext.TenantId,
                        ClinicId = _clinicContext.ClinicId,
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
                        CreatedAt = now,
                        CreatedBy = staffName
                    };
                    await _toothRepo.AddAsync(healthyRecord, ct);
                    newlyAddedIds.Add(healthyRecord.Id);
                    existingTeeth.Add(healthyRecord);
                }

                var nonHealthy = existingTeeth
                    .Where(t => t.ToothNumber == tooth.ToothNumber && t.Status != ToothStatus.Healthy && !t.IsDeleted)
                    .ToList();
                foreach (var nh in nonHealthy)
                {
                    nh.IsCurrent = false;
                    nh.ActiveSurface = null;
                    nh.SupersededAt = now;
                    nh.SupersededByRecordId = healthyRecord.Id;
                    if (nh.ConsultationId == request.ConsultationId)
                    {
                        nh.IsDeleted = true;
                        nh.DeletedAt = now;
                        nh.DeletedBy = staffName;
                    }
                    UpdateIfExisting(nh);
                }
                continue;
            }

            // Guard: If tooth is currently Missing, block Decay/Filled/Crown/Extraction unless tooth is first reset to Healthy or Missing is removed
            var activeMissing = existingTeeth
                .FirstOrDefault(t => t.ToothNumber == tooth.ToothNumber && t.Status == ToothStatus.Missing && !t.IsDeleted && t.IsCurrent);
            if (activeMissing != null && tooth.Status != ToothStatus.Missing)
            {
                throw new BadRequestException(
                    $"Tooth '{tooth.ToothNumber}' is currently marked as Missing. Mark the tooth as Healthy or remove the Missing condition before recording '{tooth.Status}'.");
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
                h.DeletedAt = now;
                h.DeletedBy = staffName;
                UpdateIfExisting(h);
            }

            // Case C: Missing (supersedes all prior conditions on this tooth)
            if (tooth.Status == ToothStatus.Missing)
            {
                var missingRecord = activeMissing;
                if (missingRecord != null)
                {
                    missingRecord.Surface = null;
                    missingRecord.ActiveSurface = null;
                    missingRecord.IsCurrent = true;
                    missingRecord.Notes = string.IsNullOrWhiteSpace(tooth.Notes) ? null : tooth.Notes.Trim();
                    if (request.ConsultationId.HasValue)
                    {
                        missingRecord.ConsultationId = request.ConsultationId.Value;
                    }
                    missingRecord.PatientName = patientName;
                    missingRecord.RecordedBy = staffName;
                    missingRecord.UpdatedAt = now;
                    missingRecord.UpdatedBy = staffName;
                    UpdateIfExisting(missingRecord);
                }
                else
                {
                    missingRecord = new DentalToothRecord
                    {
                        Id = Guid.NewGuid(),
                        TenantId = _clinicContext.TenantId,
                        ClinicId = _clinicContext.ClinicId,
                        PatientId = request.PatientId,
                        PatientName = patientName,
                        ConsultationId = request.ConsultationId,
                        ToothNumber = tooth.ToothNumber,
                        Status = ToothStatus.Missing,
                        Surface = null,
                        ActiveSurface = null,
                        IsCurrent = true,
                        RecordedBy = staffName,
                        Notes = string.IsNullOrWhiteSpace(tooth.Notes) ? null : tooth.Notes.Trim(),
                        CreatedAt = now,
                        CreatedBy = staffName
                    };
                    await _toothRepo.AddAsync(missingRecord, ct);
                    newlyAddedIds.Add(missingRecord.Id);
                    existingTeeth.Add(missingRecord);
                }

                foreach (var prior in existingTeeth.Where(t => t.ToothNumber == tooth.ToothNumber && t.Status != ToothStatus.Healthy && t.Status != ToothStatus.Missing && !t.IsDeleted && t.IsCurrent))
                {
                    prior.IsCurrent = false;
                    prior.ActiveSurface = null;
                    prior.SupersededAt = now;
                    prior.SupersededByRecordId = missingRecord.Id;
                    UpdateIfExisting(prior);
                }
                continue;
            }

            // Case D: Extraction (whole-tooth status; supersedes prior conditions on this tooth)
            if (tooth.Status == ToothStatus.Extraction)
            {
                var extractionRecord = existingTeeth
                    .FirstOrDefault(t => t.ToothNumber == tooth.ToothNumber && t.Status == ToothStatus.Extraction && !t.IsDeleted && t.IsCurrent);
                if (extractionRecord != null)
                {
                    extractionRecord.Surface = null;
                    extractionRecord.ActiveSurface = null;
                    extractionRecord.IsCurrent = true;
                    extractionRecord.Notes = string.IsNullOrWhiteSpace(tooth.Notes) ? null : tooth.Notes.Trim();
                    if (request.ConsultationId.HasValue)
                    {
                        extractionRecord.ConsultationId = request.ConsultationId.Value;
                    }
                    extractionRecord.PatientName = patientName;
                    extractionRecord.RecordedBy = staffName;
                    extractionRecord.UpdatedAt = now;
                    extractionRecord.UpdatedBy = staffName;
                    UpdateIfExisting(extractionRecord);
                }
                else
                {
                    extractionRecord = new DentalToothRecord
                    {
                        Id = Guid.NewGuid(),
                        TenantId = _clinicContext.TenantId,
                        ClinicId = _clinicContext.ClinicId,
                        PatientId = request.PatientId,
                        PatientName = patientName,
                        ConsultationId = request.ConsultationId,
                        ToothNumber = tooth.ToothNumber,
                        Status = ToothStatus.Extraction,
                        Surface = null,
                        ActiveSurface = null,
                        IsCurrent = true,
                        RecordedBy = staffName,
                        Notes = string.IsNullOrWhiteSpace(tooth.Notes) ? null : tooth.Notes.Trim(),
                        CreatedAt = now,
                        CreatedBy = staffName
                    };
                    await _toothRepo.AddAsync(extractionRecord, ct);
                    newlyAddedIds.Add(extractionRecord.Id);
                    existingTeeth.Add(extractionRecord);
                }

                foreach (var prior in existingTeeth.Where(t => t.ToothNumber == tooth.ToothNumber && t.Status != ToothStatus.Healthy && t.Status != ToothStatus.Extraction && !t.IsDeleted && t.IsCurrent))
                {
                    prior.IsCurrent = false;
                    prior.ActiveSurface = null;
                    prior.SupersededAt = now;
                    prior.SupersededByRecordId = extractionRecord.Id;
                    UpdateIfExisting(prior);
                }
                continue;
            }

            // Case E: Surface-scoped condition (Decay, Filled, Crown)
            var existing = existingTeeth
                .FirstOrDefault(t => t.ToothNumber == tooth.ToothNumber
                                  && t.Status == tooth.Status
                                  && !t.IsDeleted
                                  && t.IsCurrent
                                  && (t.ConsultationId == request.ConsultationId || !t.ConsultationId.HasValue || !request.ConsultationId.HasValue));

            if (existing != null)
            {
                existing.Surface = normalizedSurface;
                existing.ActiveSurface = effectiveActiveSurface;
                existing.IsCurrent = true;
                existing.SupersededAt = null;
                existing.SupersededByRecordId = null;
                existing.Notes = string.IsNullOrWhiteSpace(tooth.Notes) ? null : tooth.Notes.Trim();
                if (request.ConsultationId.HasValue)
                {
                    existing.ConsultationId = request.ConsultationId.Value;
                }
                existing.PatientName = patientName;
                existing.RecordedBy = staffName;
                existing.UpdatedAt = now;
                existing.UpdatedBy = staffName;
                UpdateIfExisting(existing);
            }
            else
            {
                existing = new DentalToothRecord
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
                    ActiveSurface = effectiveActiveSurface,
                    IsCurrent = true,
                    RecordedBy = staffName,
                    Notes = string.IsNullOrWhiteSpace(tooth.Notes) ? null : tooth.Notes.Trim(),
                    CreatedAt = now,
                    CreatedBy = staffName
                };
                await _toothRepo.AddAsync(existing, ct);
                newlyAddedIds.Add(existing.Id);
                existingTeeth.Add(existing);
            }

            foreach (var ext in existingTeeth.Where(t => t.ToothNumber == tooth.ToothNumber && t.Status == ToothStatus.Extraction && !t.IsDeleted && t.IsCurrent))
            {
                ext.IsCurrent = false;
                ext.ActiveSurface = null;
                ext.SupersededAt = now;
                ext.SupersededByRecordId = existing.Id;
                UpdateIfExisting(ext);
            }

            if (!string.IsNullOrWhiteSpace(effectiveActiveSurface))
            {
                foreach (var other in existingTeeth.Where(t => t.ToothNumber == tooth.ToothNumber
                                                            && t.Id != existing.Id
                                                            && !t.IsDeleted
                                                            && t.IsCurrent
                                                            && (t.Status == ToothStatus.Decay || t.Status == ToothStatus.Filled || t.Status == ToothStatus.Crown)))
                {
                    var priorActive = other.ActiveSurface ?? (other.Status == ToothStatus.Crown && string.IsNullOrWhiteSpace(other.Surface) ? "MODBL" : other.Surface);
                    var remaining = UpsertDentalToothRecordCommandHandler.SubtractSurfaces(priorActive, effectiveActiveSurface);
                    other.ActiveSurface = remaining;
                    if (string.IsNullOrWhiteSpace(remaining))
                    {
                        other.IsCurrent = false;
                        other.SupersededAt = now;
                        other.SupersededByRecordId = existing.Id;
                    }
                    UpdateIfExisting(other);
                }
            }
        }

        // 5. Commit batch changes atomically
        await _unitOfWork.SaveChangesAsync(ct);

        // 6. Return refreshed chart via query handler
        return await _sender.Send(new GetPatientDentalChartQuery(request.PatientId, request.ConsultationId), ct);
    }
}
