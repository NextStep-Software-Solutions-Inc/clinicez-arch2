using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Dental.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Dental.Commands;

public sealed record UpsertDentalToothRecordCommand(
    Guid PatientId,
    int ToothNumber,
    ToothStatus Status,
    string? Surface = null,
    string? Notes = null,
    Guid? ConsultationId = null,
    bool RemoveCondition = false
) : IRequest<DentalToothRecordDto>;

public sealed class UpsertDentalToothRecordCommandHandler : IRequestHandler<UpsertDentalToothRecordCommand, DentalToothRecordDto>
{
    private readonly IRepository<DentalToothRecord> _toothRepo;
    private readonly IRepository<Patient> _patientRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public UpsertDentalToothRecordCommandHandler(
        IRepository<DentalToothRecord> toothRepo,
        IRepository<Patient> patientRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _toothRepo = toothRepo ?? throw new ArgumentNullException(nameof(toothRepo));
        _patientRepo = patientRepo ?? throw new ArgumentNullException(nameof(patientRepo));
        _unitOfWork = unitOfWork ?? throw new ArgumentNullException(nameof(unitOfWork));
        _clinicContext = clinicContext ?? throw new ArgumentNullException(nameof(clinicContext));
    }

    public async Task<DentalToothRecordDto> Handle(UpsertDentalToothRecordCommand request, CancellationToken ct)
    {
        if (request.PatientId == Guid.Empty)
        {
            throw new BadRequestException("PatientId is required.");
        }

        ValidateToothNumber(request.ToothNumber);
        var rawNormalizedSurface = NormalizeAndSortSurfaces(request.Surface);
        var (normalizedSurface, effectiveActiveSurface) = ResolveEffectiveSurfaces(request.Status, rawNormalizedSurface);

        var patient = await _patientRepo
            .Query(p => p.ClinicId == _clinicContext.ClinicId && p.Id == request.PatientId && !p.IsDeleted)
            .FirstOrDefaultAsync(ct);

        if (patient == null)
        {
            throw new NotFoundException($"Patient '{request.PatientId}' not found.");
        }

        var patientName = $"{patient.LastName}, {patient.FirstName}".Trim();
        var staffName = _clinicContext.StaffName ?? "Staff";
        var now = DateTime.UtcNow;

        // Case 1: Explicit removal of a condition on this tooth
        if (request.RemoveCondition)
        {
            var allToothRecords = await _toothRepo
                .Query(t => t.ClinicId == _clinicContext.ClinicId
                         && t.PatientId == request.PatientId
                         && t.ToothNumber == request.ToothNumber
                         && !t.IsDeleted)
                .OrderBy(t => t.CreatedAt)
                .ToListAsync(ct);

            var conditionRecords = allToothRecords
                .Where(t => t.Status == request.Status
                         && (!request.ConsultationId.HasValue || t.ConsultationId == request.ConsultationId))
                .ToList();

            if (conditionRecords.Count == 0)
            {
                conditionRecords = allToothRecords
                    .Where(t => t.Status == request.Status && t.IsCurrent)
                    .ToList();
            }

            foreach (var record in conditionRecords)
            {
                record.IsDeleted = true;
                record.IsCurrent = false;
                record.ActiveSurface = null;
                record.DeletedAt = now;
                record.DeletedBy = staffName;
            }

            RecalculateToothStack(allToothRecords, now);

            foreach (var record in allToothRecords)
            {
                _toothRepo.Update(record);
            }

            await _unitOfWork.SaveChangesAsync(ct);

            var deletedRecord = conditionRecords.FirstOrDefault();
            return MapToDto(
                deletedRecord,
                _clinicContext.TenantId,
                _clinicContext.ClinicId,
                request.PatientId,
                request.ConsultationId,
                request.ToothNumber,
                request.Status,
                normalizedSurface,
                request.Notes,
                now,
                patientName,
                staffName);
        }

        var activeConditions = await _toothRepo
            .Query(t => t.ClinicId == _clinicContext.ClinicId
                     && t.PatientId == request.PatientId
                     && t.ToothNumber == request.ToothNumber
                     && !t.IsDeleted)
            .OrderBy(t => t.CreatedAt)
            .ToListAsync(ct);

        // Case 2: Marking tooth as Healthy (resets active non-healthy conditions on this tooth)
        if (request.Status == ToothStatus.Healthy)
        {
            var healthyRecord = activeConditions.FirstOrDefault(c => c.Status == ToothStatus.Healthy && !c.IsVoided && c.IsCurrent && c.ConsultationId == request.ConsultationId);
            if (healthyRecord != null)
            {
                healthyRecord.Surface = null;
                healthyRecord.ActiveSurface = null;
                healthyRecord.IsCurrent = true;
                healthyRecord.SupersededAt = null;
                healthyRecord.SupersededByRecordId = null;
                healthyRecord.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
                healthyRecord.PatientName = patientName;
                healthyRecord.RecordedBy = staffName;
                healthyRecord.UpdatedAt = now;
                healthyRecord.UpdatedBy = staffName;
                _toothRepo.Update(healthyRecord);
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
                    ToothNumber = request.ToothNumber,
                    Status = ToothStatus.Healthy,
                    Surface = null,
                    ActiveSurface = null,
                    IsCurrent = true,
                    RecordedBy = staffName,
                    Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
                    CreatedAt = now,
                    CreatedBy = staffName
                };
                await _toothRepo.AddAsync(healthyRecord, ct);
                activeConditions.Add(healthyRecord);
            }

            foreach (var cond in activeConditions.Where(c => c.Status != ToothStatus.Healthy && !c.IsVoided))
            {
                cond.IsDeleted = true;
                cond.DeletedAt = now;
                cond.DeletedBy = staffName;
                cond.IsCurrent = false;
                cond.ActiveSurface = null;
                cond.SupersededAt = now;
                cond.SupersededByRecordId = healthyRecord.Id;
                if (cond.Id != healthyRecord.Id)
                {
                    _toothRepo.Update(cond);
                }
            }

            await _unitOfWork.SaveChangesAsync(ct);
            return MapToDto(healthyRecord);
        }

