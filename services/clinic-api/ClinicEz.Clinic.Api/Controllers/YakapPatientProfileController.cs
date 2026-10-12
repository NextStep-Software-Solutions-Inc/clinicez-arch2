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
    private readonly IRepository<PatientImmunization> _immunizationRepo;
    private readonly IRepository<PatientSocialHistory> _socialRepo;
    private readonly IRepository<PatientReproductiveHistory> _reproductiveRepo;
    private readonly IRepository<NcdRiskAssessment> _ncdRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;
    private readonly PhilHealthCatalogResolver _catalogResolver;
    private readonly IPhilHealthCatalogLookup _catalogLookup;
    private readonly ILegacyPatientProfileIngestionService _ingestionService;

    public YakapPatientProfileController(
        IRepository<ClinicPatient> patientRepo,
        IRepository<TriageVitals> vitalsRepo,
        IRepository<PatientPastMedicalHistory> medicalRepo,
        IRepository<PatientFamilyHistory> familyRepo,
        IRepository<PatientImmunization> immunizationRepo,
        IRepository<PatientSocialHistory> socialRepo,
        IRepository<PatientReproductiveHistory> reproductiveRepo,
        IRepository<NcdRiskAssessment> ncdRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IPhilHealthCatalogLookup catalog,
        ILegacyPatientProfileIngestionService ingestionService)
    {
        _catalogResolver = new PhilHealthCatalogResolver(catalog);
        _catalogLookup = catalog;
        _patientRepo = patientRepo;
        _vitalsRepo = vitalsRepo;
        _medicalRepo = medicalRepo;
        _familyRepo = familyRepo;
        _immunizationRepo = immunizationRepo;
        _socialRepo = socialRepo;
        _reproductiveRepo = reproductiveRepo;
        _ncdRepo = ncdRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _ingestionService = ingestionService;
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

        await _ingestionService.EnsureIngestedAsync(patientId, ct);

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
            .Where(i => i.PhilHealthLibrary.Equals("lib_immchild", StringComparison.OrdinalIgnoreCase))
            .Select(i => i.PhilHealthCode)
            .Where(c => !string.IsNullOrWhiteSpace(c) && !c.Equals("999", StringComparison.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var relYoungwImms = relImms
            .Where(i => i.PhilHealthLibrary.Equals("lib_immyoungw", StringComparison.OrdinalIgnoreCase))
            .Select(i => i.PhilHealthCode)
            .Where(c => !string.IsNullOrWhiteSpace(c) && !c.Equals("999", StringComparison.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var relPregwImms = relImms
            .Where(i => i.PhilHealthLibrary.Equals("lib_immpregw", StringComparison.OrdinalIgnoreCase))
            .Select(i => i.PhilHealthCode)
            .Where(c => !string.IsNullOrWhiteSpace(c) && !c.Equals("999", StringComparison.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var relElderlyImms = relImms
            .Where(i => i.PhilHealthLibrary.Equals("lib_immelderly", StringComparison.OrdinalIgnoreCase))
            .Select(i => i.PhilHealthCode)
            .Where(c => !string.IsNullOrWhiteSpace(c) && !c.Equals("999", StringComparison.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var relOtherImms = relImms
            .Where(i => !i.PhilHealthLibrary.StartsWith("lib_imm", StringComparison.OrdinalIgnoreCase))
            .Select(i => i.PhilHealthCode)
            .Where(c => !string.IsNullOrWhiteSpace(c) && !c.Equals("999", StringComparison.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        // Load core relational social, reproductive, NCD, and vitals records
        var relSocial = await _socialRepo.Query(s => s.PatientId == patientId).FirstOrDefaultAsync(ct);
        var relReproductive = await _reproductiveRepo.Query(r => r.PatientId == patientId).FirstOrDefaultAsync(ct);
        var relNcd = await _ncdRepo.Query(n => n.PatientId == patientId).OrderByDescending(n => n.AssessmentDate).FirstOrDefaultAsync(ct);
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

        var defaultMedHistories = relMedHistories.Count > 0
            ? relMedHistories.Select(m => new PhilHealthConditionEntryDto(
                Code: !string.IsNullOrWhiteSpace(m.PhilHealthMdiseaseCode) ? m.PhilHealthMdiseaseCode : (_catalogResolver.ResolveKnownConditions(m.ConditionTitle).FirstOrDefault()?.Code ?? "998"),
                SpecificDesc: !string.IsNullOrWhiteSpace(m.SpecificDescription) ? m.SpecificDescription : m.ConditionTitle)).ToList()
            : _catalogResolver.ResolveKnownConditions(patient.ChronicConditions);

        var defaultFamHistories = relFamHistories.Select(f => new PhilHealthConditionEntryDto(
            Code: !string.IsNullOrWhiteSpace(f.PhilHealthMdiseaseCode) ? f.PhilHealthMdiseaseCode : (_catalogResolver.ResolveKnownConditions(f.ConditionTitle).FirstOrDefault()?.Code ?? "998"),
            SpecificDesc: !string.IsNullOrWhiteSpace(f.SpecificDescription) ? f.SpecificDescription : f.ConditionTitle)).ToList();

        var isDependentDefault = isPediatric;

        // Map NCD Answers from relational NcdRiskAssessment if available
        var ncdAnswers = relNcd != null
            ? new YakapNcdAnswersDto(
                Qid1Yn: relNcd.EatsProcessedFoodWeekly ? "Y" : "N",
                Qid2Yn: relNcd.ThreeServingsVegetablesDaily ? "Y" : "N",
                Qid3Yn: relNcd.TwoToThreeServingsFruitDaily ? "Y" : "N",
                Qid4Yn: relNcd.PhysicalActivityAtLeast150MinsWeekly ? "Y" : "N",
                Qid5Ynx: relNcd.DiagnosedDiabetes ?? "N",
                Qid6Yn: relNcd.HasPolyphagia ? "Y" : "N",
                Qid7Yn: relNcd.HasPolydipsia ? "Y" : "N",
                Qid8Yn: relNcd.HasPolyuria ? "Y" : "N",
                Qid9Yn: relNcd.HasChestPain ? "Y" : "N",
                Qid10Yn: relNcd.PainInCenterOfChestOrLeftArm ? "Y" : "N",
                Qid11Yn: relNcd.PainWhenWalkingUphill ? "Y" : "N",
                Qid12Yn: relNcd.SlowsDownWhenPainOccurs ? "Y" : "N",
                Qid13Yn: relNcd.PainRelievedWithin10Mins ? "Y" : "N",
                Qid14Yn: relNcd.PainRelievedByNitrates ? "Y" : "N",
                Qid15Yn: relNcd.SevereChestPainOver30Mins ? "Y" : "N",
                Qid16Yn: relNcd.TransientNeurologicalDeficits ? "Y" : "N",
                Qid17Abcde: !string.IsNullOrWhiteSpace(relNcd.RiskBand) ? relNcd.RiskBand.Replace("Band", "") : "A",
                Qid18Yn: relNcd.DiabetesMedicationStatus ?? "N",
                Qid19Yn: relNcd.HasRaisedBloodGlucose ? "Y" : "N",
                Qid19Fbsmg: relNcd.FastingBloodSugarMgDl?.ToString() ?? string.Empty,
                Qid19Fbsmmol: relNcd.FastingBloodSugarMmolL?.ToString() ?? string.Empty,
                Qid19Fbsdate: relNcd.FastingBloodSugarDate?.ToString("yyyy-MM-dd") ?? string.Empty,
                Qid20Yn: relNcd.HasRaisedBloodLipids ? "Y" : "N",
                Qid20Choleval: relNcd.TotalCholesterolMgDl?.ToString() ?? string.Empty,
                Qid20Choledate: relNcd.TotalCholesterolDate?.ToString("yyyy-MM-dd") ?? string.Empty,
                Qid21Yn: relNcd.UrineKetonesPresent ? "Y" : "N",
                Qid21Ketonval: relNcd.UrineKetonesValue ?? string.Empty,
                Qid21Ketondate: relNcd.UrineKetonesDate?.ToString("yyyy-MM-dd") ?? string.Empty,
                Qid22Yn: relNcd.UrineProteinPresent ? "Y" : "N",
                Qid22Proteinval: relNcd.UrineProteinValue ?? string.Empty,
                Qid22Proteindate: relNcd.UrineProteinDate?.ToString("yyyy-MM-dd") ?? string.Empty,
                Qid23Yn: relNcd.HasHistoryAnginaHeartAttack ? "Y" : "N",
                Qid24Yn: relNcd.HasHistoryStrokeOrTia ? "Y" : "N")
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
            BloodType = patient.BloodType,
            MedicalHistories = defaultMedHistories,
            SurgicalHistories = [],
            FamilyHistories = defaultFamHistories,
            MedicalHistoryNotes = patient.PersonalMedicalHistoryNotes,
            FamilyHistoryNotes = patient.FamilyMedicalHistoryNotes,

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
            NcdAnswers = ncdAnswers,
            LastUpdatedAt = DateTimeOffset.UtcNow,
            UpdatedBy = null
        };

        return Ok(ApiResponse<PhilHealthPatientProfileDto>.Success(profile));
    }

    /// <summary>
    /// Saves or updates the standalone PhilHealth Patient Profile directly in relational tables.
    /// Operates completely offline/on-premise without untyped JSON blobs in CustomFields.
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

        if (!string.IsNullOrWhiteSpace(updatedProfile.BloodType))
        {
            patient.BloodType = updatedProfile.BloodType;
        }

        if (updatedProfile.MedicalHistories.Count > 0)
        {
            patient.ChronicConditions = string.Join(", ", updatedProfile.MedicalHistories
                .Select(m => !string.IsNullOrWhiteSpace(m.SpecificDesc) ? m.SpecificDesc : m.Code));
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
                    _medicalRepo.Update(existing);
                }
                else
                {
                    var newMed = new PatientPastMedicalHistory
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

        patient.PersonalMedicalHistoryNotes = updatedProfile.MedicalHistoryNotes?.Trim();
        patient.FamilyMedicalHistoryNotes = updatedProfile.FamilyHistoryNotes?.Trim();

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
                        ?? LegacyPatientProfileIngestionService.ResolveStatutoryVaccineName(library, code);

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
                if (!targetCodes.Contains(imm.PhilHealthCode))
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
        bool updateIsFemale = patient.Gender.StartsWith("F", StringComparison.OrdinalIgnoreCase);
        bool updateIsPediatric = updateAgeYears < 18;
        bool updateIsSenior = updateAgeYears >= 60;

        await SyncCohort(updatedProfile.ChildImmunizations, "lib_immchild", updateIsPediatric || (updatedProfile.ChildImmunizations != null && updatedProfile.ChildImmunizations.Count > 0));
        await SyncCohort(updatedProfile.YoungWomanImmunizations, "lib_immyoungw", (updateIsFemale && updateAgeYears >= 9 && updateAgeYears <= 49) || (updatedProfile.YoungWomanImmunizations != null && updatedProfile.YoungWomanImmunizations.Count > 0));
        await SyncCohort(updatedProfile.PregnantWomanImmunizations, "lib_immpregw", (updateIsFemale && updateAgeYears >= 9 && updateAgeYears <= 49) || (updatedProfile.PregnantWomanImmunizations != null && updatedProfile.PregnantWomanImmunizations.Count > 0));
        await SyncCohort(updatedProfile.ElderlyImmunizations, "lib_immelderly", updateIsSenior || (updatedProfile.ElderlyImmunizations != null && updatedProfile.ElderlyImmunizations.Count > 0));

        await _unitOfWork.SaveChangesAsync(ct);

        await _ingestionService.SyncFromProfileAsync(patientId, updatedProfile, ct);

        return Ok(ApiResponse<PhilHealthPatientProfileDto>.Success(updatedProfile));
    }
}
