using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Api.Controllers;

/// <summary>
/// PhilHealth Konsulta eKAS Composite Profile & Enlistment Facade.
/// Provides composite statutory eKAS FPE profile projection and enlistment management for PhilHealth transmittals.
/// Domain-specific clinical mutations (e.g. physical examinations) are decoupled and handled via dedicated domain endpoints.
/// </summary>
[ApiController]
[Route("api/v1/yakap/patients/{patientId:guid}/profile")]
public sealed class YakapPatientProfileController : ControllerBase
{
    private readonly IRepository<Patient> _patientRepo;
    private readonly IRepository<PatientVitals> _vitalsRepo;
    private readonly IRepository<PatientMedicalHistory> _medicalRepo;
    private readonly IRepository<PatientFamilyHistory> _familyRepo;
    private readonly IRepository<PatientImmunization> _immunizationRepo;
    private readonly IRepository<PatientSocialHistory> _socialRepo;
    private readonly IRepository<PatientReproductiveHistory> _reproductiveRepo;
    private readonly IRepository<NcdRiskAssessment> _ncdRepo;
    private readonly IRepository<PatientPhysicalExam>? _physicalExamRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly IPhilHealthCatalogLookup _catalogLookup;

    public YakapPatientProfileController(
        IRepository<Patient> patientRepo,
        IRepository<PatientVitals> vitalsRepo,
        IRepository<PatientMedicalHistory> medicalRepo,
        IRepository<PatientFamilyHistory> familyRepo,
        IRepository<PatientImmunization> immunizationRepo,
        IRepository<PatientSocialHistory> socialRepo,
        IRepository<PatientReproductiveHistory> reproductiveRepo,
        IRepository<NcdRiskAssessment> ncdRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IPhilHealthCatalogLookup catalog,
        IRepository<PatientPhysicalExam>? physicalExamRepo = null)
    {
        _catalogLookup = catalog;
        _patientRepo = patientRepo;
        _vitalsRepo = vitalsRepo;
        _medicalRepo = medicalRepo;
        _familyRepo = familyRepo;
        _immunizationRepo = immunizationRepo;
        _socialRepo = socialRepo;
        _reproductiveRepo = reproductiveRepo;
        _ncdRepo = ncdRepo;
        _physicalExamRepo = physicalExamRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    /// <summary>
    /// Retrieves the standalone PhilHealth Patient Profile for a patient directly from core relational tables.
    /// Operates completely offline/on-premise with zero reliance on untyped JSON blobs in CustomFields.
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

        // Load relational medical histories and family histories
        var relMedHistories = await _medicalRepo.Query(m => m.PatientId == patientId)
            .OrderBy(m => m.ConditionTitle)
            .ToListAsync(ct);

        var relFamHistories = await _familyRepo.Query(f => f.PatientId == patientId)
            .OrderBy(f => f.ConditionTitle)
            .ToListAsync(ct);

        // Load relational immunizations
        var relImms = await _immunizationRepo.Query(i => i.PatientId == patientId)
            .OrderBy(i => i.AdministeredAtUtc)
            .ToListAsync(ct);

        var relChildImms = relImms
            .Where(i => i.PhilHealthLibrary != null && i.PhilHealthLibrary.Equals("lib_immchild", StringComparison.OrdinalIgnoreCase))
            .Select(i => i.PhilHealthCode)
            .Where(c => !string.IsNullOrWhiteSpace(c) && !c.Equals("999", StringComparison.OrdinalIgnoreCase))
            .Select(c => c!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var relYoungwImms = relImms
            .Where(i => i.PhilHealthLibrary != null && i.PhilHealthLibrary.Equals("lib_immyoungw", StringComparison.OrdinalIgnoreCase))
            .Select(i => i.PhilHealthCode)
            .Where(c => !string.IsNullOrWhiteSpace(c) && !c.Equals("999", StringComparison.OrdinalIgnoreCase))
            .Select(c => c!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var relPregwImms = relImms
            .Where(i => i.PhilHealthLibrary != null && i.PhilHealthLibrary.Equals("lib_immpregw", StringComparison.OrdinalIgnoreCase))
            .Select(i => i.PhilHealthCode)
            .Where(c => !string.IsNullOrWhiteSpace(c) && !c.Equals("999", StringComparison.OrdinalIgnoreCase))
            .Select(c => c!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var relElderlyImms = relImms
            .Where(i => i.PhilHealthLibrary != null && i.PhilHealthLibrary.Equals("lib_immelderly", StringComparison.OrdinalIgnoreCase))
            .Select(i => i.PhilHealthCode)
            .Where(c => !string.IsNullOrWhiteSpace(c) && !c.Equals("999", StringComparison.OrdinalIgnoreCase))
            .Select(c => c!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var relOtherImms = relImms
            .Where(i => i.PhilHealthLibrary != null && !i.PhilHealthLibrary.StartsWith("lib_imm", StringComparison.OrdinalIgnoreCase))
            .Select(i => i.PhilHealthCode)
            .Where(c => !string.IsNullOrWhiteSpace(c) && !c.Equals("999", StringComparison.OrdinalIgnoreCase))
            .Select(c => c!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        // Load core relational social, reproductive, NCD, physical exam, and vitals records
        var relSocial = await _socialRepo.Query(s => s.PatientId == patientId).FirstOrDefaultAsync(ct);
        var relReproductive = await _reproductiveRepo.Query(r => r.PatientId == patientId).FirstOrDefaultAsync(ct);
        var relNcd = await _ncdRepo.Query(n => n.PatientId == patientId).OrderByDescending(n => n.AssessmentDate).FirstOrDefaultAsync(ct);
        var relPhysicalExam = _physicalExamRepo != null
            ? await _physicalExamRepo.Query(pe => pe.PatientId == patientId).FirstOrDefaultAsync(ct)
            : null;
        var latestVitals = await _vitalsRepo.Query(v => v.PatientId == patientId)
            .OrderByDescending(v => v.CreatedAt)
            .FirstOrDefaultAsync(ct);

        var asOf = DateTime.UtcNow;
        var birthDate = patient.DateOfBirth;
        int ageYears = asOf.Year - birthDate.Year;
        if (DateOnly.FromDateTime(asOf) < birthDate.AddYears(ageYears))
            ageYears--;

        bool isFemale = patient.Gender == ClinicEz.Clinic.Domain.Enums.Gender.Female;
        bool isPediatric = ageYears < 18;
        bool isSenior = ageYears >= 60;

        string ResolveConditionCode(string? code, string? title)
        {
            if (!string.IsNullOrWhiteSpace(code)) return code;
            if (!string.IsNullOrWhiteSpace(title))
            {
                var match = _catalogLookup.FindByDescription("lib_mdiseases", title)
                    ?? _catalogLookup.SearchByCodeOrDescription("lib_mdiseases", title).FirstOrDefault();
                if (match != null) return match.Code;
            }
            return _catalogLookup.FindByDescription("lib_mdiseases", "Others")?.Code ?? "998";
        }

        var defaultMedHistories = relMedHistories.Select(m => new PhilHealthConditionEntryDto(
            Code: ResolveConditionCode(m.PhilHealthMdiseaseCode, m.ConditionTitle),
            SpecificDesc: !string.IsNullOrWhiteSpace(m.SpecificDescription) ? m.SpecificDescription : m.ConditionTitle)).ToList();

        var defaultFamHistories = relFamHistories.Select(f => new PhilHealthConditionEntryDto(
            Code: ResolveConditionCode(f.PhilHealthMdiseaseCode, f.ConditionTitle),
            SpecificDesc: !string.IsNullOrWhiteSpace(f.SpecificDescription) ? f.SpecificDescription : f.ConditionTitle)).ToList();

        var isDependentDefault = isPediatric;

        static string FormatYn(bool? val) => val switch
        {
            true => "Y",
            false => "N",
            null => string.Empty
        };

        // Map NCD Answers from relational NcdRiskAssessment if available
        var ncdAnswers = relNcd != null
            ? new YakapNcdAnswersDto(
                Qid1Yn: FormatYn(relNcd.EatsProcessedFoodWeekly),
                Qid2Yn: FormatYn(relNcd.ThreeServingsVegetablesDaily),
                Qid3Yn: FormatYn(relNcd.TwoToThreeServingsFruitDaily),
                Qid4Yn: FormatYn(relNcd.PhysicalActivityAtLeast150MinsWeekly),
                Qid5Ynx: relNcd.DiagnosedDiabetes ?? string.Empty,
                Qid6Yn: FormatYn(relNcd.HasPolyphagia),
                Qid7Yn: FormatYn(relNcd.HasPolydipsia),
                Qid8Yn: FormatYn(relNcd.HasPolyuria),
                Qid9Yn: FormatYn(relNcd.HasChestPain),
                Qid10Yn: relNcd.HasChestPain == true ? FormatYn(relNcd.PainInCenterOfChestOrLeftArm) : string.Empty,
                Qid11Yn: relNcd.HasChestPain == true ? FormatYn(relNcd.PainWhenWalkingUphill) : string.Empty,
                Qid12Yn: (relNcd.HasChestPain == true && relNcd.PainWhenWalkingUphill == true) ? FormatYn(relNcd.SlowsDownWhenPainOccurs) : string.Empty,
                Qid13Yn: (relNcd.HasChestPain == true && relNcd.PainWhenWalkingUphill == true) ? FormatYn(relNcd.PainRelievedWithin10Mins) : string.Empty,
                Qid14Yn: (relNcd.HasChestPain == true && relNcd.PainWhenWalkingUphill == true) ? FormatYn(relNcd.PainRelievedByNitrates) : string.Empty,
                Qid15Yn: FormatYn(relNcd.SevereChestPainOver30Mins),
                Qid16Yn: FormatYn(relNcd.TransientNeurologicalDeficits),
                Qid17Abcde: !string.IsNullOrWhiteSpace(relNcd.RiskBand) ? relNcd.RiskBand.Replace("Band", "") : "A",
                Qid18Yn: relNcd.DiagnosedDiabetes == "Y" ? (relNcd.DiabetesMedicationStatus ?? string.Empty) : string.Empty,
                Qid19Yn: FormatYn(relNcd.HasRaisedBloodGlucose),
                Qid19Fbsmg: relNcd.HasRaisedBloodGlucose == true ? (relNcd.FastingBloodSugarMgDl?.ToString() ?? string.Empty) : string.Empty,
                Qid19Fbsmmol: relNcd.HasRaisedBloodGlucose == true ? (relNcd.FastingBloodSugarMmolL?.ToString() ?? string.Empty) : string.Empty,
                Qid19Fbsdate: relNcd.HasRaisedBloodGlucose == true ? (relNcd.FastingBloodSugarDate?.ToString("yyyy-MM-dd") ?? string.Empty) : string.Empty,
                Qid20Yn: FormatYn(relNcd.HasRaisedBloodLipids),
                Qid20Choleval: relNcd.HasRaisedBloodLipids == true ? (relNcd.TotalCholesterolMgDl?.ToString() ?? string.Empty) : string.Empty,
                Qid20Choledate: relNcd.HasRaisedBloodLipids == true ? (relNcd.TotalCholesterolDate?.ToString("yyyy-MM-dd") ?? string.Empty) : string.Empty,
                Qid21Yn: FormatYn(relNcd.UrineKetonesPresent),
                Qid21Ketonval: relNcd.UrineKetonesPresent == true ? (relNcd.UrineKetonesValue ?? string.Empty) : string.Empty,
                Qid21Ketondate: relNcd.UrineKetonesPresent == true ? (relNcd.UrineKetonesDate?.ToString("yyyy-MM-dd") ?? string.Empty) : string.Empty,
                Qid22Yn: FormatYn(relNcd.UrineProteinPresent),
                Qid22Proteinval: relNcd.UrineProteinPresent == true ? (relNcd.UrineProteinValue ?? string.Empty) : string.Empty,
                Qid22Proteindate: relNcd.UrineProteinPresent == true ? (relNcd.UrineProteinDate?.ToString("yyyy-MM-dd") ?? string.Empty) : string.Empty,
                Qid23Yn: FormatYn(relNcd.HasHistoryAnginaHeartAttack),
                Qid24Yn: FormatYn(relNcd.HasHistoryStrokeOrTia))
            : new YakapNcdAnswersDto();

        var profile = new PhilHealthPatientProfileDto
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
            BloodType = patient.BloodType?.ToString(),
            MedicalHistories = defaultMedHistories,
            SurgicalHistories = [],
            FamilyHistories = defaultFamHistories,
            MedicalHistoryNotes = null,
            FamilyHistoryNotes = null,

            // Relational Social & Behavioral History
            IsSmoker = relSocial?.IsSmoker ?? false,
            SmokingStatus = relSocial?.SmokingStatus ?? "never",
            CigarettesPerDay = relSocial?.CigarettesPerDay?.ToString() ?? (relSocial?.PacksPerDay != null ? ((int)(relSocial.PacksPerDay.Value * 20)).ToString() : null),
            PacksPerDay = relSocial?.PacksPerDay?.ToString(),
            YearsSmoking = relSocial?.YearsSmoking?.ToString(),
            SmokingPackYears = relSocial?.SmokingPackYears?.ToString(),
            SmokingStoppedDate = relSocial?.SmokingStoppedDate?.ToString("yyyy-MM-dd"),
            IsAlcoholDrinker = relSocial?.IsAlcoholDrinker ?? false,
            AlcoholStatus = relSocial?.AlcoholStatus ?? "never",
            BottlesPerDay = relSocial?.AlcoholBottlesPerDay?.ToString(),
            AlcoholDrinksPerWeek = relSocial?.AlcoholDrinksPerWeek?.ToString(),
            AlcoholFrequency = relSocial?.AlcoholFrequency,
            IllDrugUser = relSocial?.UsesIllicitDrugs ?? false,
            DrugTypes = relSocial?.DrugTypes,
            SubstanceUseHistory = relSocial?.SubstanceUseHistory,
            IsSexuallyActive = relSocial?.IsSexuallyActive ?? false,
            PhysicalActivityFrequency = relSocial?.PhysicalActivityFrequency,
            DietaryHabits = relSocial?.DietaryHabits,
            Remarks = relSocial?.Remarks,

            // Immunizations
            ChildImmunizations = relChildImms,
            YoungWomanImmunizations = relYoungwImms,
            PregnantWomanImmunizations = relPregwImms,
            ElderlyImmunizations = relElderlyImms,
            OtherImmunizations = relOtherImms,

            // Reproductive History
            MenstrualApplicable = relReproductive?.IsApplicable ?? (isFemale && ageYears >= 9),
            MenarcheAge = relReproductive?.MenarcheAge?.ToString(),
            LastMensPeriod = relReproductive?.LastMenstrualPeriod?.ToString("yyyy-MM-dd"),
            PeriodDurationDays = relReproductive?.PeriodDurationDays?.ToString(),
            CycleIntervalDays = relReproductive?.CycleIntervalDays?.ToString(),
            PadsPerDay = relReproductive?.PadsPerDay?.ToString(),
            BirthControlMethod = relReproductive?.ContraceptiveMethod,
            IsMenopause = relReproductive?.IsMenopausal ?? false,
            MenopauseAge = relReproductive?.MenopauseAge?.ToString(),
            PregnancyApplicable = relReproductive != null && (relReproductive.Gravidity > 0 || relReproductive.Parity > 0),
            Gravida = relReproductive?.Gravidity ?? 0,
            Para = relReproductive?.Parity ?? 0,
            DeliveryType = relReproductive?.DeliveryType == "Vaginal" ? "V" : (relReproductive?.DeliveryType == "Cesarean" ? "C" : null),
            FullTermCount = relReproductive?.TermBirths ?? 0,
            PrematureCount = relReproductive?.PretermBirths ?? 0,
            AbortionCount = relReproductive?.Abortions ?? 0,
            LivingChildrenCount = relReproductive?.LivingChildren ?? 0,
            PreEclampsiaHypertension = relReproductive?.HadPreEclampsiaHypertension ?? false,
            FamilyPlanningCounseling = relReproductive?.ReceivedFamilyPlanningCounseling ?? false,

            // Vitals & Anthropometrics
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
            SkinId = !string.IsNullOrWhiteSpace(relPhysicalExam?.SkinId)
                ? relPhysicalExam.SkinId
                : GetEssentiallyNormalCode("lib_skin_extremities"),
            SkinRemarks = relPhysicalExam?.SkinRemarks,
            HeentId = !string.IsNullOrWhiteSpace(relPhysicalExam?.HeentId)
                ? relPhysicalExam.HeentId
                : GetEssentiallyNormalCode("lib_heent"),
            HeentRemarks = relPhysicalExam?.HeentRemarks,
            ChestId = !string.IsNullOrWhiteSpace(relPhysicalExam?.ChestId)
                ? relPhysicalExam.ChestId
                : GetEssentiallyNormalCode("lib_chest"),
            ChestRemarks = relPhysicalExam?.ChestLungsRemarks,
            HeartId = !string.IsNullOrWhiteSpace(relPhysicalExam?.HeartId)
                ? relPhysicalExam.HeartId
                : GetEssentiallyNormalCode("lib_heart"),
            HeartRemarks = relPhysicalExam?.HeartRemarks,
            AbdomenId = !string.IsNullOrWhiteSpace(relPhysicalExam?.AbdomenId)
                ? relPhysicalExam.AbdomenId
                : GetEssentiallyNormalCode("lib_abdomen"),
            AbdomenRemarks = relPhysicalExam?.AbdomenRemarks,
            NeuroId = !string.IsNullOrWhiteSpace(relPhysicalExam?.NeuroId)
                ? relPhysicalExam.NeuroId
                : GetEssentiallyNormalCode("lib_neuro"),
            NeuroRemarks = relPhysicalExam?.NeurologicalRemarks,
            RectalId = !string.IsNullOrWhiteSpace(relPhysicalExam?.RectalId)
                ? relPhysicalExam.RectalId
                : GetEssentiallyNormalCode("lib_digital_rectal"),
            RectalRemarks = relPhysicalExam?.DigitalRectalRemarks,
            GuId = !string.IsNullOrWhiteSpace(relPhysicalExam?.GuId)
                ? relPhysicalExam.GuId
                : GetEssentiallyNormalCode("lib_genitourinary"),
            GuRemarks = relPhysicalExam?.GenitourinaryRemarks,
            GenSurveyId = !string.IsNullOrWhiteSpace(relPhysicalExam?.GenSurveyId)
                ? relPhysicalExam.GenSurveyId
                : "1",
            GenSurveyRemarks = relPhysicalExam?.GeneralSurveyRemarks,
            NcdAnswers = ncdAnswers,
            LastUpdatedAt = DateTimeOffset.UtcNow,
            UpdatedBy = null
        };

        return Ok(ApiResponse<PhilHealthPatientProfileDto>.Success(profile));
    }

    /// <summary>
    /// Updates the standalone PhilHealth Patient Profile directly in relational tables.
    /// Acts as the PhilHealth Konsulta eKAS Composite Profile & Enlistment Facade.
    /// Note: Physical examination mutations are decoupled and handled via PatientsController (/api/v1/patients/{patientId}/physical-exam).
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

        // Remove legacy CustomFields["philhealth_profile"] if present
        if (patient.CustomFields != null && patient.CustomFields.ContainsKey("philhealth_profile"))
        {
            patient.CustomFields.Remove("philhealth_profile");
        }

        // Sync primary attributes to ClinicPatient entity
        if (!string.IsNullOrWhiteSpace(updatedProfile.Pin))
        {
            patient.PhilHealthNumber = updatedProfile.Pin;
        }

        if (!string.IsNullOrWhiteSpace(updatedProfile.BloodType) &&
            Enum.TryParse<ClinicEz.Clinic.Domain.Enums.BloodType>(updatedProfile.BloodType, true, out var parsedBloodType))
        {
            patient.BloodType = parsedBloodType;
        }

        // Sync social history to core relational table
        var existingSocial = await _socialRepo.Query(s => s.PatientId == patientId).FirstOrDefaultAsync(ct);

        bool isSmoker;
        DateOnly? stoppedDate = null;
        if (DateOnly.TryParse(profile.SmokingStoppedDate, out var parsedStop))
        {
            stoppedDate = parsedStop;
        }

        var smkStatus = profile.SmokingStatus?.ToLowerInvariant();
        if (smkStatus is "current" or "y")
        {
            isSmoker = true;
            stoppedDate = null;
        }
        else if (smkStatus is "quit" or "former" or "x")
        {
            isSmoker = false;
            stoppedDate ??= existingSocial?.SmokingStoppedDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
        }
        else if (smkStatus is "never" or "n")
        {
            isSmoker = false;
            stoppedDate = null;
        }
        else
        {
            isSmoker = profile.IsSmoker;
            if (!isSmoker && stoppedDate.HasValue)
            {
                // Stopped date exists -> former smoker
            }
        }

        bool isDrinker;
        string? alcFreq = profile.AlcoholFrequency?.Trim();
        var alcStatus = profile.AlcoholStatus?.ToLowerInvariant();
        if (alcStatus is "current" or "y")
        {
            isDrinker = true;
            if (string.Equals(alcFreq, "Quit", StringComparison.OrdinalIgnoreCase) || string.Equals(alcFreq, "Never", StringComparison.OrdinalIgnoreCase))
            {
                alcFreq = "Occasional";
            }
        }
        else if (alcStatus is "quit" or "former" or "x")
        {
            isDrinker = false;
            alcFreq = "Quit";
        }
        else if (alcStatus is "never" or "n")
        {
            isDrinker = false;
            alcFreq = null;
        }
        else
        {
            isDrinker = profile.IsAlcoholDrinker;
        }

        decimal? packsPerDay = decimal.TryParse(profile.PacksPerDay, out var ppd) ? ppd : null;
        int? cigsPerDay = int.TryParse(profile.CigarettesPerDay, out var cpd) ? cpd : (packsPerDay.HasValue ? (int)(packsPerDay.Value * 20) : null);
        int? yearsSmoking = int.TryParse(profile.YearsSmoking, out var ys) ? ys : null;
        decimal? packYears = decimal.TryParse(profile.SmokingPackYears, out var spy) ? spy : (packsPerDay.HasValue && yearsSmoking.HasValue ? Math.Round(packsPerDay.Value * yearsSmoking.Value, 2) : null);
        int? bottlesPerDay = int.TryParse(profile.BottlesPerDay, out var bpd) ? bpd : null;
        int? drinksPerWeek = int.TryParse(profile.AlcoholDrinksPerWeek, out var dpw) ? dpw : null;

        if (existingSocial == null)
        {
            existingSocial = new PatientSocialHistory
            {
                Id = Guid.NewGuid(),
                TenantId = patient.TenantId ?? _clinicContext.TenantId,
                ClinicId = clinicId,
                PatientId = patientId,
                IsSmoker = isSmoker,
                PacksPerDay = isSmoker ? packsPerDay : null,
                CigarettesPerDay = isSmoker ? cigsPerDay : null,
                YearsSmoking = yearsSmoking,
                SmokingPackYears = packYears,
                SmokingStoppedDate = stoppedDate,
                IsAlcoholDrinker = isDrinker,
                AlcoholDrinksPerWeek = isDrinker ? drinksPerWeek : null,
                AlcoholBottlesPerDay = isDrinker ? bottlesPerDay : null,
                AlcoholFrequency = alcFreq,
                UsesIllicitDrugs = profile.IllDrugUser,
                DrugTypes = profile.DrugTypes?.Trim(),
                SubstanceUseHistory = profile.SubstanceUseHistory?.Trim(),
                IsSexuallyActive = profile.IsSexuallyActive,
                PhysicalActivityFrequency = profile.PhysicalActivityFrequency?.Trim(),
                DietaryHabits = profile.DietaryHabits?.Trim(),
                Remarks = profile.Remarks?.Trim(),
                CreatedAt = DateTime.UtcNow,
                CreatedBy = updatedProfile.UpdatedBy ?? "ClinicStaff"
            };
            await _socialRepo.AddAsync(existingSocial, ct);
        }
        else
        {
            existingSocial.IsSmoker = isSmoker;
            existingSocial.PacksPerDay = isSmoker ? packsPerDay : null;
            existingSocial.CigarettesPerDay = isSmoker ? cigsPerDay : null;
            existingSocial.YearsSmoking = yearsSmoking;
            existingSocial.SmokingPackYears = packYears;
            existingSocial.SmokingStoppedDate = stoppedDate;
            existingSocial.IsAlcoholDrinker = isDrinker;
            existingSocial.AlcoholDrinksPerWeek = isDrinker ? drinksPerWeek : null;
            existingSocial.AlcoholBottlesPerDay = isDrinker ? bottlesPerDay : null;
            existingSocial.AlcoholFrequency = alcFreq;
            existingSocial.UsesIllicitDrugs = profile.IllDrugUser;
            existingSocial.DrugTypes = profile.DrugTypes?.Trim();
            existingSocial.SubstanceUseHistory = profile.SubstanceUseHistory?.Trim();
            existingSocial.IsSexuallyActive = profile.IsSexuallyActive;
            existingSocial.PhysicalActivityFrequency = profile.PhysicalActivityFrequency?.Trim();
            existingSocial.DietaryHabits = profile.DietaryHabits?.Trim();
            existingSocial.Remarks = profile.Remarks?.Trim();
            existingSocial.UpdatedAt = DateTime.UtcNow;
            existingSocial.UpdatedBy = updatedProfile.UpdatedBy ?? "ClinicStaff";
            _socialRepo.Update(existingSocial);
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
                    _medicalRepo.Update(existing);
                }
                else
                {
                    var newMed = new PatientMedicalHistory
                    {
                        Id = Guid.NewGuid(),
                        TenantId = patient.TenantId ?? _clinicContext.TenantId,
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
                    _medicalRepo.Remove(existing);
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
                    _familyRepo.Update(existing);
                }
                else
                {
                    var newFam = new PatientFamilyHistory
                    {
                        Id = Guid.NewGuid(),
                        TenantId = patient.TenantId ?? _clinicContext.TenantId,
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
                    _familyRepo.Remove(existing);
                }
            }
        }

        // Sync immunizations to relational table
        var existingImms = await _immunizationRepo.Query(i => i.PatientId == patientId).ToListAsync(ct);

        async Task SyncCohort(List<string>? incomingCodes, string library, bool isApplicable)
        {
            if (!isApplicable) return;

            var targetCodes = (incomingCodes ?? [])
                .Where(c => !string.IsNullOrWhiteSpace(c) && !c.Equals("999", StringComparison.OrdinalIgnoreCase))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            foreach (var code in targetCodes)
            {
                var exists = existingImms.Any(i =>
                    string.Equals(i.PhilHealthLibrary, library, StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(i.PhilHealthCode, code, StringComparison.OrdinalIgnoreCase));

                if (!exists)
                {
                    var vaccineName = _catalogLookup.Find(library, code)?.Description
                        ?? ResolveStatutoryVaccineName(library, code);

                    var newImm = new PatientImmunization
                    {
                        Id = Guid.NewGuid(),
                        TenantId = patient.TenantId ?? _clinicContext.TenantId,
                        ClinicId = clinicId,
                        PatientId = patientId,
                        PatientName = $"{patient.FirstName} {patient.LastName}".Trim(),
                        PhilHealthLibrary = library,
                        PhilHealthCode = code,
                        VaccineName = vaccineName,
                        LotBatchNumber = "HISTORICAL",
                        ExpirationDate = DateOnly.FromDateTime(DateTime.UtcNow),
                        DoseSequence = 1,
                        IsSeriesCompleted = true,
                        Route = "Intramuscular",
                        InjectionSite = "Left Deltoid",
                        AdministeredAtUtc = DateTime.UtcNow,
                        AdministeredByStaffId = _clinicContext.StaffId ?? Guid.Empty,
                        AdministeredByStaffName = updatedProfile.UpdatedBy ?? "ClinicStaff",
                        IsHistorical = true,
                        HistoricalFacilityName = "Patient Profile / Historical",
                        Remarks = "Recorded via PhilHealth patient profile",
                        HasAdverseReaction = false,
                        AdverseReactionSeverity = "None"
                    };
                    await _immunizationRepo.AddAsync(newImm, ct);
                }
            }

            // Remove unselected historical records belonging to this library
            foreach (var imm in existingImms.Where(i =>
                string.Equals(i.PhilHealthLibrary, library, StringComparison.OrdinalIgnoreCase) &&
                i.IsHistorical && !i.ConsultationEncounterId.HasValue))
            {
                if (imm.PhilHealthCode != null && !targetCodes.Contains(imm.PhilHealthCode))
                {
                    _immunizationRepo.Remove(imm);
                }
            }
        }

        var updateBirthDate = patient.DateOfBirth;
        var updateAsOf = DateTime.UtcNow;
        int updateAgeYears = updateAsOf.Year - updateBirthDate.Year;
        if (DateOnly.FromDateTime(updateAsOf) < updateBirthDate.AddYears(updateAgeYears))
            updateAgeYears--;
        bool updateIsFemale = patient.Gender == ClinicEz.Clinic.Domain.Enums.Gender.Female;
        bool updateIsPediatric = updateAgeYears < 18;
        bool updateIsSenior = updateAgeYears >= 60;

        await SyncCohort(updatedProfile.ChildImmunizations, "lib_immchild", updateIsPediatric || (updatedProfile.ChildImmunizations != null && updatedProfile.ChildImmunizations.Count > 0));
        await SyncCohort(updatedProfile.YoungWomanImmunizations, "lib_immyoungw", (updateIsFemale && updateAgeYears >= 9 && updateAgeYears <= 49) || (updatedProfile.YoungWomanImmunizations != null && updatedProfile.YoungWomanImmunizations.Count > 0));
        await SyncCohort(updatedProfile.PregnantWomanImmunizations, "lib_immpregw", (updateIsFemale && updateAgeYears >= 9 && updateAgeYears <= 49) || (updatedProfile.PregnantWomanImmunizations != null && updatedProfile.PregnantWomanImmunizations.Count > 0));
        await SyncCohort(updatedProfile.ElderlyImmunizations, "lib_immelderly", updateIsSenior || (updatedProfile.ElderlyImmunizations != null && updatedProfile.ElderlyImmunizations.Count > 0));

        await _unitOfWork.SaveChangesAsync(ct);

        return Ok(ApiResponse<PhilHealthPatientProfileDto>.Success(updatedProfile));
    }

    private string GetEssentiallyNormalCode(string library) =>
        _catalogLookup.List(library)
            .FirstOrDefault(r => r.IsActive && r.Description.StartsWith("Essentially normal", StringComparison.OrdinalIgnoreCase))
            ?.Code ?? "1";

    private static string ResolveStatutoryVaccineName(string library, string code)
    {
        var lib = (library ?? string.Empty).ToLowerInvariant();
        var c = (code ?? string.Empty).Trim().ToUpperInvariant();

        if (lib.Contains("child"))
        {
            return c switch
            {
                "C01" => "BCG (Bacillus Calmette-Guérin)",
                "C02" => "OPV 1 (Oral Polio Vaccine 1)",
                "C03" => "OPV 2 (Oral Polio Vaccine 2)",
                "C04" => "OPV 3 (Oral Polio Vaccine 3)",
                "C05" => "DPT-HepB-Hib 1 (Pentavalent 1)",
                "C06" => "DPT-HepB-Hib 2 (Pentavalent 2)",
                "C07" => "DPT-HepB-Hib 3 (Pentavalent 3)",
                "C08" => "Measles Vaccine (MCV1)",
                "C09" => "Hepatitis B (Birth Dose)",
                "C10" => "Rotavirus Vaccine 1",
                "C11" => "Rotavirus Vaccine 2",
                "C12" => "Inactivated Polio Vaccine (IPV)",
                "C13" => "MMR 1 (Measles, Mumps, Rubella)",
                _ => $"Child Vaccine ({code})"
            };
        }

        if (lib.Contains("preg"))
        {
            return c switch
            {
                "P01" => "Tetanus Toxoid / Td 1",
                "P02" => "Tetanus Toxoid / Td 2",
                "P03" => "Tetanus Toxoid / Td 3",
                "P04" => "Tetanus Toxoid / Td 4",
                "P05" => "Tetanus Toxoid / Td 5",
                _ => $"Maternal Vaccine ({code})"
            };
        }

        if (lib.Contains("elderly"))
        {
            return c switch
            {
                "E01" => "Pneumococcal Polysaccharide Vaccine (PPSV23 / PCV13)",
                "E02" => "Seasonal Influenza Vaccine (Quadrivalent)",
                _ => $"Senior Citizen Vaccine ({code})"
            };
        }

        return $"Vaccine ({code})";
    }
}
