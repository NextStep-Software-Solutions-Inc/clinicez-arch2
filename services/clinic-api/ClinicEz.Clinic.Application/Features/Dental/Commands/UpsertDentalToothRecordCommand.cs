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
        var normalizedSurface = NormalizeAndSortSurfaces(request.Surface);

        var patient = await _patientRepo
            .Query(p => p.ClinicId == _clinicContext.ClinicId && p.Id == request.PatientId && !p.IsDeleted)
            .FirstOrDefaultAsync(ct);

        if (patient == null)
        {
            throw new NotFoundException($"Patient '{request.PatientId}' not found.");
        }

        var patientName = $"{patient.LastName}, {patient.FirstName}".Trim();
        var staffName = _clinicContext.StaffName ?? "Staff";

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
                record.DeletedAt = DateTime.UtcNow;
                record.DeletedBy = staffName;
                _toothRepo.Update(record);
            }

            await _unitOfWork.SaveChangesAsync(ct);

            var deletedRecord = conditionRecords.FirstOrDefault();
            return new DentalToothRecordDto(
                deletedRecord?.Id ?? Guid.NewGuid(),
                _clinicContext.TenantId,
                _clinicContext.ClinicId,
                request.PatientId,
                request.ConsultationId,
                request.ToothNumber,
                request.Status,
                normalizedSurface,
                request.Notes,
                deletedRecord?.CreatedAt ?? DateTime.UtcNow,
                DateTime.UtcNow,
                patientName,
                staffName
            );
        }

        // Case 2: Marking tooth as Healthy (clears all active non-healthy conditions on this tooth)
        if (request.Status == ToothStatus.Healthy)
        {
            var activeConditions = await _toothRepo
                .Query(t => t.ClinicId == _clinicContext.ClinicId
                         && t.PatientId == request.PatientId
                         && t.ToothNumber == request.ToothNumber
                         && !t.IsDeleted)
                .ToListAsync(ct);

            foreach (var cond in activeConditions.Where(c => c.Status != ToothStatus.Healthy))
            {
                cond.IsDeleted = true;
                cond.DeletedAt = DateTime.UtcNow;
                cond.DeletedBy = staffName;
                _toothRepo.Update(cond);
            }

            var healthyRecord = activeConditions.FirstOrDefault(c => c.Status == ToothStatus.Healthy);
            if (healthyRecord != null)
            {
                healthyRecord.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
                if (request.ConsultationId.HasValue)
                {
                    healthyRecord.ConsultationId = request.ConsultationId.Value;
                }
                healthyRecord.PatientName = patientName;
                healthyRecord.UpdatedAt = DateTime.UtcNow;
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
                    Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = staffName
                };
                await _toothRepo.AddAsync(healthyRecord, ct);
            }

            await _unitOfWork.SaveChangesAsync(ct);

            return new DentalToothRecordDto(
                healthyRecord.Id,
                healthyRecord.TenantId,
                healthyRecord.ClinicId,
                healthyRecord.PatientId,
                healthyRecord.ConsultationId,
                healthyRecord.ToothNumber,
                healthyRecord.Status,
                healthyRecord.Surface,
                healthyRecord.Notes,
                healthyRecord.CreatedAt,
                healthyRecord.UpdatedAt,
                healthyRecord.PatientName,
                healthyRecord.UpdatedBy ?? healthyRecord.CreatedBy
            );
        }

        // Case 3: Saving non-healthy condition (Decay, Filled, Crown, Extraction, Missing)
        // Step A: Soft-delete any active Healthy placeholder records on this tooth
        var healthyPlaceholders = await _toothRepo
            .Query(t => t.ClinicId == _clinicContext.ClinicId
                     && t.PatientId == request.PatientId
                     && t.ToothNumber == request.ToothNumber
                     && t.Status == ToothStatus.Healthy
                     && !t.IsDeleted)
            .ToListAsync(ct);

        foreach (var h in healthyPlaceholders)
        {
            h.IsDeleted = true;
            h.DeletedAt = DateTime.UtcNow;
            h.DeletedBy = staffName;
            _toothRepo.Update(h);
        }

        // Step B: Match active record for this specific condition: (ClinicId, PatientId, ToothNumber, Status)
        var existing = await _toothRepo
            .Query(t => t.ClinicId == _clinicContext.ClinicId
                     && t.PatientId == request.PatientId
                     && t.ToothNumber == request.ToothNumber
                     && t.Status == request.Status
                     && !t.IsDeleted)
            .FirstOrDefaultAsync(ct);

        if (existing != null)
        {
            existing.Surface = normalizedSurface;
            existing.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
            if (request.ConsultationId.HasValue)
            {
                existing.ConsultationId = request.ConsultationId.Value;
            }
            existing.PatientName = patientName;
            existing.UpdatedAt = DateTime.UtcNow;
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
                Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
                CreatedAt = DateTime.UtcNow,
                CreatedBy = staffName
            };
            await _toothRepo.AddAsync(existing, ct);
        }

        await _unitOfWork.SaveChangesAsync(ct);

        return new DentalToothRecordDto(
            existing.Id,
            existing.TenantId,
            existing.ClinicId,
            existing.PatientId,
            existing.ConsultationId,
            existing.ToothNumber,
            existing.Status,
            existing.Surface,
            existing.Notes,
            existing.CreatedAt,
            existing.UpdatedAt,
            existing.PatientName,
            existing.UpdatedBy ?? existing.CreatedBy
        );
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