        // Guard: Same-encounter status conflict prevention
        // When a tooth or surface already has a condition recorded in the current encounter (ConsultationId),
        // another conflicting status cannot be added to that same tooth or surface in the same encounter.
        if (request.ConsultationId.HasValue)
        {
            var sameEncounterConflicts = activeConditions
                .Where(c => c.IsCurrent
                         && !c.IsVoided
                         && c.Status != ToothStatus.Healthy
                         && c.Status != request.Status
                         && c.ConsultationId.HasValue
                         && c.ConsultationId.Value == request.ConsultationId.Value)
                .ToList();

            foreach (var sameEnc in sameEncounterConflicts)
            {
                bool existingIsWholeTooth = IsWholeToothCondition(sameEnc.Status, sameEnc.Surface);
                bool incomingIsWholeTooth = IsWholeToothCondition(request.Status, normalizedSurface);
                var existingSurf = sameEnc.ActiveSurface ?? sameEnc.Surface;
                if (existingIsWholeTooth || incomingIsWholeTooth || HasSurfaceOverlap(existingSurf, effectiveActiveSurface))
                {
                    throw new BadRequestException(
                        $"Tooth '{request.ToothNumber}' already has '{sameEnc.Status}' recorded in the current encounter on overlapping surface(s). Remove the current-encounter condition first, or record the new status in a subsequent encounter.");
                }
            }
        }

        // Soft-delete any active Healthy placeholder records on this tooth
        foreach (var h in activeConditions.Where(c => c.Status == ToothStatus.Healthy && !c.IsDeleted))
        {
            h.IsDeleted = true;
            h.IsCurrent = false;
            h.ActiveSurface = null;
            h.DeletedAt = now;
            h.DeletedBy = staffName;
            _toothRepo.Update(h);
        }

