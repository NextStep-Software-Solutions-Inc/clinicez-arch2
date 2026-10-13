using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
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
    string? AddressLine,
    string? Barangay,
    string? City,
    string? Province,
    string? EmergencyContactName,
    string? EmergencyContactPhone,
    string? EmergencyContactRelationship,
    string? PhilHealthNumber,
    string? SeniorCitizenId,
    string? PwdId,
    string? BloodType,
    string? Allergies,
    string? ChronicConditions,
    string? Alerts,
    System.Collections.Generic.Dictionary<string, object?>? CustomFields = null,
    string? VerificationStatus = null,
    System.Collections.Generic.List<MedicalHistoryEntryDto>? MedicalHistories = null) : IRequest<ClinicPatientDto>;

public sealed class UpdateClinicPatientCommandHandler : IRequestHandler<UpdateClinicPatientCommand, ClinicPatientDto>
{
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IRepository<PatientPastMedicalHistory>? _medicalRepo;
    private readonly IClinicContext? _clinicContext;

    public UpdateClinicPatientCommandHandler(
        IRepository<ClinicPatient> patientRepo,
        IUnitOfWork unitOfWork,
        IRepository<PatientPastMedicalHistory>? medicalRepo = null,
        IClinicContext? clinicContext = null)
    {
        _patientRepo = patientRepo;
        _unitOfWork = unitOfWork;
        _medicalRepo = medicalRepo;
        _clinicContext = clinicContext;
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

        patient.FirstName = request.FirstName.Trim();
        patient.LastName = request.LastName.Trim();
        patient.MiddleName = request.MiddleName?.Trim();
        patient.Suffix = request.Suffix?.Trim();
        patient.DateOfBirth = request.DateOfBirth;
        patient.Gender = request.Gender;
        patient.CivilStatus = request.CivilStatus;
        patient.ContactNumber = request.ContactNumber.Trim();
        patient.Email = request.Email?.Trim();
        patient.AddressLine = request.AddressLine?.Trim();
        patient.Barangay = request.Barangay?.Trim();
        patient.City = request.City?.Trim();
        patient.Province = request.Province?.Trim();
        patient.EmergencyContactName = request.EmergencyContactName?.Trim();
        patient.EmergencyContactPhone = request.EmergencyContactPhone?.Trim();
        patient.EmergencyContactRelationship = request.EmergencyContactRelationship?.Trim();
        patient.PhilHealthNumber = request.PhilHealthNumber?.Trim();
        patient.SeniorCitizenId = request.SeniorCitizenId?.Trim();
        patient.PwdId = request.PwdId?.Trim();
        patient.BloodType = request.BloodType?.Trim();
        patient.Allergies = request.Allergies?.Trim();
        patient.Alerts = request.Alerts?.Trim();
        if (request.CustomFields != null)
        {
            patient.CustomFields = request.CustomFields;
        }
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

            var incomingKeys = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var updatedEntities = new System.Collections.Generic.List<PatientPastMedicalHistory>();

            foreach (var item in request.MedicalHistories)
            {
                if (string.IsNullOrWhiteSpace(item.ConditionTitle)) continue;

                var key = !string.IsNullOrWhiteSpace(item.PhilHealthMdiseaseCode)
                    ? $"code:{item.PhilHealthMdiseaseCode.Trim()}"
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
                    _medicalRepo.Update(existing);
                    updatedEntities.Add(existing);
                }
                else
                {
                    var newEntity = new PatientPastMedicalHistory
                    {
                        Id = Guid.NewGuid(),
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
                    updatedEntities.Add(newEntity);
                }
            }

            foreach (var existing in existingEntries)
            {
                var key = !string.IsNullOrWhiteSpace(existing.PhilHealthMdiseaseCode)
                    ? $"code:{existing.PhilHealthMdiseaseCode.Trim()}"
                    : $"title:{existing.ConditionTitle.Trim()}";

                if (!incomingKeys.Contains(key))
                {
                    _medicalRepo.Remove(existing);
                }
            }

            if (request.MedicalHistories.Count > 0)
            {
                patient.ChronicConditions = string.Join(", ", request.MedicalHistories.Select(i =>
                    !string.IsNullOrWhiteSpace(i.SpecificDescription) ? i.SpecificDescription : i.ConditionTitle));
            }
            else
            {
                patient.ChronicConditions = null;
            }

            patient.PastMedicalHistories = updatedEntities;
        }
        else
        {
            patient.ChronicConditions = request.ChronicConditions?.Trim();
        }

        await _unitOfWork.SaveChangesAsync(ct);

        return RegisterClinicPatientCommandHandler.MapToDto(patient);
    }
}
