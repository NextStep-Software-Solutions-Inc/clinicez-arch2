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
    System.Collections.Generic.List<MedicalHistoryEntryDto>? MedicalHistories = null) : IRequest<ClinicPatientDto>;

public sealed class UpdateClinicPatientCommandHandler : IRequestHandler<UpdateClinicPatientCommand, ClinicPatientDto>
{
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IRepository<PatientPastMedicalHistory>? _medicalRepo;
    private readonly IClinicContext? _clinicContext;
    private readonly IRepository<ClinicCustomFieldDefinition>? _customFieldRepo;

    public UpdateClinicPatientCommandHandler(
        IRepository<ClinicPatient> patientRepo,
        IUnitOfWork unitOfWork,
        IRepository<PatientPastMedicalHistory>? medicalRepo = null,
        IClinicContext? clinicContext = null,
        IRepository<ClinicCustomFieldDefinition>? customFieldRepo = null)
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
            .Include(p => p.PastMedicalHistories)
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
                    "ClinicPatient",
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
        patient.Gender = request.Gender;
        patient.CivilStatus = request.CivilStatus;
        patient.ContactNumber = request.ContactNumber.Trim();
        patient.Email = request.Email?.Trim();

        patient.PhilHealthNumber = request.PhilHealthNumber?.Trim();
        patient.SeniorCitizenId = request.SeniorCitizenId?.Trim();
        patient.PwdId = request.PwdId?.Trim();
        patient.BloodType = request.BloodType?.Trim();
        patient.Allergies = request.Allergies?.Trim();
        patient.Alerts = request.Alerts?.Trim();
        patient.CustomFields = nextCustomFields;

        if (!string.IsNullOrWhiteSpace(request.VerificationStatus))
        {
            patient.VerificationStatus = request.VerificationStatus;
        }
        patient.UpdatedAt = DateTime.UtcNow;
        patient.UpdatedBy = "ClinicStaff";

        if (request.MedicalHistories != null && _medicalRepo != null)
        {
            var existingEntries = await _medicalRepo.Query(m => m.PatientId == patient.Id)
                .ToListAsync(ct);

            var tenantId = patient.TenantId ?? _clinicContext?.TenantId ?? "default";
            var clinicId = patient.ClinicId != Guid.Empty ? patient.ClinicId : (_clinicContext?.ClinicId ?? Guid.Empty);
            var staffName = _clinicContext?.StaffId?.ToString() ?? "ClinicStaff";

            var matchedExistingIds = new System.Collections.Generic.HashSet<Guid>();
            var updatedEntities = new System.Collections.Generic.List<PatientPastMedicalHistory>();

            foreach (var item in request.MedicalHistories)
            {
                if (string.IsNullOrWhiteSpace(item.ConditionTitle)) continue;

                PatientPastMedicalHistory? existing = null;

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
                    existing.IsResolved = item.IsResolved;
                    existing.ClinicalNotes = item.ClinicalNotes?.Trim();
                    existing.UpdatedAt = DateTime.UtcNow;
                    existing.UpdatedBy = staffName;
                    _medicalRepo.Update(existing);
                    updatedEntities.Add(existing);
                }
                else
                {
                    var newEntity = new PatientPastMedicalHistory
                    {
                        Id = item.Id.HasValue && item.Id.Value != Guid.Empty ? item.Id.Value : Guid.NewGuid(),
                        TenantId = tenantId,
                        ClinicId = clinicId,
                        PatientId = patient.Id,
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

            if (updatedEntities.Count > 0)
            {
                patient.ChronicConditions = string.Join(", ", updatedEntities.Select(i =>
                    !string.IsNullOrWhiteSpace(i.SpecificDescription) ? i.SpecificDescription : i.ConditionTitle));
            }
            else
            {
                patient.ChronicConditions = null;
            }

            patient.PastMedicalHistories.Clear();
            foreach (var entity in updatedEntities)
            {
                patient.PastMedicalHistories.Add(entity);
            }
        }
        else
        {
            patient.ChronicConditions = request.ChronicConditions?.Trim();
        }

        await _unitOfWork.SaveChangesAsync(ct);

        return RegisterClinicPatientCommandHandler.MapToDto(patient);
    }
}