        // Only update an existing record in-place if it belongs to the exact same encounter (ConsultationId)
        var existingSameEncounter = activeConditions
            .FirstOrDefault(t => !t.IsDeleted
                              && !t.IsVoided
                              && t.IsCurrent
                              && t.Status == request.Status
                              && t.ConsultationId == request.ConsultationId);

        DentalToothRecord targetRecord;
        bool isNewRecord = false;

        var maxExisting = activeConditions.Count > 0 ? activeConditions.Max(r => r.CreatedAt) : DateTime.MinValue;
        var recordCreatedAt = now > maxExisting ? now : maxExisting.AddMilliseconds(1);

        if (existingSameEncounter != null)
        {
            existingSameEncounter.Surface = normalizedSurface;
            existingSameEncounter.ActiveSurface = effectiveActiveSurface;
            existingSameEncounter.IsCurrent = true;
            existingSameEncounter.SupersededAt = null;
            existingSameEncounter.SupersededByRecordId = null;
            existingSameEncounter.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
            existingSameEncounter.PatientName = patientName;
            existingSameEncounter.RecordedBy = staffName;
            existingSameEncounter.UpdatedAt = recordCreatedAt;
            existingSameEncounter.UpdatedBy = staffName;
            targetRecord = existingSameEncounter;
        }
        else
        {
            targetRecord = new DentalToothRecord
            {
                Id = Guid.NewGuid(),
                TenantId = _clinicContext.TenantId,
                ClinicId = _clinicContext.ClinicId,
                PatientId = request.PatientId,
                PatientName = patientName,
                ConsultationId = request.ConsultationId,
                ToothNumber = request.ToothNumber,
                Status = request.Status,
                Surface = normalizedSurface,
                ActiveSurface = effectiveActiveSurface,
                IsCurrent = true,
                RecordedBy = staffName,
                Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
                CreatedAt = recordCreatedAt,
                CreatedBy = staffName
            };
            await _toothRepo.AddAsync(targetRecord, ct);
            activeConditions.Add(targetRecord);
            isNewRecord = true;
        }

        RecalculateToothStack(activeConditions, now);

        foreach (var rec in activeConditions)
        {
            if (isNewRecord && rec.Id == targetRecord.Id)
                continue;
            _toothRepo.Update(rec);
        }

        await _unitOfWork.SaveChangesAsync(ct);

