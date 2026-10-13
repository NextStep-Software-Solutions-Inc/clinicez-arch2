using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
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
    private readonly IRepository<PatientImmunization>? _immunizationRepo;
    private readonly IPhilHealthCatalogLookup? _catalogLookup;
    private readonly IRepository<PatientPhysicalExamProfile>? _physicalExamRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClinicContext _clinicContext;

    public LegacyPatientProfileIngestionService(
        IRepository<ClinicPatient> patientRepo,
        IRepository<PatientSurgicalHistory> surgicalRepo,
        IRepository<PatientSocialHistory> socialRepo,
        IRepository<PatientReproductiveHistory> reproductiveRepo,
        IRepository<NcdRiskAssessment> ncdRepo,
        IUnitOfWork unitOfWork,
        IClinicContext clinicContext,
        IRepository<PatientImmunization>? immunizationRepo = null,
        IPhilHealthCatalogLookup? catalogLookup = null,
        IRepository<PatientPhysicalExamProfile>? physicalExamRepo = null)
    {
        _patientRepo = patientRepo;
        _surgicalRepo = surgicalRepo;
        _socialRepo = socialRepo;
        _reproductiveRepo = reproductiveRepo;
        _ncdRepo = ncdRepo;
        _unitOfWork = unitOfWork;
        _clinicContext = clinicContext;
        _immunizationRepo = immunizationRepo;
        _catalogLookup = catalogLookup;
        _physicalExamRepo = physicalExamRepo;
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
        int? cigsPerDay = null;
        if (int.TryParse(legacyProfile.CigarettesPerDay, out var c)) cigsPerDay = c;
        else if (decimal.TryParse(legacyProfile.PacksPerDay, out var parsedPpd)) cigsPerDay = (int)(parsedPpd * 20);

        int? bottlesPerDay = null;
        if (int.TryParse(legacyProfile.BottlesPerDay, out var b)) bottlesPerDay = b;

        decimal? packs = decimal.TryParse(legacyProfile.PacksPerDay, out var parsedPacks)
            ? parsedPacks
            : (cigsPerDay.HasValue ? Math.Round((decimal)cigsPerDay.Value / 20m, 2) : null);

        DateOnly? stoppedDate = null;
        if (DateOnly.TryParse(legacyProfile.SmokingStoppedDate, out var sDate)) stoppedDate = sDate;

        bool isSmoker = legacyProfile.IsSmoker;
        if (legacyProfile.SmokingStatus is "quit" or "former" or "X" or "x")
        {
            isSmoker = false;
            stoppedDate ??= DateOnly.FromDateTime(DateTime.UtcNow);
        }
        else if (legacyProfile.SmokingStatus is "current" or "Y" or "y")
        {
            isSmoker = true;
            stoppedDate = null;
        }

        bool isDrinker = legacyProfile.IsAlcoholDrinker;
        string? alcFreq = legacyProfile.AlcoholFrequency;
        if (legacyProfile.AlcoholStatus is "quit" or "former" or "X" or "x")
        {
            isDrinker = false;
            alcFreq = "Quit";
        }
        else if (legacyProfile.AlcoholStatus is "current" or "Y" or "y")
        {
            isDrinker = true;
        }

        if (existingSocial == null)
        {
            var social = new PatientSocialHistory
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ClinicId = clinicId,
                PatientId = patientId,
                IsSmoker = isSmoker,
                CigarettesPerDay = cigsPerDay,
                PacksPerDay = packs,
                SmokingStoppedDate = stoppedDate,
                YearsSmoking = int.TryParse(legacyProfile.YearsSmoking, out var ys) ? ys : null,
                SmokingPackYears = decimal.TryParse(legacyProfile.SmokingPackYears, out var spy) ? spy : null,
                IsAlcoholDrinker = isDrinker,
                AlcoholBottlesPerDay = bottlesPerDay,
                AlcoholDrinksPerWeek = int.TryParse(legacyProfile.AlcoholDrinksPerWeek, out var dpw) ? dpw : null,
                AlcoholFrequency = alcFreq,
                UsesIllicitDrugs = legacyProfile.IllDrugUser,
                DrugTypes = legacyProfile.DrugTypes,
                SubstanceUseHistory = legacyProfile.SubstanceUseHistory,
                IsSexuallyActive = legacyProfile.IsSexuallyActive,
                PhysicalActivityFrequency = legacyProfile.PhysicalActivityFrequency,
                DietaryHabits = legacyProfile.DietaryHabits,
                Remarks = legacyProfile.Remarks,
                CreatedAt = DateTime.UtcNow,
                CreatedBy = "LegacyProfileIngestion"
            };
            await _socialRepo.AddAsync(social, ct);
            modified = true;
        }
        else
        {
            existingSocial.IsSmoker = isSmoker;
            existingSocial.CigarettesPerDay = cigsPerDay;
            existingSocial.PacksPerDay = packs;
            existingSocial.SmokingStoppedDate = stoppedDate;
            if (int.TryParse(legacyProfile.YearsSmoking, out var ys)) existingSocial.YearsSmoking = ys;
            if (decimal.TryParse(legacyProfile.SmokingPackYears, out var spy)) existingSocial.SmokingPackYears = spy;
            existingSocial.IsAlcoholDrinker = isDrinker;
            existingSocial.AlcoholBottlesPerDay = bottlesPerDay;
            if (int.TryParse(legacyProfile.AlcoholDrinksPerWeek, out var dpw)) existingSocial.AlcoholDrinksPerWeek = dpw;
            existingSocial.AlcoholFrequency = alcFreq;
            existingSocial.UsesIllicitDrugs = legacyProfile.IllDrugUser;
            if (!string.IsNullOrWhiteSpace(legacyProfile.DrugTypes)) existingSocial.DrugTypes = legacyProfile.DrugTypes;
            if (!string.IsNullOrWhiteSpace(legacyProfile.SubstanceUseHistory)) existingSocial.SubstanceUseHistory = legacyProfile.SubstanceUseHistory;
            existingSocial.IsSexuallyActive = legacyProfile.IsSexuallyActive;
            if (!string.IsNullOrWhiteSpace(legacyProfile.PhysicalActivityFrequency)) existingSocial.PhysicalActivityFrequency = legacyProfile.PhysicalActivityFrequency;
            if (!string.IsNullOrWhiteSpace(legacyProfile.DietaryHabits)) existingSocial.DietaryHabits = legacyProfile.DietaryHabits;
            if (!string.IsNullOrWhiteSpace(legacyProfile.Remarks)) existingSocial.Remarks = legacyProfile.Remarks;
            existingSocial.UpdatedAt = DateTime.UtcNow;
            existingSocial.UpdatedBy = "LegacyProfileIngestion";
            _socialRepo.Update(existingSocial);
            modified = true;
        }

        // 3. Reproductive History
        var existingReproductive = await _reproductiveRepo.Query(r => r.PatientId == patientId).FirstOrDefaultAsync(ct);
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
        if (int.TryParse(legacyProfile.PadsPerDay, out var parsedPads)) padsPerDay = parsedPads;

        int? menopauseAge = null;
        if (int.TryParse(legacyProfile.MenopauseAge, out var mpa)) menopauseAge = mpa;

        var isMale = patient.Gender.Equals("Male", StringComparison.OrdinalIgnoreCase);

        if (existingReproductive == null)
        {
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
        else
        {
            existingReproductive.IsApplicable = !isMale && (legacyProfile.MenstrualApplicable || legacyProfile.PregnancyApplicable);
            existingReproductive.MenarcheAge = menarcheAge ?? existingReproductive.MenarcheAge;
            existingReproductive.LastMenstrualPeriod = lmp ?? existingReproductive.LastMenstrualPeriod;
            existingReproductive.PeriodDurationDays = periodDuration ?? existingReproductive.PeriodDurationDays;
            existingReproductive.CycleIntervalDays = cycleInterval ?? existingReproductive.CycleIntervalDays;
            existingReproductive.PadsPerDay = padsPerDay ?? existingReproductive.PadsPerDay;
            existingReproductive.IsMenopausal = legacyProfile.IsMenopause;
            existingReproductive.MenopauseAge = menopauseAge ?? existingReproductive.MenopauseAge;
            if (!string.IsNullOrWhiteSpace(legacyProfile.BirthControlMethod)) existingReproductive.ContraceptiveMethod = legacyProfile.BirthControlMethod;
            existingReproductive.Gravidity = legacyProfile.Gravida;
            existingReproductive.Parity = legacyProfile.Para;
            existingReproductive.TermBirths = legacyProfile.FullTermCount;
            existingReproductive.PretermBirths = legacyProfile.PrematureCount;
            existingReproductive.Abortions = legacyProfile.AbortionCount;
            existingReproductive.LivingChildren = legacyProfile.LivingChildrenCount;
            if (!string.IsNullOrWhiteSpace(legacyProfile.DeliveryType)) existingReproductive.DeliveryType = legacyProfile.DeliveryType == "V" ? "Vaginal" : legacyProfile.DeliveryType == "C" ? "Cesarean" : "NotApplicable";
            existingReproductive.HadPreEclampsiaHypertension = legacyProfile.PreEclampsiaHypertension;
            existingReproductive.ReceivedFamilyPlanningCounseling = legacyProfile.FamilyPlanningCounseling;
            existingReproductive.UpdatedAt = DateTime.UtcNow;
            existingReproductive.UpdatedBy = "LegacyProfileIngestion";
            _reproductiveRepo.Update(existingReproductive);
            modified = true;
        }

        // 4. NCD Answers
        var existingNcd = await _ncdRepo.Query(n => n.PatientId == patientId).FirstOrDefaultAsync(ct);
        if (existingNcd == null && legacyProfile.NcdAnswers != null)
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

        // 5. Immunizations
        if (_immunizationRepo != null)
        {
            var existingImms = await _immunizationRepo.Query(i => i.PatientId == patientId).ToListAsync(ct);
            var existingKeys = new HashSet<string>(
                existingImms.Select(i => $"{i.PhilHealthLibrary}:{i.PhilHealthCode}".ToLowerInvariant())
            );

            async Task IngestCohort(List<string>? codes, string library)
            {
                if (codes == null || codes.Count == 0) return;
                foreach (var code in codes)
                {
                    if (string.IsNullOrWhiteSpace(code) || code.Equals("999", StringComparison.OrdinalIgnoreCase)) continue;
                    var key = $"{library}:{code}".ToLowerInvariant();
                    if (!existingKeys.Contains(key))
                    {
                        var vaccineName = _catalogLookup?.Find(library, code)?.Description
                            ?? ResolveStatutoryVaccineName(library, code);
                        var imm = new PatientImmunization
                        {
                            Id = Guid.NewGuid(),
                            TenantId = tenantId,
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
                            AdministeredByStaffName = "PhilHealth Profile Ingestion",
                            IsHistorical = true,
                            HistoricalFacilityName = "Historical Provider",
                            Remarks = "Ingested from PhilHealth patient profile",
                            HasAdverseReaction = false,
                            AdverseReactionSeverity = "None"
                        };
                        await _immunizationRepo.AddAsync(imm, ct);
                        existingKeys.Add(key);
                        modified = true;
                    }
                }
            }

            await IngestCohort(legacyProfile.ChildImmunizations, "lib_immchild");
            await IngestCohort(legacyProfile.YoungWomanImmunizations, "lib_immyoungw");
            await IngestCohort(legacyProfile.PregnantWomanImmunizations, "lib_immpregw");
            await IngestCohort(legacyProfile.ElderlyImmunizations, "lib_immelderly");
            await IngestCohort(legacyProfile.OtherImmunizations, "OtherImm");
        }

        // 6. Physical Exam Profile
        if (_physicalExamRepo != null)
        {
            var existingPe = await _physicalExamRepo.Query(pe => pe.PatientId == patientId).FirstOrDefaultAsync(ct);
            if (existingPe == null)
            {
                var pe = new PatientPhysicalExamProfile
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    ClinicId = clinicId,
                    PatientId = patientId,
                    GenSurveyId = !string.IsNullOrWhiteSpace(legacyProfile.GenSurveyId) ? legacyProfile.GenSurveyId : "1",
                    GenSurveyRemarks = legacyProfile.GenSurveyRemarks,
                    SkinId = !string.IsNullOrWhiteSpace(legacyProfile.SkinId) ? legacyProfile.SkinId : "1",
                    SkinRemarks = legacyProfile.SkinRemarks,
                    HeentId = !string.IsNullOrWhiteSpace(legacyProfile.HeentId) ? legacyProfile.HeentId : "11",
                    HeentRemarks = legacyProfile.HeentRemarks,
                    ChestId = !string.IsNullOrWhiteSpace(legacyProfile.ChestId) ? legacyProfile.ChestId : "6",
                    ChestRemarks = legacyProfile.ChestRemarks,
                    HeartId = !string.IsNullOrWhiteSpace(legacyProfile.HeartId) ? legacyProfile.HeartId : "5",
                    HeartRemarks = legacyProfile.HeartRemarks,
                    AbdomenId = !string.IsNullOrWhiteSpace(legacyProfile.AbdomenId) ? legacyProfile.AbdomenId : "7",
                    AbdomenRemarks = legacyProfile.AbdomenRemarks,
                    NeuroId = !string.IsNullOrWhiteSpace(legacyProfile.NeuroId) ? legacyProfile.NeuroId : "6",
                    NeuroRemarks = legacyProfile.NeuroRemarks,
                    RectalId = !string.IsNullOrWhiteSpace(legacyProfile.RectalId) ? legacyProfile.RectalId : "1",
                    RectalRemarks = legacyProfile.RectalRemarks,
                    GuId = !string.IsNullOrWhiteSpace(legacyProfile.GuId) ? legacyProfile.GuId : "1",
                    GuRemarks = legacyProfile.GuRemarks,
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = "LegacyProfileIngestion"
                };
                await _physicalExamRepo.AddAsync(pe, ct);
                modified = true;
            }
        }

        if (modified)
        {
            await _unitOfWork.SaveChangesAsync(ct);
        }
    }

    public static string ResolveStatutoryVaccineName(string library, string code)
    {
        var lib = library.ToLowerInvariant();
        var c = code.Trim().ToUpperInvariant();

        if (lib.Contains("young"))
        {
            return c switch
            {
                "Y01" => "Human Papillomavirus Vaccine (HPV)",
                "Y02" => "MMR Booster (Young Women)",
                _ => $"Young Woman Vaccine ({code})"
            };
        }

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
