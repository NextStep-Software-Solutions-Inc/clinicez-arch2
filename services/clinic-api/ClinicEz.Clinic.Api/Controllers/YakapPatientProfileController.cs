using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.Services;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/yakap/patients/{patientId:guid}/profile")]
public sealed class YakapPatientProfileController : ControllerBase
{
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<TriageVitals> _vitalsRepo;
    private readonly IRepository<PatientPastMedicalHistory> _medicalRepo;
    private readonly IRepository<PatientFamilyHistory> _familyRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly PhilHealthCatalogResolver _catalogResolver;
    private readonly ILegacyPatientProfileIngestionService _ingestionService;

    public YakapPatientProfileController(
        IRepository<ClinicPatient> patientRepo,
        IRepository<TriageVitals> vitalsRepo,
        IRepository<PatientPastMedicalHistory> medicalRepo,
        IRepository<PatientFamilyHistory> familyRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IPhilHealthCatalogLookup catalog,
        ILegacyPatientProfileIngestionService ingestionService)
    {
        _catalogResolver = new PhilHealthCatalogResolver(catalog);
        _patientRepo = patientRepo;
        _vitalsRepo = vitalsRepo;
        _medicalRepo = medicalRepo;
        _familyRepo = familyRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _ingestionService = ingestionService;
    }

