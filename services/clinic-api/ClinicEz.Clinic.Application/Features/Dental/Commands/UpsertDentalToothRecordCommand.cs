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
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public UpsertDentalToothRecordCommandHandler(
        IRepository<DentalToothRecord> toothRepo,
        IRepository<ClinicPatient> patientRepo,
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
            var conditionRecords = await _toothRepo
                .Query(t => t.ClinicId == _clinicContext.ClinicId
                         && t.PatientId == request.PatientId
                         && t.ToothNumber == request.ToothNumber
                         && t.Status == request.Status
                         && !t.IsDeleted)
                .ToListAsync(ct);

            foreach (var record in conditionRecords)
            {
                record.IsDeleted = true;
                record.IsCurrent = false;
                record.ActiveSurface = null;
                record.DeletedAt = now;
                record.DeletedBy = staffName;
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
            .ToListAsync(ct);

        // Case 2: Marking tooth as Healthy (resets active non-healthy conditions on this tooth)
        if (request.Status == ToothStatus.Healthy)
        {
            var healthyRecord = activeConditions.FirstOrDefault(c => c.Status == ToothStatus.Healthy && c.IsCurrent);
            if (healthyRecord != null)
            {
                healthyRecord.Surface = null;
                healthyRecord.ActiveSurface = null;
                healthyRecord.IsCurrent = true;
                healthyRecord.SupersededAt = null;
                healthyRecord.SupersededByRecordId = null;
                healthyRecord.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
                if (request.ConsultationId.HasValue)
                {
                    healthyRecord.ConsultationId = request.ConsultationId.Value;
                }
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
            }

            foreach (var cond in activeConditions.Where(c => c.Status != ToothStatus.Healthy))
            {
                cond.IsCurrent = false;
                cond.ActiveSurface = null;
                cond.SupersededAt = now;
                cond.SupersededByRecordId = healthyRecord.Id;
                if (cond.ConsultationId == request.ConsultationId)
                {
                    cond.IsDeleted = true;
                    cond.DeletedAt = now;
                    cond.DeletedBy = staffName;
                }
                _toothRepo.Update(cond);
            }

            await _unitOfWork.SaveChangesAsync(ct);
            return MapToDto(healthyRecord);
        }

        // Guard: If tooth is currently Missing, block Decay/Filled/Crown/Extraction unless tooth is first reset to Healthy or Missing is removed
        var activeMissing = activeConditions.FirstOrDefault(c => c.Status == ToothStatus.Missing && c.IsCurrent);
        if (activeMissing != null && request.Status != ToothStatus.Missing)
        {
            throw new BadRequestException(
                $"Tooth '{request.ToothNumber}' is currently marked as Missing. Mark the tooth as Healthy or remove the Missing condition before recording '{request.Status}'.");
        }

        // Guard: Same-encounter status conflict prevention
        // When a tooth or surface already has a condition recorded in the current encounter (ConsultationId),
        // another conflicting status cannot be added to that same tooth or surface in the same encounter.
        if (request.ConsultationId.HasValue)
        {
            var sameEncounterConflicts = activeConditions
                .Where(c => c.IsCurrent
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
        foreach (var h in activeConditions.Where(c => c.Status == ToothStatus.Healthy))
        {
            h.IsDeleted = true;
            h.IsCurrent = false;
            h.ActiveSurface = null;
            h.DeletedAt = now;
            h.DeletedBy = staffName;
            _toothRepo.Update(h);
        }

        // Case 3: Saving Missing (whole-tooth terminal extraction/absence supersedes all prior conditions on this tooth)
        if (request.Status == ToothStatus.Missing)
        {
            var missingRecord = activeMissing;
            if (missingRecord != null)
            {
                missingRecord.Surface = null;
                missingRecord.ActiveSurface = null;
                missingRecord.IsCurrent = true;
                missingRecord.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
                if (request.ConsultationId.HasValue)
                {
                    missingRecord.ConsultationId = request.ConsultationId.Value;
                }
                missingRecord.PatientName = patientName;
                missingRecord.RecordedBy = staffName;
                missingRecord.UpdatedAt = now;
                missingRecord.UpdatedBy = staffName;
                _toothRepo.Update(missingRecord);
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
                    ToothNumber = request.ToothNumber,
                    Status = ToothStatus.Missing,
                    Surface = null,
                    ActiveSurface = null,
                    IsCurrent = true,
                    RecordedBy = staffName,
                    Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
                    CreatedAt = now,
                    CreatedBy = staffName
                };
                await _toothRepo.AddAsync(missingRecord, ct);
            }

            foreach (var prior in activeConditions.Where(c => c.Status != ToothStatus.Healthy && c.Status != ToothStatus.Missing && c.IsCurrent))
            {
                prior.IsCurrent = false;
                prior.ActiveSurface = null;
                prior.SupersededAt = now;
                prior.SupersededByRecordId = missingRecord.Id;
                _toothRepo.Update(prior);
            }

            await _unitOfWork.SaveChangesAsync(ct);
            return MapToDto(missingRecord);
        }

        // Case 4: Saving whole-tooth non-missing status (ForExtraction, Impacted, RootCanal, Implant; supersedes prior-encounter conditions on this tooth)
        if (IsWholeToothNonMissingStatus(request.Status))
        {
            var wholeToothRecord = activeConditions.FirstOrDefault(c => c.Status == request.Status && c.IsCurrent);
            if (wholeToothRecord != null)
            {
                wholeToothRecord.Surface = null;
                wholeToothRecord.ActiveSurface = null;
                wholeToothRecord.IsCurrent = true;
                wholeToothRecord.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
                if (request.ConsultationId.HasValue)
                {
                    wholeToothRecord.ConsultationId = request.ConsultationId.Value;
                }
                wholeToothRecord.PatientName = patientName;
                wholeToothRecord.RecordedBy = staffName;
                wholeToothRecord.UpdatedAt = now;
                wholeToothRecord.UpdatedBy = staffName;
                _toothRepo.Update(wholeToothRecord);
            }
            else
            {
                wholeToothRecord = new DentalToothRecord
                {
                    Id = Guid.NewGuid(),
                    TenantId = _clinicContext.TenantId,
                    ClinicId = _clinicContext.ClinicId,
                    PatientId = request.PatientId,
                    PatientName = patientName,
                    ConsultationId = request.ConsultationId,
                    ToothNumber = request.ToothNumber,
                    Status = request.Status,
                    Surface = null,
                    ActiveSurface = null,
                    IsCurrent = true,
                    RecordedBy = staffName,
                    Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
                    CreatedAt = now,
                    CreatedBy = staffName
                };
                await _toothRepo.AddAsync(wholeToothRecord, ct);
            }

            foreach (var prior in activeConditions.Where(c => c.Status != ToothStatus.Healthy && c.Status != request.Status && c.IsCurrent))
            {
                prior.IsCurrent = false;
                prior.ActiveSurface = null;
                prior.SupersededAt = now;
                prior.SupersededByRecordId = wholeToothRecord.Id;
                _toothRepo.Update(prior);
            }

            await _unitOfWork.SaveChangesAsync(ct);
            return MapToDto(wholeToothRecord);
        }

        // Case 5: Saving surface-scoped condition (Decayed, Filled, Crowned, Sealant, Fractured)
        // Match existing active record with the same Status when in the same consultation (or unlinked)
        var existing = activeConditions
            .FirstOrDefault(t => t.Status == request.Status
                              && t.IsCurrent
                              && (t.ConsultationId == request.ConsultationId || !t.ConsultationId.HasValue || !request.ConsultationId.HasValue));

        if (existing != null)
        {
            existing.Surface = normalizedSurface;
            existing.ActiveSurface = effectiveActiveSurface;
            existing.IsCurrent = true;
            existing.SupersededAt = null;
            existing.SupersededByRecordId = null;
            existing.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
            if (request.ConsultationId.HasValue)
            {
                existing.ConsultationId = request.ConsultationId.Value;
            }
            existing.PatientName = patientName;
            existing.RecordedBy = staffName;
            existing.UpdatedAt = now;
            existing.UpdatedBy = staffName;
            _toothRepo.Update(existing);
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
                ToothNumber = request.ToothNumber,
                Status = request.Status,
                Surface = normalizedSurface,
                ActiveSurface = effectiveActiveSurface,
                IsCurrent = true,
                RecordedBy = staffName,
                Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
                CreatedAt = now,
                CreatedBy = staffName
            };
            await _toothRepo.AddAsync(existing, ct);
        }

        // If a surface-scoped condition is recorded, supersede any prior whole-tooth non-missing record on this tooth
        foreach (var ext in activeConditions.Where(c => IsWholeToothNonMissingStatus(c.Status) && c.IsCurrent))
        {
            ext.IsCurrent = false;
            ext.ActiveSurface = null;
            ext.SupersededAt = now;
            ext.SupersededByRecordId = existing.Id;
            _toothRepo.Update(ext);
        }

        // Subtract newly recorded active surfaces from all other active surface-scoped records on this tooth
        if (!string.IsNullOrWhiteSpace(effectiveActiveSurface))
        {
            foreach (var other in activeConditions.Where(c => c.Id != existing.Id
                                                           && c.IsCurrent
                                                           && IsSurfaceScopedStatus(c.Status)))
            {
                var priorActive = other.ActiveSurface ?? (other.Status == ToothStatus.Crowned && string.IsNullOrWhiteSpace(other.Surface) ? "MODBL" : other.Surface);
                var remaining = SubtractSurfaces(priorActive, effectiveActiveSurface);
                other.ActiveSurface = remaining;
                if (string.IsNullOrWhiteSpace(remaining))
                {
                    other.IsCurrent = false;
                    other.SupersededAt = now;
                    other.SupersededByRecordId = existing.Id;
                }
                _toothRepo.Update(other);
            }
        }

        await _unitOfWork.SaveChangesAsync(ct);

        return MapToDto(existing);
    }

    public static DentalToothRecordDto MapToDto(DentalToothRecord record)
    {
        var effectiveActive = record.IsCurrent
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
            record.IsCurrent,
            record.SupersededAt,
            record.SupersededByRecordId
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
