using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Patients.Services;

public interface ILegacyPatientProfileIngestionService
{
    Task EnsureIngestedAsync(Guid patientId, CancellationToken ct = default);
    Task SyncFromProfileAsync(Guid patientId, PhilHealthPatientProfileDto profile, CancellationToken ct = default);
}

public sealed class LegacyPatientProfileIngestionService : ILegacyPatientProfileIngestionService
{
    private readonly IRepository<ClinicPatient> _patientRepo;
    private readonly IRepository<PatientSurgicalHistory> _surgicalRepo;
    private readonly IRepository<PatientSocialHistory> _socialRepo;
    private readonly IRepository<PatientReproductiveHistory> _reproductiveRepo;
    private readonly IRepository<NcdRiskAssessment> _ncdRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public LegacyPatientProfileIngestionService(
        IRepository<ClinicPatient> patientRepo,
        IRepository<PatientSurgicalHistory> surgicalRepo,
        IRepository<PatientSocialHistory> socialRepo,
        IRepository<PatientReproductiveHistory> reproductiveRepo,
        IRepository<NcdRiskAssessment> ncdRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext)
    {
        _patientRepo = patientRepo;
        _surgicalRepo = surgicalRepo;
        _socialRepo = socialRepo;
        _reproductiveRepo = reproductiveRepo;
        _ncdRepo = ncdRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
    }

    public async Task SyncFromProfileAsync(Guid patientId, PhilHealthPatientProfileDto profile, CancellationToken ct = default)
    {
        await IngestProfileCoreAsync(patientId, profile, ct);
    }

