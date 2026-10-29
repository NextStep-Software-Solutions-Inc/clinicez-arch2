using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.CustomFields.Validation;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Commands;

public sealed record UpdateClinicPatientCommand(
    Guid Id,
    string FirstName,
    string LastName,
    string? MiddleName,
    string? Suffix,
    DateOnly DateOfBirth,
    string Gender,
    string? CivilStatus,
    string ContactNumber,
    string? Email,
    string? AddressLine = null,
    string? Barangay = null,
    string? City = null,
    string? Province = null,
    string? EmergencyContactName = null,
    string? EmergencyContactPhone = null,
    string? EmergencyContactRelationship = null,
    string? PhilHealthNumber = null,
    string? SeniorCitizenId = null,
    string? PwdId = null,
    string? BloodType = null,
    string? Allergies = null,
    string? ChronicConditions = null,
    string? Alerts = null,
    System.Collections.Generic.Dictionary<string, object?>? CustomFields = null,
    string? VerificationStatus = null,
    System.Collections.Generic.List<MedicalHistoryEntryDto>? MedicalHistories = null) : IRequest<ClinicPatientDto>
{
    public UpdateClinicPatientCommand(
        Guid Id,
        string FirstName,
        string LastName,
        string? MiddleName,
        string? Suffix,
        DateOnly DateOfBirth,
        ClinicEz.Clinic.Domain.Enums.Gender Gender,
        string? CivilStatus,
        string ContactNumber,
        string? Email,
        string? AddressLine = null,
        string? Barangay = null,
        string? City = null,
        string? Province = null,
        string? EmergencyContactName = null,
        string? EmergencyContactPhone = null,
        string? EmergencyContactRelationship = null,
        string? PhilHealthNumber = null,
        string? SeniorCitizenId = null,
        string? PwdId = null,
        string? BloodType = null,
        string? Allergies = null,
        string? ChronicConditions = null,
        string? Alerts = null,
        System.Collections.Generic.Dictionary<string, object?>? CustomFields = null,
        string? VerificationStatus = null,
        System.Collections.Generic.List<MedicalHistoryEntryDto>? MedicalHistories = null)
        : this(Id, FirstName, LastName, MiddleName, Suffix, DateOfBirth, Gender.ToString(), CivilStatus, ContactNumber, Email, AddressLine, Barangay, City, Province, EmergencyContactName, EmergencyContactPhone, EmergencyContactRelationship, PhilHealthNumber, SeniorCitizenId, PwdId, BloodType, Allergies, ChronicConditions, Alerts, CustomFields, VerificationStatus, MedicalHistories)
    {
    }
}

public sealed class UpdateClinicPatientCommandHandler : IRequestHandler<UpdateClinicPatientCommand, ClinicPatientDto>
{
    private readonly IRepository<Patient> _patientRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IRepository<PatientMedicalHistory>? _medicalRepo;
    private readonly IClinicContext? _clinicContext;
    private readonly IRepository<CustomFieldDefinition>? _customFieldRepo;

    public UpdateClinicPatientCommandHandler(
        IRepository<Patient> patientRepo,
        IUnitOfWork unitOfWork,
        IRepository<PatientMedicalHistory>? medicalRepo = null,
        IClinicContext? clinicContext = null,
        IRepository<CustomFieldDefinition>? customFieldRepo = null)
    {
        _patientRepo = patientRepo;
        _unitOfWork = unitOfWork;
        _medicalRepo = medicalRepo;
        _clinicContext = clinicContext;
        _customFieldRepo = customFieldRepo;
    }

