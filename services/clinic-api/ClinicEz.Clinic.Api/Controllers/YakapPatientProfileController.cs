using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Common.Interfaces;
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
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly PhilHealthCatalogResolver _catalogResolver;

    public YakapPatientProfileController(
        IRepository<ClinicPatient> patientRepo,
        IRepository<TriageVitals> vitalsRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IPhilHealthCatalogLookup catalog)
    {
        _catalogResolver = new PhilHealthCatalogResolver(catalog);
        _patientRepo = patientRepo;
        _vitalsRepo = vitalsRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
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
        var defaultMedHistories = _catalogResolver.ResolveKnownConditions(patient.ChronicConditions);

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
            FamilyHistories = [],
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
            SkinId = "1",
            HeentId = "1",
            ChestId = "1",
            HeartId = "1",
            AbdomenId = "1",
            NeuroId = "1",
            RectalId = "1",
            GuId = "1",
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

        await _unitOfWork.SaveChangesAsync(ct);

        return Ok(ApiResponse<PhilHealthPatientProfileDto>.Success(updatedProfile));
    }
}
