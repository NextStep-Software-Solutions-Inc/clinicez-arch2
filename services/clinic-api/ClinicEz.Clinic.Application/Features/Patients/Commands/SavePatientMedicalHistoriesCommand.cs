using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Commands;

public sealed record SavePatientMedicalHistoriesCommand(
    Guid PatientId,
    List<MedicalHistoryEntryItem> Items,
    string? Notes = null) : IRequest<PatientMedicalHistoryResultDto>;

public sealed class SavePatientMedicalHistoriesCommandValidator : AbstractValidator<SavePatientMedicalHistoriesCommand>
{
    public SavePatientMedicalHistoriesCommandValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
        RuleFor(x => x.Items).NotNull();
    }
}

public sealed class SavePatientMedicalHistoriesCommandHandler : IRequestHandler<SavePatientMedicalHistoriesCommand, PatientMedicalHistoryResultDto>
{
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<PatientMedicalHistory> _medicalRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public SavePatientMedicalHistoriesCommandHandler(
        IRepository<Patient> patientRepo,
        IRepository<PatientMedicalHistory> medicalRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _patientRepo = patientRepo;
        _medicalRepo = medicalRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<PatientMedicalHistoryResultDto> Handle(SavePatientMedicalHistoriesCommand request, CancellationToken cancellationToken)
    {
        var patient = await _patientRepo.Query(p => p.Id == request.PatientId)
            .FirstOrDefaultAsync(cancellationToken);

        if (patient == null)
        {
            throw new NotFoundException($"Patient with id {request.PatientId} not found.");
        }

        var tenantId = patient.TenantId ?? _clinicContext.TenantId;
        var clinicId = _clinicContext.ClinicId;
        var staffName = _clinicContext.StaffId?.ToString() ?? "ClinicStaff";

        var existingEntries = await _medicalRepo.Query(m => m.PatientId == request.PatientId && m.Category == MedicalHistoryCategory.MedicalHistory)
            .ToListAsync(cancellationToken);

        // Track conditions to keep or add
        var incomingKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in request.Items)
        {
            var key = !string.IsNullOrWhiteSpace(item.PhilHealthMdiseaseCode)
                ? $"code:{item.PhilHealthMdiseaseCode}"
                : $"title:{item.ConditionTitle.Trim()}";
            incomingKeys.Add(key);

            var existing = existingEntries.FirstOrDefault(e =>
                (!string.IsNullOrWhiteSpace(item.PhilHealthMdiseaseCode) && string.Equals(e.PhilHealthMdiseaseCode, item.PhilHealthMdiseaseCode, StringComparison.OrdinalIgnoreCase)) ||
                (string.IsNullOrWhiteSpace(item.PhilHealthMdiseaseCode) && string.Equals(e.ConditionTitle, item.ConditionTitle, StringComparison.OrdinalIgnoreCase)));

            if (existing != null)
            {
                existing.ConditionTitle = item.ConditionTitle.Trim();
                existing.PhilHealthMdiseaseCode = item.PhilHealthMdiseaseCode?.Trim();
                existing.Icd10Code = item.Icd10Code?.Trim();
                existing.SpecificDescription = item.SpecificDescription?.Trim();
                existing.OnsetDate = item.OnsetDate;
                existing.Status = item.IsResolved ? ProblemStatus.Resolved : ProblemStatus.Active;
                existing.ClinicalNotes = item.ClinicalNotes?.Trim();
                existing.UpdatedAt = DateTime.UtcNow;
                existing.UpdatedBy = staffName;
                _medicalRepo.Update(existing);
            }
            else
            {
                var newEntity = new PatientMedicalHistory
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    ClinicId = clinicId,
                    PatientId = request.PatientId,
                    Category = MedicalHistoryCategory.MedicalHistory,
                    ConditionTitle = item.ConditionTitle.Trim(),
                    PhilHealthMdiseaseCode = item.PhilHealthMdiseaseCode?.Trim(),
                    Icd10Code = item.Icd10Code?.Trim(),
                    SpecificDescription = item.SpecificDescription?.Trim(),
                    OnsetDate = item.OnsetDate,
                    Status = item.IsResolved ? ProblemStatus.Resolved : ProblemStatus.Active,
                    ClinicalNotes = item.ClinicalNotes?.Trim(),
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = staffName
                };
                await _medicalRepo.AddAsync(newEntity, cancellationToken);
            }
        }

        // Delete entries not in incoming list
        foreach (var existing in existingEntries)
        {
            var key = !string.IsNullOrWhiteSpace(existing.PhilHealthMdiseaseCode)
                ? $"code:{existing.PhilHealthMdiseaseCode}"
                : $"title:{existing.ConditionTitle.Trim()}";

            if (!incomingKeys.Contains(key))
            {
                _medicalRepo.Remove(existing);
            }
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // Fetch refreshed active items
        var updatedEntries = await _medicalRepo.Query(m => m.PatientId == request.PatientId && m.Category == MedicalHistoryCategory.MedicalHistory)
            .OrderBy(m => m.ConditionTitle)
            .ToListAsync(cancellationToken);

        var dtos = updatedEntries.Select(e => new PatientPastMedicalHistoryDto(
            e.Id,
            e.PatientId,
            e.ConditionTitle,
            e.PhilHealthMdiseaseCode,
            e.Icd10Code,
            e.SpecificDescription,
            e.OnsetDate,
            e.Status == ProblemStatus.Resolved,
            e.ClinicalNotes,
            e.CreatedAt)).ToList();

        return new PatientMedicalHistoryResultDto(dtos, request.Notes?.Trim());
    }
}