        return MapToDto(targetRecord);
    }

    public static void RecalculateToothStack(IList<DentalToothRecord> toothRecords, DateTime now)
    {
        if (toothRecords == null || toothRecords.Count == 0)
            return;

        foreach (var v in toothRecords.Where(r => r.IsVoided || r.IsDeleted))
        {
            v.IsCurrent = false;
            v.ActiveSurface = null;
        }

        var ordered = toothRecords
            .Where(r => !r.IsDeleted && !r.IsVoided)
            .OrderBy(r => r.CreatedAt)
            .ToList();

        foreach (var r in ordered)
        {
            var rawSurf = NormalizeAndSortSurfaces(r.Surface);
            var (_, effActive) = ResolveEffectiveSurfaces(r.Status, rawSurf);
            r.ActiveSurface = effActive;
            r.IsCurrent = true;
            r.SupersededAt = null;
            r.SupersededByRecordId = null;
        }

        for (int i = 0; i < ordered.Count; i++)
        {
            var current = ordered[i];
            var supersedeTime = current.CreatedAt != default ? current.CreatedAt : now;

            if (current.Status == ToothStatus.Healthy
                || current.Status == ToothStatus.Missing
                || IsWholeToothNonMissingStatus(current.Status))
            {
                for (int j = 0; j < i; j++)
                {
                    var prior = ordered[j];
                    if (prior.IsCurrent)
                    {
                        prior.IsCurrent = false;
                        prior.ActiveSurface = null;
                        prior.SupersededAt ??= supersedeTime;
                        prior.SupersededByRecordId ??= current.Id;
                    }
                }
                continue;
            }

            if (IsSurfaceScopedStatus(current.Status))
            {
                var incomingActive = current.ActiveSurface;
                for (int j = 0; j < i; j++)
                {
                    var prior = ordered[j];
                    if (!prior.IsCurrent) continue;

                    if (prior.Status == ToothStatus.Healthy
                        || prior.Status == ToothStatus.Missing
                        || IsWholeToothNonMissingStatus(prior.Status))
                    {
                        prior.IsCurrent = false;
                        prior.ActiveSurface = null;
                        prior.SupersededAt ??= supersedeTime;
                        prior.SupersededByRecordId ??= current.Id;
                        continue;
                    }

                    if (IsSurfaceScopedStatus(prior.Status) && !string.IsNullOrWhiteSpace(incomingActive))
                    {
                        var remaining = SubtractSurfaces(prior.ActiveSurface, incomingActive);
                        prior.ActiveSurface = remaining;
                        if (string.IsNullOrWhiteSpace(remaining))
                        {
                            prior.IsCurrent = false;
                            prior.SupersededAt = supersedeTime;
                            prior.SupersededByRecordId = current.Id;
                        }
                    }
                }
            }
        }
    }

    public static DentalToothRecordDto MapToDto(DentalToothRecord record)
    {
        var effectiveActive = record.IsCurrent && !record.IsVoided
            ? (record.ActiveSurface ?? record.Surface)
            : null;

        return new DentalToothRecordDto(
            record.Id,
            record.TenantId,
            record.ClinicId,
            record.PatientId,
            record.ConsultationId,
            record.ToothNumber,
            record.Status,
            record.Surface,
            record.Notes,
            record.CreatedAt,
            record.UpdatedAt,
            record.PatientName,
            record.RecordedBy ?? record.UpdatedBy ?? record.CreatedBy,
            effectiveActive,
            record.IsCurrent && !record.IsVoided,
            record.SupersededAt,
            record.SupersededByRecordId,
            record.IsVoided,
            record.VoidedAt,
            record.VoidedBy,
            record.VoidReason
        );
    }

    private static DentalToothRecordDto MapToDto(
        DentalToothRecord? deletedRecord,
        string tenantId,
        Guid clinicId,
        Guid patientId,
        Guid? consultationId,
        int toothNumber,
        ToothStatus status,
        string? surface,
        string? notes,
        DateTime now,
        string patientName,
        string staffName)
    {
        return new DentalToothRecordDto(
            deletedRecord?.Id ?? Guid.NewGuid(),
            tenantId,
            clinicId,
            patientId,
            consultationId,
            toothNumber,
            status,
            surface,
            notes,
            deletedRecord?.CreatedAt ?? now,
            now,
            patientName,
            staffName,
            ActiveSurface: null,
            IsCurrent: false,
            SupersededAt: now,
            SupersededByRecordId: null
        );
    }

    public static bool IsWholeToothNonMissingStatus(ToothStatus status) =>
        status is ToothStatus.ForExtraction
               or ToothStatus.Impacted
               or ToothStatus.RootCanal
               or ToothStatus.Implant;

    public static bool IsSurfaceScopedStatus(ToothStatus status) =>
        status is ToothStatus.Decayed
               or ToothStatus.Filled
               or ToothStatus.Crowned
               or ToothStatus.Sealant
               or ToothStatus.Fractured;

    public static bool IsWholeToothCondition(ToothStatus status, string? normalizedSurface)
    {
        if (status == ToothStatus.Healthy || status == ToothStatus.Missing || IsWholeToothNonMissingStatus(status))
            return true;
        if (status == ToothStatus.Crowned && (string.IsNullOrWhiteSpace(normalizedSurface) || normalizedSurface == "MODBL"))
            return true;
        return false;
    }

    public static bool HasSurfaceOverlap(string? surfaceA, string? surfaceB)
    {
        var normA = NormalizeAndSortSurfaces(surfaceA);
        var normB = NormalizeAndSortSurfaces(surfaceB);
        if (string.IsNullOrWhiteSpace(normA) || string.IsNullOrWhiteSpace(normB))
            return false;
        return normA.Any(c => normB.Contains(c));
    }

    public static (string? NormalizedSurface, string? EffectiveActiveSurface) ResolveEffectiveSurfaces(ToothStatus status, string? normalizedSurface)
    {
        return status switch
        {
            ToothStatus.Healthy or ToothStatus.Missing or ToothStatus.ForExtraction or ToothStatus.Impacted or ToothStatus.RootCanal or ToothStatus.Implant => (null, null),
            ToothStatus.Crowned => (normalizedSurface, normalizedSurface ?? "MODBL"),
            ToothStatus.Decayed or ToothStatus.Filled or ToothStatus.Sealant or ToothStatus.Fractured => (normalizedSurface, normalizedSurface ?? "O"),
            _ => (normalizedSurface, normalizedSurface)
        };
    }

    public static string? SubtractSurfaces(string? currentSurface, string? subtractSurface)
    {
        var normCurrent = NormalizeAndSortSurfaces(currentSurface);
        if (string.IsNullOrWhiteSpace(normCurrent))
            return null;

        var normSubtract = NormalizeAndSortSurfaces(subtractSurface);
        if (string.IsNullOrWhiteSpace(normSubtract))
            return normCurrent;

        var remaining = normCurrent.Where(c => !normSubtract.Contains(c)).ToArray();
        return remaining.Length == 0 ? null : new string(remaining);
    }

    /// <summary>
    /// Validates tooth number under FDI World Dental Federation notation (ISO 3950).
    /// Adult teeth: 11-18, 21-28, 31-38, 41-48.
    /// Primary/Child teeth: 51-55, 61-65, 71-75, 81-85.
    /// </summary>
    public static void ValidateToothNumber(int toothNumber)
    {
        bool isValid = (toothNumber >= 11 && toothNumber <= 18)
                    || (toothNumber >= 21 && toothNumber <= 28)
                    || (toothNumber >= 31 && toothNumber <= 38)
                    || (toothNumber >= 41 && toothNumber <= 48)
                    || (toothNumber >= 51 && toothNumber <= 55)
                    || (toothNumber >= 61 && toothNumber <= 65)
                    || (toothNumber >= 71 && toothNumber <= 75)
                    || (toothNumber >= 81 && toothNumber <= 85);

        if (!isValid)
        {
            throw new BadRequestException(
                $"Tooth number '{toothNumber}' is invalid under ISO 3950 FDI notation. Valid numbers are 11-48 for adult teeth and 51-85 for child teeth.");
        }
    }

    /// <summary>
    /// Normalizes tooth surfaces and sorts them into canonical [MODBL] order:
    /// M (Mesial) -> O (Occlusal/Incisal) -> D (Distal) -> B (Buccal/Facial) -> L (Lingual/Palatal).
    /// Whitespace is stripped, duplicate characters are collapsed, and invalid characters throw BadRequestException.
    /// </summary>
    public static string? NormalizeAndSortSurfaces(string? surface)
    {
        if (string.IsNullOrWhiteSpace(surface))
            return null;

        const string canonicalOrder = "MODBL";
        var cleaned = surface.Trim().ToUpperInvariant();
        var present = new HashSet<char>();

        foreach (var c in cleaned)
        {
            if (char.IsWhiteSpace(c))
                continue;

            if (!canonicalOrder.Contains(c))
            {
                throw new BadRequestException($"Invalid tooth surface '{surface}'. Valid surface characters are M, O, D, B, L.");
            }

            present.Add(c);
        }

        if (present.Count == 0)
            return null;

        var sortedChars = canonicalOrder.Where(present.Contains).ToArray();
        return new string(sortedChars);
    }
}
