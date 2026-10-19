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
    Guid? ConsultationId = null
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

        var existing = await _toothRepo
            .Query(t => t.ClinicId == _clinicContext.ClinicId && t.PatientId == request.PatientId && t.ToothNumber == request.ToothNumber && !t.IsDeleted)
            .FirstOrDefaultAsync(ct);

        if (existing != null)
        {
            existing.Status = request.Status;
            existing.Surface = normalizedSurface;
            existing.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
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
                CreatedBy = _clinicContext.StaffName ?? "Staff"
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
            existing.PatientName
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