    public async Task<ClinicPatientDto> Handle(UpdateClinicPatientCommand request, CancellationToken ct)
    {
        var patient = await _patientRepo.Query()
            .Include(p => p.MedicalHistories)
            .Include(p => p.Alerts)
            .Include(p => p.Allergies)
            .FirstOrDefaultAsync(p => p.Id == request.Id, ct);

        if (patient == null)
        {
            throw new KeyNotFoundException($"Patient with ID {request.Id} was not found.");
        }

        // Safely merge and validate CustomFields on a cloned dictionary first so validation failures
        // never partially mutate the tracked entity, and assigning a new reference guarantees EF Core
        // ChangeTracker persists key removals and updates to PostgreSQL.
        var nextCustomFields = patient.CustomFields != null
            ? new System.Collections.Generic.Dictionary<string, object?>(patient.CustomFields)
            : new System.Collections.Generic.Dictionary<string, object?>();

        // 1. If explicit CustomFields dictionary is provided in request, merge keys to preserve existing data (e.g. yakap_enlistments)
        if (request.CustomFields != null)
        {
            if (_customFieldRepo != null)
            {
                await CustomFieldValueValidator.MergeAndValidateForUpdateAsync(
                    nextCustomFields,
                    request.CustomFields,
                    _customFieldRepo,
                    "Patient",
                    ct);
            }
            else
            {
                foreach (var kvp in request.CustomFields)
                {
                    nextCustomFields[kvp.Key] = kvp.Value;
                }
            }
        }

        // 2. If address/contact parameters are explicitly passed, update them in nextCustomFields
        if (request.AddressLine != null)
            nextCustomFields["primary_address_line"] = string.IsNullOrWhiteSpace(request.AddressLine) ? null : request.AddressLine.Trim();

        if (request.Barangay != null)
            nextCustomFields["primary_barangay"] = string.IsNullOrWhiteSpace(request.Barangay) ? null : request.Barangay.Trim();

        if (request.City != null)
            nextCustomFields["primary_city"] = string.IsNullOrWhiteSpace(request.City) ? null : request.City.Trim();

        if (request.Province != null)
            nextCustomFields["primary_province"] = string.IsNullOrWhiteSpace(request.Province) ? null : request.Province.Trim();

        if (request.EmergencyContactName != null)
            nextCustomFields["emergency_contact_name"] = string.IsNullOrWhiteSpace(request.EmergencyContactName) ? null : request.EmergencyContactName.Trim();

        if (request.EmergencyContactPhone != null)
            nextCustomFields["emergency_contact_phone"] = string.IsNullOrWhiteSpace(request.EmergencyContactPhone) ? null : request.EmergencyContactPhone.Trim();

        if (request.EmergencyContactRelationship != null)
            nextCustomFields["emergency_contact_relationship"] = string.IsNullOrWhiteSpace(request.EmergencyContactRelationship) ? null : request.EmergencyContactRelationship.Trim();

        patient.FirstName = request.FirstName.Trim();
        patient.LastName = request.LastName.Trim();
        patient.MiddleName = request.MiddleName?.Trim();
        patient.Suffix = request.Suffix?.Trim();
        patient.DateOfBirth = request.DateOfBirth;
        if (Enum.TryParse<Gender>(request.Gender, true, out var g)) patient.Gender = g;
        if (Enum.TryParse<CivilStatus>(request.CivilStatus, true, out var cs)) patient.CivilStatus = cs; else if (request.CivilStatus == null) patient.CivilStatus = null;
        patient.ContactNumber = request.ContactNumber.Trim();
        patient.Email = request.Email?.Trim();

        patient.PhilHealthNumber = request.PhilHealthNumber?.Trim();
        patient.SeniorCitizenId = request.SeniorCitizenId?.Trim();
        patient.PwdId = request.PwdId?.Trim();
        if (Enum.TryParse<BloodType>(request.BloodType, true, out var bt)) patient.BloodType = bt; else if (request.BloodType == null) patient.BloodType = null;
        patient.CustomFields = nextCustomFields;

        if (!string.IsNullOrWhiteSpace(request.VerificationStatus) && Enum.TryParse<PatientVerificationStatus>(request.VerificationStatus, true, out var vs))
        {
            patient.VerificationStatus = vs;
        }

        if (request.Allergies != null)
        {
            var allergens = request.Allergies.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (patient.Allergies != null)
            {
                foreach (var existing in patient.Allergies)
                {
                    if (!allergens.Any(a => string.Equals(a, existing.Allergen, StringComparison.OrdinalIgnoreCase)))
                    {
                        existing.Status = AllergyStatus.Inactive;
                        existing.IsDeleted = true;
                    }
                    else
                    {
                        existing.Status = AllergyStatus.Active;
                        existing.IsDeleted = false;
                    }
                }
            }

            foreach (var a in allergens)
            {
                if (patient.Allergies == null || !patient.Allergies.Any(existing => string.Equals(existing.Allergen, a, StringComparison.OrdinalIgnoreCase)))
                {
                    (patient.Allergies ??= new List<PatientAllergy>()).Add(new PatientAllergy
                    {
                        Id = Guid.NewGuid(),
                        TenantId = patient.TenantId ?? _clinicContext?.TenantId ?? "default",
                        ClinicId = patient.ClinicId != Guid.Empty ? patient.ClinicId : (_clinicContext?.ClinicId ?? Guid.Empty),
                        PatientId = patient.Id,
                        Category = AllergyCategory.Other,
                        Allergen = a,
                        Severity = AllergySeverity.Moderate,
                        Status = AllergyStatus.Active,
                        CreatedAt = DateTime.UtcNow,
                        CreatedBy = "ClinicStaff"
                    });
                }
            }
        }

        if (request.Alerts != null)
        {
            var alertTitles = request.Alerts.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (patient.Alerts != null)
            {
                foreach (var existing in patient.Alerts)
                {
                    if (!alertTitles.Any(t => string.Equals(t, existing.Title, StringComparison.OrdinalIgnoreCase)))
                    {
                        existing.Status = PatientAlertStatus.Resolved;
                        existing.IsDeleted = true;
                    }
                    else
                    {
                        existing.Status = PatientAlertStatus.Active;
                        existing.IsDeleted = false;
                    }
                }
            }

            foreach (var title in alertTitles)
            {
                if (patient.Alerts == null || !patient.Alerts.Any(existing => string.Equals(existing.Title, title, StringComparison.OrdinalIgnoreCase)))
                {
                    (patient.Alerts ??= new List<PatientAlert>()).Add(new PatientAlert
                    {
                        TenantId = patient.TenantId ?? _clinicContext?.TenantId ?? "default",
                        ClinicId = patient.ClinicId != Guid.Empty ? patient.ClinicId : (_clinicContext?.ClinicId ?? Guid.Empty),
                        PatientId = patient.Id,
                        Title = title,
                        Category = PatientAlertCategory.ClinicalSafety,
                        Status = PatientAlertStatus.Active,
                        CreatedAt = DateTime.UtcNow,
                        CreatedBy = "ClinicStaff"
                    });
                }
            }
        }

        if (!string.IsNullOrWhiteSpace(request.ChronicConditions))
        {
            var split = request.ChronicConditions.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            foreach (var cond in split)
            {
                if (!patient.MedicalHistories.Any(m => string.Equals(m.ConditionTitle, cond, StringComparison.OrdinalIgnoreCase)))
                {
                    var hist = new PatientMedicalHistory
                    {
                        Id = Guid.NewGuid(),
                        TenantId = patient.TenantId ?? string.Empty,
                        ClinicId = patient.ClinicId,
                        PatientId = patient.Id,
                        Category = MedicalHistoryCategory.MedicalHistory,
                        ConditionTitle = cond,
                        IsChronicNcd = true,
                        Status = ProblemStatus.Active,
                        CreatedAt = DateTime.UtcNow,
                        CreatedBy = "ClinicStaff"
                    };
                    if (_medicalRepo != null) await _medicalRepo.AddAsync(hist, ct);
                    patient.MedicalHistories.Add(hist);
                }
            }
        }

        patient.UpdatedAt = DateTime.UtcNow;
        patient.UpdatedBy = "ClinicStaff";

        if (request.MedicalHistories != null && _medicalRepo != null)
        {
            var existingEntries = await _medicalRepo.Query(m => m.PatientId == patient.Id && m.Category == MedicalHistoryCategory.MedicalHistory)
                .ToListAsync(ct);

            var tenantId = patient.TenantId ?? _clinicContext?.TenantId ?? "default";
            var clinicId = patient.ClinicId != Guid.Empty ? patient.ClinicId : (_clinicContext?.ClinicId ?? Guid.Empty);
            var staffName = _clinicContext?.StaffId?.ToString() ?? "ClinicStaff";

            var matchedExistingIds = new System.Collections.Generic.HashSet<Guid>();
            var updatedEntities = new System.Collections.Generic.List<PatientMedicalHistory>();

            foreach (var item in request.MedicalHistories)
            {
                if (string.IsNullOrWhiteSpace(item.ConditionTitle)) continue;

                PatientMedicalHistory? existing = null;

                // 1. Match by Id if provided
                if (item.Id.HasValue && item.Id.Value != Guid.Empty)
                {
                    existing = existingEntries.FirstOrDefault(e => e.Id == item.Id.Value && !matchedExistingIds.Contains(e.Id));
                }

                // 2. If not matched by Id, match statutory code (001-018, excluding 998 Others)
                if (existing == null && !string.IsNullOrWhiteSpace(item.PhilHealthMdiseaseCode) && item.PhilHealthMdiseaseCode.Trim() != "998")
                {
                    var code = item.PhilHealthMdiseaseCode.Trim();
                    existing = existingEntries.FirstOrDefault(e =>
                        !matchedExistingIds.Contains(e.Id) &&
                        string.Equals(e.PhilHealthMdiseaseCode, code, StringComparison.OrdinalIgnoreCase));
                }

                // 3. If not matched, match by specific description or condition title (for 998 Others or custom diagnoses)
                if (existing == null)
                {
                    var targetTitle = !string.IsNullOrWhiteSpace(item.SpecificDescription)
                        ? item.SpecificDescription.Trim()
                        : item.ConditionTitle.Trim();

                    existing = existingEntries.FirstOrDefault(e =>
                    {
                        if (matchedExistingIds.Contains(e.Id)) return false;
                        var existingTitle = !string.IsNullOrWhiteSpace(e.SpecificDescription)
                            ? e.SpecificDescription.Trim()
                            : e.ConditionTitle.Trim();
                        return string.Equals(existingTitle, targetTitle, StringComparison.OrdinalIgnoreCase);
                    });
                }

                if (existing != null)
                {
                    matchedExistingIds.Add(existing.Id);
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
                    updatedEntities.Add(existing);
                }
                else
                {
                    var newEntity = new PatientMedicalHistory
                    {
                        Id = item.Id.HasValue && item.Id.Value != Guid.Empty ? item.Id.Value : Guid.NewGuid(),
                        TenantId = tenantId,
                        ClinicId = clinicId,
                        PatientId = patient.Id,
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
                    await _medicalRepo.AddAsync(newEntity, ct);
                    matchedExistingIds.Add(newEntity.Id);
                    updatedEntities.Add(newEntity);
                }
            }

            foreach (var existing in existingEntries)
            {
                if (!matchedExistingIds.Contains(existing.Id))
                {
                    _medicalRepo.Remove(existing);
                }
            }

            foreach (var entity in updatedEntities)
            {
                if (!patient.MedicalHistories.Any(m => m.Id == entity.Id))
                {
                    patient.MedicalHistories.Add(entity);
                }
            }
        }

        await _unitOfWork.SaveChangesAsync(ct);

        return RegisterClinicPatientCommandHandler.MapToDto(patient);
    }
}
