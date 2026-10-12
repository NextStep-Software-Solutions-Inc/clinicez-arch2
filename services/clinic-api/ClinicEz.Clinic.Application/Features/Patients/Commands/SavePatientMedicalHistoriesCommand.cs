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
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<PatientPastMedicalHistory> _medicalRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public SavePatientMedicalHistoriesCommandHandler(
        IRepository<ClinicPatient> patientRepo,
        IRepository<PatientPastMedicalHistory> medicalRepo,
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

        var existingEntries = await _medicalRepo.Query(m => m.PatientId == request.PatientId)
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
                existing.IsResolved = item.IsResolved;
                existing.ClinicalNotes = item.ClinicalNotes?.Trim();
                existing.UpdatedAt = DateTime.UtcNow;
                existing.UpdatedBy = staffName;
                await _medicalRepo.UpdateAsync(existing, cancellationToken);
            }
            else
            {
                var newEntity = new PatientPastMedicalHistory
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    ClinicId = clinicId,
                    PatientId = request.PatientId,
                    ConditionTitle = item.ConditionTitle.Trim(),
                    PhilHealthMdiseaseCode = item.PhilHealthMdiseaseCode?.Trim(),
                    Icd10Code = item.Icd10Code?.Trim(),
                    SpecificDescription = item.SpecificDescription?.Trim(),
                    OnsetDate = item.OnsetDate,
                    IsResolved = item.IsResolved,
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
                await _medicalRepo.DeleteAsync(existing, cancellationToken);
            }
        }

        // Update summary notes and chronic conditions string on ClinicPatient
        patient.PersonalMedicalHistoryNotes = request.Notes?.Trim();
        if (request.Items.Count > 0)
        {
            patient.ChronicConditions = string.Join(", ", request.Items.Select(i =>
                !string.IsNullOrWhiteSpace(i.SpecificDescription) ? i.SpecificDescription : i.ConditionTitle));
        }
        else
        {
            patient.ChronicConditions = null;
        }

        await _patientRepo.UpdateAsync(patient, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // Fetch refreshed active items
        var updatedEntries = await _medicalRepo.Query(m => m.PatientId == request.PatientId)
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
            e.IsResolved,
            e.ClinicalNotes,
            e.CreatedAt)).ToList();

        return new PatientMedicalHistoryResultDto(dtos, patient.PersonalMedicalHistoryNotes);
    }
}