    /// <summary>
    /// Retrieves the standalone PhilHealth Patient Profile for a patient.
    /// If no profile has been saved yet, returns an age- and gender-responsive default profile.
    /// </summary>
    [HttpGet]
    [HasPermission(ClinicPermissions.PatientsRead)]
    public async Task<ActionResult<ApiResponse<PhilHealthPatientProfileDto>>> GetProfile(
        Guid patientId,
        CancellationToken ct)
    {
        var clinicId = _clinicContext.ClinicId;
        var patient = await _patientRepo.Query(p => p.Id == patientId && p.ClinicId == clinicId)
            .FirstOrDefaultAsync(ct);

        if (patient == null)
        {
            return NotFound(ApiResponse<PhilHealthPatientProfileDto>.Fail("Patient not found in this clinic."));
        }

        await _ingestionService.EnsureIngestedAsync(patientId, ct);

        // Load relational medical histories and family histories
        var relMedHistories = await _medicalRepo.Query(m => m.PatientId == patientId)
            .OrderBy(m => m.ConditionTitle)
            .ToListAsync(ct);

        var relFamHistories = await _familyRepo.Query(f => f.PatientId == patientId)
            .OrderBy(f => f.ConditionTitle)
            .ToListAsync(ct);

        // Check if custom profile already exists in CustomFields
        if (patient.CustomFields != null && patient.CustomFields.TryGetValue("philhealth_profile", out var profObj) && profObj != null)
        {
            PhilHealthPatientProfileDto? existing = null;
            if (profObj is PhilHealthPatientProfileDto typed)
            {
                existing = typed;
            }
            else
            {
                try
                {
                    var json = profObj.ToString();
                    if (!string.IsNullOrWhiteSpace(json))
                    {
                        existing = JsonSerializer.Deserialize<PhilHealthPatientProfileDto>(json,
                            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                    }
                }
                catch
                {
                    // Fall through to default initialization
                }
            }

            if (existing != null)
            {
                if (relMedHistories.Count > 0)
                {
                    existing = existing with
                    {
                        MedicalHistories = relMedHistories.Select(m => new PhilHealthConditionEntryDto(
                            Code: !string.IsNullOrWhiteSpace(m.PhilHealthMdiseaseCode) ? m.PhilHealthMdiseaseCode : (_catalogResolver.ResolveKnownConditions(m.ConditionTitle).FirstOrDefault()?.Code ?? "998"),
                            SpecificDesc: !string.IsNullOrWhiteSpace(m.SpecificDescription) ? m.SpecificDescription : m.ConditionTitle)).ToList(),
                        MedicalHistoryNotes = patient.PersonalMedicalHistoryNotes ?? existing.MedicalHistoryNotes
                    };
                }
                else if (patient.PersonalMedicalHistoryNotes != null)
                {
                    existing = existing with { MedicalHistoryNotes = patient.PersonalMedicalHistoryNotes };
                }

                if (relFamHistories.Count > 0)
                {
                    existing = existing with
                    {
                        FamilyHistories = relFamHistories.Select(f => new PhilHealthConditionEntryDto(
                            Code: !string.IsNullOrWhiteSpace(f.PhilHealthMdiseaseCode) ? f.PhilHealthMdiseaseCode : (_catalogResolver.ResolveKnownConditions(f.ConditionTitle).FirstOrDefault()?.Code ?? "998"),
                            SpecificDesc: !string.IsNullOrWhiteSpace(f.SpecificDescription) ? f.SpecificDescription : f.ConditionTitle)).ToList(),
                        FamilyHistoryNotes = patient.FamilyMedicalHistoryNotes ?? existing.FamilyHistoryNotes
                    };
                }
                else if (patient.FamilyMedicalHistoryNotes != null)
                {
                    existing = existing with { FamilyHistoryNotes = patient.FamilyMedicalHistoryNotes };
                }

                return Ok(ApiResponse<PhilHealthPatientProfileDto>.Success(existing));
            }
        }

        // Initialize responsive default profile based on patient demographics and latest vitals
        var latestVitals = await _vitalsRepo.Query(v => v.PatientId == patientId)
            .OrderByDescending(v => v.CreatedAt)
            .FirstOrDefaultAsync(ct);

        var asOf = DateTime.UtcNow;
        var birthDate = patient.DateOfBirth;
        int ageYears = asOf.Year - birthDate.Year;
        if (DateOnly.FromDateTime(asOf) < birthDate.AddYears(ageYears))
            ageYears--;

        bool isFemale = patient.Gender.StartsWith("F", StringComparison.OrdinalIgnoreCase);
        bool isPediatric = ageYears < 18;
        bool isSenior = ageYears >= 60;

        // Pre-fill from the patient's recorded conditions using the PhilHealth Catalog (clinician reviews before saving).
        var defaultMedHistories = relMedHistories.Count > 0
            ? relMedHistories.Select(m => new PhilHealthConditionEntryDto(
                Code: !string.IsNullOrWhiteSpace(m.PhilHealthMdiseaseCode) ? m.PhilHealthMdiseaseCode : (_catalogResolver.ResolveKnownConditions(m.ConditionTitle).FirstOrDefault()?.Code ?? "998"),
                SpecificDesc: !string.IsNullOrWhiteSpace(m.SpecificDescription) ? m.SpecificDescription : m.ConditionTitle)).ToList()
            : _catalogResolver.ResolveKnownConditions(patient.ChronicConditions);

        var defaultFamHistories = relFamHistories.Select(f => new PhilHealthConditionEntryDto(
            Code: !string.IsNullOrWhiteSpace(f.PhilHealthMdiseaseCode) ? f.PhilHealthMdiseaseCode : (_catalogResolver.ResolveKnownConditions(f.ConditionTitle).FirstOrDefault()?.Code ?? "998"),
            SpecificDesc: !string.IsNullOrWhiteSpace(f.SpecificDescription) ? f.SpecificDescription : f.ConditionTitle)).ToList();

        var isDependentDefault = isPediatric;
        var defaultProfile = new PhilHealthPatientProfileDto
        {
            Pin = patient.PhilHealthNumber,
            MemberPin = isDependentDefault ? null : patient.PhilHealthNumber,
            MemberType = isDependentDefault ? "DD" : "MM",
            MemberLastName = patient.LastName,
            MemberFirstName = isDependentDefault ? null : patient.FirstName,
            MemberMiddleName = isDependentDefault ? null : patient.MiddleName,
            MemberSuffix = isDependentDefault ? null : patient.Suffix,
            MemberBirthDate = isDependentDefault ? null : patient.DateOfBirth.ToString("yyyy-MM-dd"),
            DependentRelationship = isDependentDefault ? "C" : null,
            Atc = "A",
            IsWalkedIn = "Y",
            BloodType = patient.BloodType,
            MedicalHistories = defaultMedHistories,
            SurgicalHistories = [],
            FamilyHistories = defaultFamHistories,
            MedicalHistoryNotes = patient.PersonalMedicalHistoryNotes,
            FamilyHistoryNotes = patient.FamilyMedicalHistoryNotes,
            IsSmoker = false,
            IsAlcoholDrinker = false,
            IllDrugUser = false,
            IsSexuallyActive = false,
            ChildImmunizations = [],
            YoungWomanImmunizations = [],
            PregnantWomanImmunizations = [],
            ElderlyImmunizations = [],
            OtherImmunizations = [],
            MenstrualApplicable = isFemale && ageYears >= 9,
            MenarcheAge = null,
            PeriodDurationDays = null,
            CycleIntervalDays = null,
            PadsPerDay = null,
            IsMenopause = false,
            MenopauseAge = null,
            PregnancyApplicable = false, // Default false/N (overwritable by patient/clinician for pregnant adolescents 10-17 or adults)
            Gravida = 0,
            Para = 0,
            DeliveryType = null,
            Systolic = latestVitals?.SystolicBp?.ToString(),
            Diastolic = latestVitals?.DiastolicBp?.ToString(),
            HeartRate = latestVitals?.HeartRateBpm?.ToString(),
            RespiratoryRate = latestVitals?.RespiratoryRateBreathsPerMin?.ToString(),
            Temperature = latestVitals?.TemperatureCelsius?.ToString("F1"),
            HeightCm = latestVitals?.HeightCm?.ToString("F0"),
            WeightKg = latestVitals?.WeightKg?.ToString("F0"),
            Bmi = latestVitals?.Bmi?.ToString("F1"),
            WaistCm = null,
            HipCm = null,
            LengthCm = latestVitals?.HeightCm?.ToString("F0"),
            SkinId = _catalogResolver.EssentiallyNormalCode("lib_skin_extremities"),
            HeentId = _catalogResolver.EssentiallyNormalCode("lib_heent"),
            ChestId = _catalogResolver.EssentiallyNormalCode("lib_chest"),
            HeartId = _catalogResolver.EssentiallyNormalCode("lib_heart"),
            AbdomenId = _catalogResolver.EssentiallyNormalCode("lib_abdomen"),
            NeuroId = _catalogResolver.EssentiallyNormalCode("lib_neuro"),
            RectalId = _catalogResolver.EssentiallyNormalCode("lib_digital_rectal"),
            GuId = _catalogResolver.EssentiallyNormalCode("lib_genitourinary"),
            GenSurveyId = "1",
            NcdAnswers = new YakapNcdAnswersDto(),
            LastUpdatedAt = null,
            UpdatedBy = null
        };

        return Ok(ApiResponse<PhilHealthPatientProfileDto>.Success(defaultProfile));
    }

    /// <summary>
    /// Saves or updates the standalone PhilHealth Patient Profile in ClinicPatient.CustomFields.
    /// Operates completely offline/on-premise without external dependencies.
    /// </summary>
    [HttpPut]
    [HasPermission(ClinicPermissions.PatientsWrite)]
    public async Task<ActionResult<ApiResponse<PhilHealthPatientProfileDto>>> UpdateProfile(
        Guid patientId,
        [FromBody] PhilHealthPatientProfileDto profile,
        CancellationToken ct)
    {
        var clinicId = _clinicContext.ClinicId;
        var patient = await _patientRepo.Query(p => p.Id == patientId && p.ClinicId == clinicId)
            .FirstOrDefaultAsync(ct);

        if (patient == null)
        {
            return NotFound(ApiResponse<PhilHealthPatientProfileDto>.Fail("Patient not found in this clinic."));
        }

        var updatedProfile = profile with
        {
            LastUpdatedAt = DateTimeOffset.UtcNow,
            UpdatedBy = _clinicContext.StaffId?.ToString() ?? "ClinicStaff"
        };

        patient.CustomFields ??= new Dictionary<string, object?>();
        patient.CustomFields["philhealth_profile"] = updatedProfile;

        // Sync primary attributes to ClinicPatient entity
        if (!string.IsNullOrWhiteSpace(updatedProfile.Pin))
        {
            patient.PhilHealthNumber = updatedProfile.Pin;
        }

        if (!string.IsNullOrWhiteSpace(updatedProfile.BloodType))
        {
            patient.BloodType = updatedProfile.BloodType;
        }

        if (updatedProfile.MedicalHistories.Count > 0)
        {
            patient.ChronicConditions = string.Join(", ", updatedProfile.MedicalHistories
                .Select(m => !string.IsNullOrWhiteSpace(m.SpecificDesc) ? m.SpecificDesc : m.Code));
        }

        // Sync medical histories to relational table
        if (updatedProfile.MedicalHistories != null)
        {
            var existingMeds = await _medicalRepo.Query(m => m.PatientId == patientId).ToListAsync(ct);
            var incomingKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var item in updatedProfile.MedicalHistories)
            {
                var code = item.Code?.Trim();
                var desc = !string.IsNullOrWhiteSpace(item.SpecificDesc) ? item.SpecificDesc.Trim() : code ?? "Condition";
                var key = !string.IsNullOrWhiteSpace(code) ? $"code:{code}" : $"title:{desc}";
                incomingKeys.Add(key);

                var existing = existingMeds.FirstOrDefault(e =>
                    (!string.IsNullOrWhiteSpace(code) && string.Equals(e.PhilHealthMdiseaseCode, code, StringComparison.OrdinalIgnoreCase)) ||
                    (string.IsNullOrWhiteSpace(code) && string.Equals(e.ConditionTitle, desc, StringComparison.OrdinalIgnoreCase)));

                if (existing != null)
                {
                    existing.ConditionTitle = desc;
                    existing.PhilHealthMdiseaseCode = code;
                    existing.SpecificDescription = code == "998" ? desc : null;
                    existing.UpdatedAt = DateTime.UtcNow;
                    existing.UpdatedBy = updatedProfile.UpdatedBy;
                    await _medicalRepo.UpdateAsync(existing, ct);
                }
                else
                {
                    var newMed = new PatientPastMedicalHistory
                    {
                        Id = Guid.NewGuid(),
                        TenantId = patient.TenantId,
                        ClinicId = clinicId,
                        PatientId = patientId,
                        ConditionTitle = desc,
                        PhilHealthMdiseaseCode = code,
                        SpecificDescription = code == "998" ? desc : null,
                        CreatedAt = DateTime.UtcNow,
                        CreatedBy = updatedProfile.UpdatedBy ?? "ClinicStaff"
                    };
                    await _medicalRepo.AddAsync(newMed, ct);
                }
            }

            foreach (var existing in existingMeds)
            {
                var key = !string.IsNullOrWhiteSpace(existing.PhilHealthMdiseaseCode)
                    ? $"code:{existing.PhilHealthMdiseaseCode}"
                    : $"title:{existing.ConditionTitle}";
                if (!incomingKeys.Contains(key))
                {
                    await _medicalRepo.DeleteAsync(existing, ct);
                }
            }
        }

        // Sync family histories to relational table
        if (updatedProfile.FamilyHistories != null)
        {
            var existingFams = await _familyRepo.Query(f => f.PatientId == patientId).ToListAsync(ct);
            var incomingKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var item in updatedProfile.FamilyHistories)
            {
                var code = item.Code?.Trim();
                var desc = !string.IsNullOrWhiteSpace(item.SpecificDesc) ? item.SpecificDesc.Trim() : code ?? "Condition";
                var key = !string.IsNullOrWhiteSpace(code) ? $"code:{code}" : $"title:{desc}";
                incomingKeys.Add(key);

                var existing = existingFams.FirstOrDefault(e =>
                    (!string.IsNullOrWhiteSpace(code) && string.Equals(e.PhilHealthMdiseaseCode, code, StringComparison.OrdinalIgnoreCase)) ||
                    (string.IsNullOrWhiteSpace(code) && string.Equals(e.ConditionTitle, desc, StringComparison.OrdinalIgnoreCase)));

                if (existing != null)
                {
                    existing.ConditionTitle = desc;
                    existing.PhilHealthMdiseaseCode = code;
                    existing.SpecificDescription = code == "998" ? desc : null;
                    existing.UpdatedAt = DateTime.UtcNow;
                    existing.UpdatedBy = updatedProfile.UpdatedBy;
                    await _familyRepo.UpdateAsync(existing, ct);
                }
                else
                {
                    var newFam = new PatientFamilyHistory
                    {
                        Id = Guid.NewGuid(),
                        TenantId = patient.TenantId,
                        ClinicId = clinicId,
                        PatientId = patientId,
                        ConditionTitle = desc,
                        PhilHealthMdiseaseCode = code,
                        SpecificDescription = code == "998" ? desc : null,
                        CreatedAt = DateTime.UtcNow,
                        CreatedBy = updatedProfile.UpdatedBy ?? "ClinicStaff"
                    };
                    await _familyRepo.AddAsync(newFam, ct);
                }
            }

            foreach (var existing in existingFams)
            {
                var key = !string.IsNullOrWhiteSpace(existing.PhilHealthMdiseaseCode)
                    ? $"code:{existing.PhilHealthMdiseaseCode}"
                    : $"title:{existing.ConditionTitle}";
                if (!incomingKeys.Contains(key))
                {
                    await _familyRepo.DeleteAsync(existing, ct);
                }
            }
        }

        patient.PersonalMedicalHistoryNotes = updatedProfile.MedicalHistoryNotes?.Trim();
        patient.FamilyMedicalHistoryNotes = updatedProfile.FamilyHistoryNotes?.Trim();

        await _unitOfWork.SaveChangesAsync(ct);

        await _ingestionService.SyncFromProfileAsync(patientId, updatedProfile, ct);

        return Ok(ApiResponse<PhilHealthPatientProfileDto>.Success(updatedProfile));
    }
}
