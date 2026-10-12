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

public sealed record SavePatientFamilyHistoriesCommand(
    Guid PatientId,
    List<FamilyHistoryEntryItem> Items,
    string? Notes = null) : IRequest<PatientFamilyHistoryResultDto>;

public sealed class SavePatientFamilyHistoriesCommandValidator : AbstractValidator<SavePatientFamilyHistoriesCommand>
{
    public SavePatientFamilyHistoriesCommandValidator()
    {
        RuleFor(x => x.PatientId).NotEmpty();
        RuleFor(x => x.Items).NotNull();
    }
}

public sealed class SavePatientFamilyHistoriesCommandHandler : IRequestHandler<SavePatientFamilyHistoriesCommand, PatientFamilyHistoryResultDto>
{
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<PatientFamilyHistory> _familyRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public SavePatientFamilyHistoriesCommandHandler(
        IRepository<ClinicPatient> patientRepo,
        IRepository<PatientFamilyHistory> familyRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _patientRepo = patientRepo;
        _familyRepo = familyRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task<PatientFamilyHistoryResultDto> Handle(SavePatientFamilyHistoriesCommand request, CancellationToken cancellationToken)
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

        var existingEntries = await _familyRepo.Query(f => f.PatientId == request.PatientId)
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
                existing.Relationship = item.Relationship?.Trim();
                existing.ClinicalNotes = item.ClinicalNotes?.Trim();
                existing.UpdatedAt = DateTime.UtcNow;
                existing.UpdatedBy = staffName;
                await _familyRepo.UpdateAsync(existing, cancellationToken);
            }
            else
            {
                var newEntity = new PatientFamilyHistory
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    ClinicId = clinicId,
                    PatientId = request.PatientId,
                    ConditionTitle = item.ConditionTitle.Trim(),
                    PhilHealthMdiseaseCode = item.PhilHealthMdiseaseCode?.Trim(),
                    Icd10Code = item.Icd10Code?.Trim(),
                    SpecificDescription = item.SpecificDescription?.Trim(),
                    Relationship = item.Relationship?.Trim(),
                    ClinicalNotes = item.ClinicalNotes?.Trim(),
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = staffName
                };
                await _familyRepo.AddAsync(newEntity, cancellationToken);
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
                await _familyRepo.DeleteAsync(existing, cancellationToken);
            }
        }

        // Update summary notes on ClinicPatient
        patient.FamilyMedicalHistoryNotes = request.Notes?.Trim();

        await _patientRepo.UpdateAsync(patient, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // Fetch refreshed active items
        var updatedEntries = await _familyRepo.Query(f => f.PatientId == request.PatientId)
            .OrderBy(f => f.ConditionTitle)
            .ToListAsync(cancellationToken);

        var dtos = updatedEntries.Select(e => new PatientFamilyHistoryDto(
            e.Id,
            e.PatientId,
            e.ConditionTitle,
            e.PhilHealthMdiseaseCode,
            e.Icd10Code,
            e.SpecificDescription,
            e.Relationship,
            e.ClinicalNotes,
            e.CreatedAt)).ToList();

        return new PatientFamilyHistoryResultDto(dtos, patient.FamilyMedicalHistoryNotes);
    }
}