    public async Task EnsureIngestedAsync(Guid patientId, CancellationToken ct = default)
    {
        var patient = await _patientRepo.Query(p => p.Id == patientId && p.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(ct);

        if (patient == null || patient.CustomFields == null)
        {
            return;
        }

        if (!patient.CustomFields.TryGetValue("philhealth_profile", out var profObj) || profObj == null)
        {
            return;
        }

        PhilHealthPatientProfileDto? legacyProfile = null;
        if (profObj is PhilHealthPatientProfileDto typed)
        {
            legacyProfile = typed;
        }
        else
        {
            try
            {
                var json = profObj.ToString();
                if (!string.IsNullOrWhiteSpace(json))
                {
                    legacyProfile = JsonSerializer.Deserialize<PhilHealthPatientProfileDto>(json,
                        new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                }
            }
            catch
            {
                return;
            }
        }

        if (legacyProfile != null)
        {
            await IngestProfileCoreAsync(patientId, legacyProfile, ct);
        }
    }

    private async Task IngestProfileCoreAsync(Guid patientId, PhilHealthPatientProfileDto legacyProfile, CancellationToken ct)
    {
        var patient = await _patientRepo.Query(p => p.Id == patientId && p.ClinicId == _clinicContext.ClinicId)
            .FirstOrDefaultAsync(ct);

        if (patient == null) return;

        var tenantId = patient.TenantId ?? _clinicContext.TenantId;
        var clinicId = _clinicContext.ClinicId;
        var modified = false;

        // 1. Surgical Histories
        var hasSurgical = await _surgicalRepo.Query(s => s.PatientId == patientId).AnyAsync(ct);
        if (!hasSurgical && legacyProfile.SurgicalHistories != null && legacyProfile.SurgicalHistories.Count > 0)
        {
            foreach (var s in legacyProfile.SurgicalHistories)
            {
                if (string.IsNullOrWhiteSpace(s.ProcedureDesc) || s.ProcedureDesc.Equals("None", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                DateOnly surgDate = DateOnly.FromDateTime(DateTime.UtcNow);
                if (!string.IsNullOrWhiteSpace(s.ProcedureDate) && DateOnly.TryParse(s.ProcedureDate, out var parsedDate))
                {
                    surgDate = parsedDate;
                }

                var entity = new PatientSurgicalHistory
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    ClinicId = clinicId,
                    PatientId = patientId,
                    ProcedureName = s.ProcedureDesc.Trim(),
                    SurgeryDate = surgDate,
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = "LegacyProfileIngestion"
                };
                await _surgicalRepo.AddAsync(entity, ct);
                modified = true;
            }
        }

        // 2. Social History
        var existingSocial = await _socialRepo.Query(s => s.PatientId == patientId).FirstOrDefaultAsync(ct);
        if (existingSocial == null)
        {
            int? cigsPerDay = null;
            if (int.TryParse(legacyProfile.CigarettesPerDay, out var c)) cigsPerDay = c;

            int? bottlesPerDay = null;
            if (int.TryParse(legacyProfile.BottlesPerDay, out var b)) bottlesPerDay = b;

            var social = new PatientSocialHistory
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                PatientId = patientId,
                IsSmoker = legacyProfile.IsSmoker,
                CigarettesPerDay = cigsPerDay,
                PacksPerDay = cigsPerDay.HasValue ? Math.Round((decimal)cigsPerDay.Value / 20m, 2) : null,
                IsAlcoholDrinker = legacyProfile.IsAlcoholDrinker,
                AlcoholBottlesPerDay = bottlesPerDay,
                UsesIllicitDrugs = legacyProfile.IllDrugUser,
                IsSexuallyActive = legacyProfile.IsSexuallyActive,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "LegacyProfileIngestion"
            };
            await _socialRepo.AddAsync(social, ct);
            modified = true;
        }

        // 3. Reproductive History
        var existingReproductive = await _reproductiveRepo.Query(r => r.PatientId == patientId).FirstOrDefaultAsync(ct);
        if (existingReproductive == null)
        {
            int? menarcheAge = null;
            if (int.TryParse(legacyProfile.MenarcheAge, out var ma)) menarcheAge = ma;

            DateOnly? lmp = null;
            if (!string.IsNullOrWhiteSpace(legacyProfile.LastMensPeriod) && DateOnly.TryParse(legacyProfile.LastMensPeriod, out var parsedLmp))
            {
                lmp = parsedLmp;
            }

            int? periodDuration = null;
            if (int.TryParse(legacyProfile.PeriodDurationDays, out var pd)) periodDuration = pd;

            int? cycleInterval = null;
            if (int.TryParse(legacyProfile.CycleIntervalDays, out var ci)) cycleInterval = ci;

            int? padsPerDay = null;
            if (int.TryParse(legacyProfile.PadsPerDay, out var ppd)) padsPerDay = ppd;

            int? menopauseAge = null;
            if (int.TryParse(legacyProfile.MenopauseAge, out var mpa)) menopauseAge = mpa;

            var isMale = patient.Gender.Equals("Male", StringComparison.OrdinalIgnoreCase);

            var repro = new PatientReproductiveHistory
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                PatientId = patientId,
                IsApplicable = !isMale && (legacyProfile.MenstrualApplicable || legacyProfile.PregnancyApplicable),
                MenarcheAge = menarcheAge,
                LastMenstrualPeriod = lmp,
                PeriodDurationDays = periodDuration,
                CycleIntervalDays = cycleInterval,
                PadsPerDay = padsPerDay,
                IsMenopausal = legacyProfile.IsMenopause,
                MenopauseAge = menopauseAge,
                ContraceptiveMethod = legacyProfile.BirthControlMethod,
                Gravidity = legacyProfile.Gravida,
                Parity = legacyProfile.Para,
                TermBirths = legacyProfile.FullTermCount,
                PretermBirths = legacyProfile.PrematureCount,
                Abortions = legacyProfile.AbortionCount,
                LivingChildren = legacyProfile.LivingChildrenCount,
                DeliveryType = legacyProfile.DeliveryType == "V" ? "Vaginal" : legacyProfile.DeliveryType == "C" ? "Cesarean" : "NotApplicable",
                HadPreEclampsiaHypertension = legacyProfile.PreEclampsiaHypertension,
                ReceivedFamilyPlanningCounseling = legacyProfile.FamilyPlanningCounseling,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "LegacyProfileIngestion"
            };
            await _reproductiveRepo.AddAsync(repro, ct);
            modified = true;
        }

        // 4. NCD Answers
        var hasNcd = await _ncdRepo.Query(n => n.PatientId == patientId).AnyAsync(ct);
        if (!hasNcd && legacyProfile.NcdAnswers != null)
        {
            var a = legacyProfile.NcdAnswers;
            var ncd = new NcdRiskAssessment
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                PatientId = patientId,
                AssessmentDate = DateTime.UtcNow,
                AssessedByStaffName = "LegacyProfileIngestion",
                EatsProcessedFoodWeekly = a.Qid1Yn == "Y",
                ThreeServingsVegetablesDaily = a.Qid2Yn == "Y",
                TwoToThreeServingsFruitDaily = a.Qid3Yn == "Y",
                PhysicalActivityAtLeast150MinsWeekly = a.Qid4Yn == "Y",
                DiagnosedDiabetes = string.IsNullOrWhiteSpace(a.Qid5Ynx) ? "N" : a.Qid5Ynx,
                HasPolyphagia = a.Qid6Yn == "Y",
                HasPolydipsia = a.Qid7Yn == "Y",
                HasPolyuria = a.Qid8Yn == "Y",
                HasChestPain = a.Qid9Yn == "Y",
                PainInCenterOfChestOrLeftArm = a.Qid10Yn == "Y",
                PainWhenWalkingUphill = a.Qid11Yn == "Y",
                SlowsDownWhenPainOccurs = a.Qid12Yn == "Y",
                PainRelievedWithin10Mins = a.Qid13Yn == "Y",
                PainRelievedByNitrates = a.Qid14Yn == "Y",
                SevereChestPainOver30Mins = a.Qid15Yn == "Y",
                TransientNeurologicalDeficits = a.Qid16Yn == "Y",
                RiskBand = string.IsNullOrWhiteSpace(a.Qid17Abcde) ? "BandA" : $"Band{a.Qid17Abcde}",
                DiabetesMedicationStatus = a.Qid18Yn,
                HasRaisedBloodGlucose = a.Qid19Yn == "Y",
                HasRaisedBloodLipids = a.Qid20Yn == "Y",
                UrineKetonesPresent = a.Qid21Yn == "Y",
                UrineKetonesValue = a.Qid21Ketonval,
                UrineProteinPresent = a.Qid22Yn == "Y",
                UrineProteinValue = a.Qid22Proteinval,
                HasHistoryAnginaHeartAttack = a.Qid23Yn == "Y",
                HasHistoryStrokeOrTia = a.Qid24Yn == "Y",
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "LegacyProfileIngestion"
            };

            if (decimal.TryParse(a.Qid19Fbsmg, NumberStyles.Any, CultureInfo.InvariantCulture, out var fbsMg))
                ncd.FastingBloodSugarMgDl = fbsMg;
            if (decimal.TryParse(a.Qid19Fbsmmol, NumberStyles.Any, CultureInfo.InvariantCulture, out var fbsMmol))
                ncd.FastingBloodSugarMmolL = fbsMmol;
            if (DateOnly.TryParse(a.Qid19Fbsdate, out var fbsDate))
                ncd.FastingBloodSugarDate = fbsDate;
            if (decimal.TryParse(a.Qid20Choleval, NumberStyles.Any, CultureInfo.InvariantCulture, out var chol))
                ncd.TotalCholesterolMgDl = chol;
            if (DateOnly.TryParse(a.Qid20Choledate, out var cholDate))
                ncd.TotalCholesterolDate = cholDate;
            if (DateOnly.TryParse(a.Qid21Ketondate, out var ketDate))
                ncd.UrineKetonesDate = ketDate;
            if (DateOnly.TryParse(a.Qid22Proteindate, out var protDate))
                ncd.UrineProteinDate = protDate;

            await _ncdRepo.AddAsync(ncd, ct);
            modified = true;
        }

        if (modified)
        {
            await _unitOfWork.SaveChangesAsync(ct);
        }
    }
}
