using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Consultations.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Consultations.Commands;

internal static class ConsultationDraftPersistenceHelper
{
    private static readonly Regex FirstDigitRegex = new(@"([1-5])", RegexOptions.Compiled);

    public static void SyncWorkflowMode(
        ConsultationEncounter encounter,
        string? visitWorkflowMode,
        bool? explicitIsYakapEligible)
    {
        if (!string.IsNullOrWhiteSpace(visitWorkflowMode) &&
            Enum.TryParse<VisitWorkflowMode>(visitWorkflowMode.Trim(), ignoreCase: true, out var parsedMode))
        {
            encounter.VisitWorkflowMode = parsedMode;
            if (parsedMode == VisitWorkflowMode.YakapAvailment)
            {
                encounter.IsYakapEligible = true;
            }
            else if (explicitIsYakapEligible.HasValue)
            {
                encounter.IsYakapEligible = explicitIsYakapEligible.Value;
                if (encounter.IsYakapEligible)
                {
                    encounter.VisitWorkflowMode = VisitWorkflowMode.YakapAvailment;
                }
            }
            else
            {
                encounter.IsYakapEligible = false;
            }
            return;
        }

        if (explicitIsYakapEligible.HasValue)
        {
            encounter.IsYakapEligible = explicitIsYakapEligible.Value;
            encounter.VisitWorkflowMode = encounter.IsYakapEligible
                ? VisitWorkflowMode.YakapAvailment
                : VisitWorkflowMode.Regular;
        }
    }

    public static async Task SyncQueueWorkflowModeAsync(
        ConsultationEncounter encounter,
        IRepository<QueueItem>? queueRepo,
        CancellationToken ct)
    {
        if (!encounter.QueueItemId.HasValue || queueRepo == null)
        {
            return;
        }

        var queueItem = await queueRepo
            .Query(q => q.Id == encounter.QueueItemId.Value && q.ClinicId == encounter.ClinicId)
            .FirstOrDefaultAsync(ct);

        if (queueItem != null && queueItem.VisitWorkflowMode != encounter.VisitWorkflowMode)
        {
            queueItem.VisitWorkflowMode = encounter.VisitWorkflowMode;
            queueItem.UpdatedAt = DateTime.UtcNow;
            queueRepo.Update(queueItem);
        }
    }

    public static async Task SyncPhysicalExamsAsync(
        ConsultationEncounter encounter,
        bool isExistingEncounter,
        List<ConsultationPhysicalExamDto>? physicalExamsInput,
        string? generalSurveyId,
        string? generalSurveyRemarks,
        string? physicalExamFindingsJson,
        IRepositoryProvider? repoProvider,
        CancellationToken ct)
    {
        var peRepo = repoProvider?.GetRepository<PatientPhysicalExam>();
        var peFindingRepo = repoProvider?.GetRepository<PatientPhysicalExamFinding>();

        if (physicalExamsInput != null)
        {
            if (physicalExamsInput.Count == 0)
            {
                foreach (var existingPe in encounter.PhysicalExams.ToList())
                {
                    foreach (var existingFinding in existingPe.Findings.ToList())
                    {
                        peFindingRepo?.Remove(existingFinding, hardDelete: true);
                    }
                    existingPe.Findings.Clear();
                    peRepo?.Remove(existingPe, hardDelete: true);
                }
                encounter.PhysicalExams.Clear();
                return;
            }

            var firstInput = physicalExamsInput[0];
            var exam = encounter.PhysicalExams.FirstOrDefault();
            var isExistingExam = exam != null && isExistingEncounter;

            foreach (var extraPe in encounter.PhysicalExams.Skip(1).ToList())
            {
                foreach (var f in extraPe.Findings.ToList())
                {
                    peFindingRepo?.Remove(f, hardDelete: true);
                }
                extraPe.Findings.Clear();
                peRepo?.Remove(extraPe, hardDelete: true);
                encounter.PhysicalExams.Remove(extraPe);
            }

            if (exam == null)
            {
                exam = new PatientPhysicalExam
                {
                    Id = Guid.NewGuid(),
                    TenantId = encounter.TenantId,
                    ClinicId = encounter.ClinicId,
                    PatientId = encounter.PatientId,
                    ConsultationEncounterId = encounter.Id,
                    ExamDate = encounter.EncounterDate != default ? encounter.EncounterDate : DateTime.UtcNow,
                    ExaminedByStaffId = encounter.DoctorId,
                    ExaminedByStaffName = ConsultationPlanManagementMapper.Truncate(encounter.DoctorName, 150),
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = encounter.DoctorName
                };
                if (isExistingEncounter && peRepo != null)
                {
                    await peRepo.AddAsync(exam, ct);
                }
                if (!encounter.PhysicalExams.Contains(exam))
                {
                    encounter.PhysicalExams.Add(exam);
                }
            }
            else
            {
                foreach (var existingFinding in exam.Findings.ToList())
                {
                    peFindingRepo?.Remove(existingFinding, hardDelete: true);
                }
                exam.Findings.Clear();
                exam.UpdatedAt = DateTime.UtcNow;
                exam.UpdatedBy = encounter.DoctorName;
            }

            ResetExamSystemFields(exam);

            var resolvedGenSurveyId = ConsultationPlanManagementMapper.Truncate(
                firstInput.GeneralSurveyId ?? generalSurveyId,
                50) ?? "1";
            var resolvedGenSurveyRemarks = ConsultationPlanManagementMapper.Truncate(
                firstInput.GeneralSurveyRemarks ?? generalSurveyRemarks,
                1000);

            exam.GenSurveyId = resolvedGenSurveyId;
            exam.GeneralSurveyCodes = resolvedGenSurveyId;
            exam.GeneralSurveyRemarks = resolvedGenSurveyRemarks;
            exam.GeneralSurveyStatus = resolvedGenSurveyId is "2" or "99"
                ? GeneralSurveyStatus.Abnormal
                : GeneralSurveyStatus.Normal;

            if (firstInput.Findings != null)
            {
                var seenSystems = new HashSet<PhysicalExamSystem>();
                foreach (var fInput in firstInput.Findings)
                {
                    if (!TryParsePhysicalExamSystem(fInput.System, out var sys))
                    {
                        continue;
                    }

                    if (!seenSystems.Add(sys))
                    {
                        continue;
                    }

                    var code = ConsultationPlanManagementMapper.Truncate(
                        fInput.OptionCode ?? fInput.PhilHealthFindingCode,
                        50);
                    var remarks = ConsultationPlanManagementMapper.Truncate(fInput.Remarks, 1000);
                    var title = ConsultationPlanManagementMapper.Truncate(fInput.FindingTitle, 255)
                        ?? sys.ToString();

                    ApplyFindingToExamColumns(exam, sys, fInput.IsNormal, code, remarks);

                    var newFinding = new PatientPhysicalExamFinding
                    {
                        Id = Guid.NewGuid(),
                        TenantId = encounter.TenantId,
                        ClinicId = encounter.ClinicId,
                        PhysicalExamId = exam.Id,
                        System = sys,
                        IsNormal = fInput.IsNormal,
                        FindingTitle = title,
                        PhilHealthFindingCode = code,
                        BodySite = ConsultationPlanManagementMapper.Truncate(fInput.BodySite, 100),
                        Laterality = ConsultationPlanManagementMapper.Truncate(fInput.Laterality, 50),
                        Remarks = remarks,
                        CreatedAt = DateTime.UtcNow,
                        CreatedBy = encounter.DoctorName
                    };

                    if (isExistingEncounter && peFindingRepo != null)
                    {
                        await peFindingRepo.AddAsync(newFinding, ct);
                    }
                    if (!exam.Findings.Contains(newFinding))
                    {
                        exam.Findings.Add(newFinding);
                    }
                }
            }

            return;
        }

        if (generalSurveyId != null || generalSurveyRemarks != null || !string.IsNullOrWhiteSpace(physicalExamFindingsJson))
        {
            var exam = encounter.PhysicalExams.FirstOrDefault();
            var isExistingExam = exam != null && isExistingEncounter;
            if (exam == null)
            {
                exam = new PatientPhysicalExam
                {
                    Id = Guid.NewGuid(),
                    TenantId = encounter.TenantId,
                    ClinicId = encounter.ClinicId,
                    PatientId = encounter.PatientId,
                    ConsultationEncounterId = encounter.Id,
                    ExamDate = encounter.EncounterDate != default ? encounter.EncounterDate : DateTime.UtcNow,
                    ExaminedByStaffId = encounter.DoctorId,
                    ExaminedByStaffName = ConsultationPlanManagementMapper.Truncate(encounter.DoctorName, 150),
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = encounter.DoctorName
                };
                if (isExistingEncounter && peRepo != null)
                {
                    await peRepo.AddAsync(exam, ct);
                }
                if (!encounter.PhysicalExams.Contains(exam))
                {
                    encounter.PhysicalExams.Add(exam);
                }
            }

            if (generalSurveyId != null)
            {
                exam.GenSurveyId = ConsultationPlanManagementMapper.Truncate(generalSurveyId, 50);
                exam.GeneralSurveyCodes = exam.GenSurveyId ?? "1";
                exam.GeneralSurveyStatus = exam.GenSurveyId is "2" or "99"
                    ? GeneralSurveyStatus.Abnormal
                    : GeneralSurveyStatus.Normal;
            }

            if (generalSurveyRemarks != null)
            {
                exam.GeneralSurveyRemarks = ConsultationPlanManagementMapper.Truncate(generalSurveyRemarks, 1000);
            }

            if (!string.IsNullOrWhiteSpace(physicalExamFindingsJson))
            {
                try
                {
                    var existingFindingIds = exam.Findings.Select(f => f.Id).ToHashSet();
                    var pe = JsonSerializer.Deserialize<NineSystemPhysicalExamFindings>(
                        physicalExamFindingsJson,
                        new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                    encounter.SetPhysicalExamFindings(pe);

                    if (isExistingExam && peFindingRepo != null)
                    {
                        foreach (var addedFinding in exam.Findings.Where(f => !existingFindingIds.Contains(f.Id)))
                        {
                            if (addedFinding.Id == Guid.Empty) addedFinding.Id = Guid.NewGuid();
                            await peFindingRepo.AddAsync(addedFinding, ct);
                        }
                    }
                }
                catch
                {
                    // Ignore malformed legacy PE JSON
                }
            }
        }
    }

    public static async Task SyncCohortAssessmentsAsync(
        ConsultationEncounter encounter,
        bool isExistingEncounter,
        ConsultationObGyneExamDto? obGyneInput,
        List<ConsultationPediatricMilestoneDto>? pediatricMilestonesInput,
        ConsultationAdolescentAssessmentDto? adolescentInput,
        List<ConsultationHeadsssAssessmentDto>? headsssInput,
        List<ConsultationBpMonitoringLogDto>? bpLogsInput,
        IRepositoryProvider? repoProvider,
        CancellationToken ct)
    {
        var obGyneRepo = repoProvider?.GetRepository<EncounterObGyneExam>();
        var milestoneRepo = repoProvider?.GetRepository<EncounterPediatricMilestone>();
        var dangerSignRepo = repoProvider?.GetRepository<EncounterPediatricDangerSign>();
        var adolescentRepo = repoProvider?.GetRepository<EncounterAdolescentAssessment>();
        var headsssRepo = repoProvider?.GetRepository<EncounterHeadsssDomainAssessment>();
        var bpLogRepo = repoProvider?.GetRepository<PatientBpMonitoringLog>();
        var bpDayRepo = repoProvider?.GetRepository<PatientBpMonitoringDay>();
        var patientRepo = repoProvider?.GetRepository<Patient>();

        // 1. Ob-Gyne Exam (1:1 unique on ClinicId + ConsultationEncounterId)
        if (obGyneInput != null)
        {
            var existingObGyne = encounter.ObGyneExam;
            if (existingObGyne == null && isExistingEncounter && obGyneRepo != null)
            {
                existingObGyne = await obGyneRepo
                    .Query(o => o.ClinicId == encounter.ClinicId && o.ConsultationEncounterId == encounter.Id)
                    .IgnoreQueryFilters()
                    .FirstOrDefaultAsync(ct);
            }

            if (!HasAnyObGyneValue(obGyneInput))
            {
                if (existingObGyne != null)
                {
                    obGyneRepo?.Remove(existingObGyne, hardDelete: true);
                }
                encounter.ObGyneExam = null;
            }
            else
            {
                var packedRemarks = ConsultationPlanManagementMapper.PackEntityMetadata(
                    obGyneInput.Remarks,
                    obGyneInput with { Remarks = null });
                if (existingObGyne != null)
                {
                    existingObGyne.IsDeleted = false;
                    existingObGyne.DeletedAt = null;
                    existingObGyne.DeletedBy = null;
                    existingObGyne.FundicHeightCm = obGyneInput.FundicHeightCm;
                    existingObGyne.FetalHeartToneBpm = obGyneInput.FetalHeartToneBpm;
                    existingObGyne.LeopoldL1 = ConsultationPlanManagementMapper.Truncate(obGyneInput.FetalPresentation, 255);
                    existingObGyne.Remarks = packedRemarks;
                    existingObGyne.UpdatedAt = DateTime.UtcNow;
                    existingObGyne.UpdatedBy = encounter.DoctorName;
                    encounter.ObGyneExam = existingObGyne;
                }
                else
                {
                    var newObGyne = new EncounterObGyneExam
                    {
                        Id = Guid.NewGuid(),
                        TenantId = encounter.TenantId,
                        ClinicId = encounter.ClinicId,
                        ConsultationEncounterId = encounter.Id,
                        FundicHeightCm = obGyneInput.FundicHeightCm,
                        FetalHeartToneBpm = obGyneInput.FetalHeartToneBpm,
                        LeopoldL1 = ConsultationPlanManagementMapper.Truncate(obGyneInput.FetalPresentation, 255),
                        Remarks = packedRemarks,
                        CreatedAt = DateTime.UtcNow,
                        CreatedBy = encounter.DoctorName
                    };
                    if (isExistingEncounter && obGyneRepo != null)
                    {
                        await obGyneRepo.AddAsync(newObGyne, ct);
                    }
                    encounter.ObGyneExam = newObGyne;
                }
            }
        }

        // 2. Pediatric Milestones + Danger Signs
        if (pediatricMilestonesInput != null)
        {
            if (isExistingEncounter && milestoneRepo != null)
            {
                var dbMilestones = await milestoneRepo
                    .Query(m => m.ClinicId == encounter.ClinicId && m.ConsultationEncounterId == encounter.Id)
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);

                if (dbMilestones.Count > 0)
                {
                    var mIds = dbMilestones.Select(m => m.Id).ToHashSet();
                    if (dangerSignRepo != null)
                    {
                        var dbDangerSigns = await dangerSignRepo
                            .Query(d => mIds.Contains(d.PediatricMilestoneId))
                            .IgnoreQueryFilters()
                            .ToListAsync(ct);
                        foreach (var ds in dbDangerSigns)
                        {
                            dangerSignRepo.Remove(ds, hardDelete: true);
                        }
                    }

                    foreach (var m in dbMilestones)
                    {
                        milestoneRepo.Remove(m, hardDelete: true);
                    }
                }
            }
            encounter.PediatricMilestones.Clear();

            foreach (var mInput in pediatricMilestonesInput.Where(HasAnyPediatricMilestoneValue))
            {
                var ageCode = ConsultationPlanManagementMapper.Truncate(mInput.MilestoneVisitAge, 20) ?? "VISIT";
                var newMilestone = new EncounterPediatricMilestone
                {
                    Id = Guid.NewGuid(),
                    TenantId = encounter.TenantId,
                    ClinicId = encounter.ClinicId,
                    ConsultationEncounterId = encounter.Id,
                    MilestoneVisitAgeCode = ageCode,
                    IsGrossMotorAtPar = ParseMilestoneAtPar(mInput.GrossMotorStatus),
                    IsFineMotorAtPar = ParseMilestoneAtPar(mInput.FineMotorStatus),
                    IsLanguageAtPar = ParseMilestoneAtPar(mInput.LanguageStatus),
                    IsCognitiveAtPar = ParseMilestoneAtPar(mInput.CognitiveStatus),
                    IsPsychosocialAtPar = ParseMilestoneAtPar(mInput.SocialEmotionalStatus),
                    GrossMotorRemarks = ConsultationPlanManagementMapper.Truncate(mInput.GrossMotorStatus, 500),
                    FineMotorRemarks = ConsultationPlanManagementMapper.Truncate(mInput.FineMotorStatus, 500),
                    LanguageRemarks = ConsultationPlanManagementMapper.Truncate(mInput.LanguageStatus, 500),
                    CognitiveRemarks = ConsultationPlanManagementMapper.Truncate(mInput.CognitiveStatus, 500),
                    PsychosocialRemarks = ConsultationPlanManagementMapper.Truncate(mInput.SocialEmotionalStatus, 500),
                    DevelopmentalRemarks = ConsultationPlanManagementMapper.PackEntityMetadata(
                        mInput.Remarks,
                        mInput with { Remarks = null }),
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = encounter.DoctorName
                };

                if (mInput.DangerSigns != null)
                {
                    int dsIdx = 1;
                    foreach (var sign in mInput.DangerSigns.Where(s => !string.IsNullOrWhiteSpace(s)))
                    {
                        var ds = new EncounterPediatricDangerSign
                        {
                            Id = Guid.NewGuid(),
                            TenantId = encounter.TenantId,
                            ClinicId = encounter.ClinicId,
                            PediatricMilestoneId = newMilestone.Id,
                            Domain = PediatricDevelopmentDomain.GrossMotor, // "GrossMotor" == 10 chars (fits HasMaxLength(10))
                            DangerSignCode = $"DS{dsIdx:D2}",
                            Description = ConsultationPlanManagementMapper.Truncate(sign, 255),
                            IsPresent = true,
                            CreatedAt = DateTime.UtcNow,
                            CreatedBy = encounter.DoctorName
                        };
                        newMilestone.DangerSigns.Add(ds);
                        dsIdx++;
                    }
                }

                if (isExistingEncounter && milestoneRepo != null)
                {
                    await milestoneRepo.AddAsync(newMilestone, ct);
                    if (dangerSignRepo != null)
                    {
                        foreach (var ds in newMilestone.DangerSigns.ToList())
                        {
                            await dangerSignRepo.AddAsync(ds, ct);
                        }
                    }
                }
                if (!encounter.PediatricMilestones.Contains(newMilestone))
                {
                    encounter.PediatricMilestones.Add(newMilestone);
                }
            }
        }

        // 3. Adolescent Assessment (1:1 unique on ClinicId + ConsultationEncounterId)
        if (adolescentInput != null)
        {
            var existingAdolescent = encounter.AdolescentAssessment;
            if (existingAdolescent == null && isExistingEncounter && adolescentRepo != null)
            {
                existingAdolescent = await adolescentRepo
                    .Query(a => a.ClinicId == encounter.ClinicId && a.ConsultationEncounterId == encounter.Id)
                    .IgnoreQueryFilters()
                    .FirstOrDefaultAsync(ct);
            }

            if (!HasAnyAdolescentValue(adolescentInput))
            {
                if (existingAdolescent != null)
                {
                    adolescentRepo?.Remove(existingAdolescent, hardDelete: true);
                }
                encounter.AdolescentAssessment = null;
            }
            else
            {
                var breastStage = ParseStageNumber(adolescentInput.SmrBreastRating) ?? adolescentInput.TannerStage;
                var genitalStage = ParseStageNumber(adolescentInput.SmrGenitalRating) ?? adolescentInput.TannerStage;
                var pubicStage = ParseStageNumber(adolescentInput.SmrPubicHairRating) ?? adolescentInput.TannerStage;
                var smrAssessed = adolescentInput.TannerStage.HasValue ||
                                  breastStage.HasValue ||
                                  genitalStage.HasValue ||
                                  pubicStage.HasValue ||
                                  adolescentInput.MenarcheAgeYears.HasValue;
                var smrResultCode = adolescentInput.TannerStage.HasValue
                    ? ConsultationPlanManagementMapper.Truncate(adolescentInput.TannerStage.Value.ToString(CultureInfo.InvariantCulture), 20)
                    : null;
                var packedRemarks = ConsultationPlanManagementMapper.PackEntityMetadata(
                    adolescentInput.Remarks,
                    adolescentInput with { Remarks = null });

                if (existingAdolescent != null)
                {
                    existingAdolescent.IsDeleted = false;
                    existingAdolescent.DeletedAt = null;
                    existingAdolescent.DeletedBy = null;
                    existingAdolescent.SmrAssessed = smrAssessed;
                    existingAdolescent.BreastStage = breastStage;
                    existingAdolescent.GenitalStage = genitalStage;
                    existingAdolescent.PubicHairStage = pubicStage;
                    existingAdolescent.SmrResultCode = smrResultCode;
                    existingAdolescent.Q06SexuallyActiveUnsafeSex = adolescentInput.IsSexuallyActive;
                    existingAdolescent.Q05TobaccoAlcoholDrugUse = adolescentInput.SubstanceUseNoted;
                    existingAdolescent.Q07DepressionOrSadness = adolescentInput.DepressionScreenPositive;
                    existingAdolescent.Remarks = packedRemarks;
                    existingAdolescent.UpdatedAt = DateTime.UtcNow;
                    existingAdolescent.UpdatedBy = encounter.DoctorName;
                    encounter.AdolescentAssessment = existingAdolescent;
                }
                else
                {
                    var newAdolescent = new EncounterAdolescentAssessment
                    {
                        Id = Guid.NewGuid(),
                        TenantId = encounter.TenantId,
                        ClinicId = encounter.ClinicId,
                        ConsultationEncounterId = encounter.Id,
                        SmrAssessed = smrAssessed,
                        BreastStage = breastStage,
                        GenitalStage = genitalStage,
                        PubicHairStage = pubicStage,
                        SmrResultCode = smrResultCode,
                        Q06SexuallyActiveUnsafeSex = adolescentInput.IsSexuallyActive,
                        Q05TobaccoAlcoholDrugUse = adolescentInput.SubstanceUseNoted,
                        Q07DepressionOrSadness = adolescentInput.DepressionScreenPositive,
                        Remarks = packedRemarks,
                        CreatedAt = DateTime.UtcNow,
                        CreatedBy = encounter.DoctorName
                    };
                    if (isExistingEncounter && adolescentRepo != null)
                    {
                        await adolescentRepo.AddAsync(newAdolescent, ct);
                    }
                    encounter.AdolescentAssessment = newAdolescent;
                }
            }
        }

        // 4. HEADSSS Domain Assessments
        if (headsssInput != null)
        {
            if (isExistingEncounter && headsssRepo != null)
            {
                var dbHeadsss = await headsssRepo
                    .Query(h => h.ClinicId == encounter.ClinicId && h.ConsultationEncounterId == encounter.Id)
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);
                foreach (var h in dbHeadsss)
                {
                    headsssRepo.Remove(h, hardDelete: true);
                }
            }
            encounter.HeadsssAssessments.Clear();

            foreach (var hInput in headsssInput.Where(h =>
                         !string.IsNullOrWhiteSpace(h.AssessmentText) ||
                         h.HasRedFlags == true ||
                         (h.RedFlags is { Count: > 0 })))
            {
                var newHeadsss = new EncounterHeadsssDomainAssessment
                {
                    Id = Guid.NewGuid(),
                    TenantId = encounter.TenantId,
                    ClinicId = encounter.ClinicId,
                    ConsultationEncounterId = encounter.Id,
                    Domain = ConsultationPlanManagementMapper.MapHeadsssDomainFromUi(hInput.Domain),
                    AssentConsentStatus = true,
                    PatientAnswers = ConsultationPlanManagementMapper.Truncate(hInput.AssessmentText, 2000),
                    RequiresUrgentReferral = hInput.HasRedFlags ?? false,
                    RedFlagCodes = hInput.RedFlags is { Count: > 0 }
                        ? ConsultationPlanManagementMapper.Truncate(string.Join(",", hInput.RedFlags), 200)
                        : null,
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = encounter.DoctorName
                };
                if (isExistingEncounter && headsssRepo != null)
                {
                    await headsssRepo.AddAsync(newHeadsss, ct);
                }
                if (!encounter.HeadsssAssessments.Contains(newHeadsss))
                {
                    encounter.HeadsssAssessments.Add(newHeadsss);
                }
            }
        }

        // 5. Patient BP Monitoring Logs + Days
        if (bpLogsInput != null)
        {
            if (isExistingEncounter && bpLogRepo != null)
            {
                var dbLogs = await bpLogRepo
                    .Query(b => b.ClinicId == encounter.ClinicId && b.ConsultationEncounterId == encounter.Id)
                    .IgnoreQueryFilters()
                    .ToListAsync(ct);
                if (dbLogs.Count > 0)
                {
                    var logIds = dbLogs.Select(b => b.Id).ToHashSet();
                    if (bpDayRepo != null)
                    {
                        var dbDays = await bpDayRepo
                            .Query(d => logIds.Contains(d.BpMonitoringLogId))
                            .IgnoreQueryFilters()
                            .ToListAsync(ct);
                        foreach (var day in dbDays)
                        {
                            bpDayRepo.Remove(day, hardDelete: true);
                        }
                    }

                    foreach (var log in dbLogs)
                    {
                        bpLogRepo.Remove(log, hardDelete: true);
                    }
                }
            }
            encounter.BpMonitoringLogs.Clear();

            var validBpInputs = bpLogsInput.Where(b => b.Systolic > 0 || b.Diastolic > 0).ToList();
            if (validBpInputs.Count > 0)
            {
                bool canPersistBpLog = true;
                if (patientRepo != null)
                {
                    canPersistBpLog = await patientRepo
                        .Query(p => p.Id == encounter.PatientId && p.ClinicId == encounter.ClinicId)
                        .AnyAsync(ct);
                }

                if (canPersistBpLog)
                {
                    foreach (var bpInput in validBpInputs)
                    {
                        var logDate = ConsultationPlanManagementMapper.ParseOptionalDate(bpInput.RecordedAt)
                                      ?? DateOnly.FromDateTime(encounter.EncounterDate != default ? encounter.EncounterDate : DateTime.UtcNow);
                        var compactMeta = bpInput with
                        {
                            RecordedAt = ConsultationPlanManagementMapper.Truncate(bpInput.RecordedAt, 64) ?? string.Empty,
                            Location = ConsultationPlanManagementMapper.Truncate(bpInput.Location, 100),
                            Arm = ConsultationPlanManagementMapper.Truncate(bpInput.Arm, 50),
                            Remarks = null
                        };
                        var packedInterpretation = ConsultationPlanManagementMapper.PackEntityMetadata(
                            bpInput.Remarks,
                            compactMeta,
                            maxLength: 1000);
                        var locCode = !string.IsNullOrWhiteSpace(bpInput.Location) &&
                                      bpInput.Location.Contains("home", StringComparison.OrdinalIgnoreCase)
                            ? "02"
                            : "01";

                        var newLog = new PatientBpMonitoringLog
                        {
                            Id = Guid.NewGuid(),
                            TenantId = encounter.TenantId,
                            ClinicId = encounter.ClinicId,
                            PatientId = encounter.PatientId,
                            ConsultationEncounterId = encounter.Id,
                            StartDate = logDate,
                            EndDate = logDate,
                            AverageAmSystolic = bpInput.Systolic,
                            AverageAmDiastolic = bpInput.Diastolic,
                            OverallAverageSystolic = bpInput.Systolic,
                            OverallAverageDiastolic = bpInput.Diastolic,
                            ClinicalInterpretation = packedInterpretation,
                            CreatedAt = DateTime.UtcNow,
                            CreatedBy = encounter.DoctorName
                        };

                        var newDay = new PatientBpMonitoringDay
                        {
                            Id = Guid.NewGuid(),
                            TenantId = encounter.TenantId,
                            ClinicId = encounter.ClinicId,
                            BpMonitoringLogId = newLog.Id,
                            DayNumber = 1,
                            MeasurementDate = logDate,
                            LocationCode = locCode,
                            AmSystolic = bpInput.Systolic,
                            AmDiastolic = bpInput.Diastolic,
                            AmHeartRate = bpInput.PulseBpm,
                            Remarks = bpInput.Location ?? bpInput.Arm,
                            CreatedAt = DateTime.UtcNow,
                            CreatedBy = encounter.DoctorName
                        };
                        newLog.Days.Add(newDay);

                        if (isExistingEncounter && bpLogRepo != null)
                        {
                            await bpLogRepo.AddAsync(newLog, ct);
                            if (bpDayRepo != null)
                            {
                                await bpDayRepo.AddAsync(newDay, ct);
                            }
                        }
                        if (!encounter.BpMonitoringLogs.Contains(newLog))
                        {
                            encounter.BpMonitoringLogs.Add(newLog);
                        }
                    }
                }
            }
        }
    }

    public static async Task SyncDraftOrdersAndAssociateArtifactsAsync(
        ConsultationEncounter encounter,
        List<DraftDiagnosticOrderDto>? draftDiagnosticOrders,
        List<DraftProcedureOrderDto>? draftProcedures,
        List<DraftDentalToothDto>? draftDentalTeeth,
        ConsultationDraftWorkspaceDto? draftWorkspace,
        IRepositoryProvider? repoProvider,
        CancellationToken ct)
    {
        var existingEnvelope = ConsultationPlanManagementMapper.DeserializeDraftEnvelope(encounter.DraftOrdersJson);
        var nextEnvelope = new ConsultationDraftEnvelope(
            DraftDiagnosticOrders: draftDiagnosticOrders ?? existingEnvelope?.DraftDiagnosticOrders,
            DraftProcedures: draftProcedures ?? existingEnvelope?.DraftProcedures,
            DraftDentalTeeth: draftDentalTeeth ?? existingEnvelope?.DraftDentalTeeth,
            DraftWorkspace: draftWorkspace ?? existingEnvelope?.DraftWorkspace);

        encounter.DraftOrdersJson = ConsultationPlanManagementMapper.SerializeDraftEnvelope(nextEnvelope);

        if (repoProvider == null)
        {
            return;
        }

        // 1. Auto-associate any pre-existing visit-scoped clinical artifacts on the same QueueItemId to this draft encounter
        if (encounter.QueueItemId.HasValue)
        {
            var qId = encounter.QueueItemId.Value;

            var medCertRepo = repoProvider.GetRepository<MedicalCertificate>();
            if (medCertRepo != null)
            {
                var unlinkedCerts = await medCertRepo
                    .Query(m => m.ClinicId == encounter.ClinicId && !m.IsSigned && m.ConsultationId == null && m.QueueItemId == qId)
                    .ToListAsync(ct);
                foreach (var cert in unlinkedCerts)
                {
                    cert.ConsultationId = encounter.Id;
                    medCertRepo.Update(cert);
                }
            }

            var referralRepo = repoProvider.GetRepository<ReferralLetter>();
            if (referralRepo != null)
            {
                var unlinkedRefs = await referralRepo
                    .Query(r => r.ClinicId == encounter.ClinicId && !r.IsSigned && r.ConsultationId == null && r.QueueItemId == qId)
                    .ToListAsync(ct);
                foreach (var r in unlinkedRefs)
                {
                    r.ConsultationId = encounter.Id;
                    referralRepo.Update(r);
                }
            }

            var procedureRepo = repoProvider.GetRepository<Procedure>();
            if (procedureRepo != null)
            {
                var unlinkedProcs = await procedureRepo
                    .Query(p => p.ClinicId == encounter.ClinicId && p.ConsultationId == null && p.QueueItemId == qId)
                    .ToListAsync(ct);
                foreach (var proc in unlinkedProcs)
                {
                    proc.ConsultationId = encounter.Id;
                    procedureRepo.Update(proc);
                }
            }

            var vitalsRepo = repoProvider.GetRepository<PatientVitals>();
            if (vitalsRepo != null)
            {
                var unlinkedVitals = await vitalsRepo
                    .Query(v => v.ClinicId == encounter.ClinicId && v.ConsultationEncounterId == null && v.QueueItemId == qId)
                    .ToListAsync(ct);
                foreach (var v in unlinkedVitals)
                {
                    v.ConsultationEncounterId = encounter.Id;
                    vitalsRepo.Update(v);
                }
            }

            var labOrderRepo = repoProvider.GetRepository<LabOrder>();
            if (labOrderRepo != null)
            {
                var unlinkedLabOrders = await labOrderRepo
                    .Query(o => o.ClinicId == encounter.ClinicId && !o.IsSigned && o.ConsultationId == null && o.QueueItemId == qId)
                    .ToListAsync(ct);
                foreach (var lo in unlinkedLabOrders)
                {
                    lo.ConsultationId = encounter.Id;
                    labOrderRepo.Update(lo);
                }
            }
        }

        // 2. Relational synchronization of unsigned LabOrder + LabOrderItems when DraftDiagnosticOrders is explicitly provided
        if (draftDiagnosticOrders != null)
        {
            var labOrderRepo = repoProvider.GetRepository<LabOrder>();
            var labOrderItemRepo = repoProvider.GetRepository<LabOrderItem>();
            var labObservationRepo = repoProvider.GetRepository<LabObservation>();
            var labResultRepo = repoProvider.GetRepository<LabResult>();
            var uploadGrantRepo = repoProvider.GetRepository<UploadGrant>();
            var patientRepo = repoProvider.GetRepository<Patient>();

            if (labOrderRepo != null && labOrderItemRepo != null)
            {
                var outsideItems = draftDiagnosticOrders
                    .Where(d => !string.IsNullOrWhiteSpace(d.Name) &&
                                string.Equals(d.FulfillmentMode, "outside", StringComparison.OrdinalIgnoreCase))
                    .ToList();

                var existingDraftOrders = await labOrderRepo
                    .Query(o => o.ClinicId == encounter.ClinicId &&
                                !o.IsSigned &&
                                o.ConsultationId == encounter.Id)
                    .Include(o => o.Items)
                    .OrderBy(o => o.OrderDate)
                    .ToListAsync(ct);

                if (outsideItems.Count == 0)
                {
                    foreach (var staleOrder in existingDraftOrders)
                    {
                        bool hasResults = false;
                        if (labObservationRepo != null)
                        {
                            hasResults = await labObservationRepo
                                .Query(obs => obs.LabOrderId == staleOrder.Id)
                                .IgnoreQueryFilters()
                                .AnyAsync(ct);
                        }
                        if (!hasResults && labResultRepo != null)
                        {
                            hasResults = await labResultRepo
                                .Query(r => r.LabOrderId == staleOrder.Id)
                                .IgnoreQueryFilters()
                                .AnyAsync(ct);
                        }

                        if (!hasResults)
                        {
                            if (uploadGrantRepo != null)
                            {
                                var grants = await uploadGrantRepo
                                    .Query(g => g.LabOrderId == staleOrder.Id)
                                    .IgnoreQueryFilters()
                                    .ToListAsync(ct);
                                foreach (var g in grants)
                                {
                                    uploadGrantRepo.Remove(g, hardDelete: true);
                                }
                            }

                            foreach (var item in staleOrder.Items.ToList())
                            {
                                labOrderItemRepo.Remove(item, hardDelete: true);
                            }
                            staleOrder.Items.Clear();
                            labOrderRepo.Remove(staleOrder, hardDelete: true);
                        }
                    }
                }
                else
                {
                    bool canPersistLabOrder = true;
                    if (patientRepo != null)
                    {
                        canPersistLabOrder = await patientRepo
                            .Query(p => p.Id == encounter.PatientId && p.ClinicId == encounter.ClinicId)
                            .AnyAsync(ct);
                    }

                    if (canPersistLabOrder)
                    {
                        var primaryOrder = existingDraftOrders.FirstOrDefault();
                        var isExistingOrder = primaryOrder != null;

                        if (primaryOrder == null)
                        {
                            var today = DateOnly.FromDateTime(DateTime.UtcNow);
                            var orderNumber = $"LAB-{today:yyyyMMdd}-{encounter.Id.ToString("N")[..12].ToUpperInvariant()}";
                            primaryOrder = new LabOrder
                            {
                                Id = Guid.NewGuid(),
                                TenantId = encounter.TenantId,
                                ClinicId = encounter.ClinicId,
                                OrderNumber = orderNumber,
                                PatientId = encounter.PatientId,
                                PatientName = ConsultationPlanManagementMapper.Truncate(encounter.PatientName, 150) ?? "Patient",
                                ConsultationId = encounter.Id,
                                QueueItemId = encounter.QueueItemId,
                                IsSigned = false,
                                OrderedByDoctorId = encounter.DoctorId,
                                OrderedByDoctorName = ConsultationPlanManagementMapper.Truncate(encounter.DoctorName, 150) ?? "Doctor",
                                OrderDate = DateTime.UtcNow,
                                Status = LabOrderStatus.Ordered,
                                ClinicalDiagnosis = string.IsNullOrWhiteSpace(encounter.Assessment) ? null : encounter.Assessment,
                                RequestingPhysicianName = ConsultationPlanManagementMapper.Truncate(encounter.DoctorName, 150),
                                RequestingPhysicianPrcNo = ConsultationPlanManagementMapper.Truncate(encounter.DoctorPrcLicense, 50),
                                RequestingPhysicianPan = ConsultationPlanManagementMapper.Truncate(encounter.DoctorPhilHealthPan, 50),
                                CreatedAt = DateTime.UtcNow,
                                CreatedBy = encounter.DoctorName
                            };
                        }
                        else
                        {
                            primaryOrder.QueueItemId ??= encounter.QueueItemId;
                            primaryOrder.OrderedByDoctorId = encounter.DoctorId;
                            primaryOrder.OrderedByDoctorName = ConsultationPlanManagementMapper.Truncate(encounter.DoctorName, 150) ?? primaryOrder.OrderedByDoctorName;
                            primaryOrder.ClinicalDiagnosis = string.IsNullOrWhiteSpace(encounter.Assessment)
                                ? primaryOrder.ClinicalDiagnosis
                                : encounter.Assessment;
                            primaryOrder.RequestingPhysicianName = ConsultationPlanManagementMapper.Truncate(encounter.DoctorName, 150) ?? primaryOrder.RequestingPhysicianName;
                            primaryOrder.RequestingPhysicianPrcNo = ConsultationPlanManagementMapper.Truncate(encounter.DoctorPrcLicense, 50) ?? primaryOrder.RequestingPhysicianPrcNo;
                            primaryOrder.RequestingPhysicianPan = ConsultationPlanManagementMapper.Truncate(encounter.DoctorPhilHealthPan, 50) ?? primaryOrder.RequestingPhysicianPan;
                            primaryOrder.UpdatedAt = DateTime.UtcNow;
                            primaryOrder.UpdatedBy = encounter.DoctorName;

                            bool hasLinkedObservations = false;
                            if (labObservationRepo != null)
                            {
                                hasLinkedObservations = await labObservationRepo
                                    .Query(obs => obs.LabOrderId == primaryOrder.Id)
                                    .IgnoreQueryFilters()
                                    .AnyAsync(ct);
                            }

                            if (!hasLinkedObservations)
                            {
                                foreach (var oldItem in primaryOrder.Items.ToList())
                                {
                                    labOrderItemRepo.Remove(oldItem, hardDelete: true);
                                }
                                primaryOrder.Items.Clear();
                            }
                        }

                        if (primaryOrder.Items.Count == 0)
                        {
                            foreach (var item in outsideItems)
                            {
                                var newItem = new LabOrderItem
                                {
                                    Id = Guid.NewGuid(),
                                    TenantId = encounter.TenantId,
                                    ClinicId = encounter.ClinicId,
                                    LabOrderId = primaryOrder.Id,
                                    TestName = ConsultationPlanManagementMapper.Truncate(item.Name, 150) ?? "Diagnostic Test",
                                    Category = ConsultationPlanManagementMapper.Truncate(item.Category, 50) ?? "Diagnostic",
                                    Instructions = ConsultationPlanManagementMapper.Truncate(item.Instructions, 500),
                                    TestCode = ConsultationPlanManagementMapper.Truncate(item.Code, 20),
                                    PhilHealthServiceCode = ConsultationPlanManagementMapper.Truncate(item.PhilHealthCode, 50),
                                    DiagnosticFee = item.StandardPrice,
                                    IsDoneOutsideFacility = true,
                                    Status = LabOrderStatus.Ordered,
                                    CreatedAt = DateTime.UtcNow,
                                    CreatedBy = encounter.DoctorName
                                };
                                if (isExistingOrder)
                                {
                                    await labOrderItemRepo.AddAsync(newItem, ct);
                                }
                                if (!primaryOrder.Items.Contains(newItem))
                                {
                                    primaryOrder.Items.Add(newItem);
                                }
                            }
                        }

                        if (!isExistingOrder)
                        {
                            await labOrderRepo.AddAsync(primaryOrder, ct);
                        }
                    }
                }
            }
        }
    }

    private static void ResetExamSystemFields(PatientPhysicalExam exam)
    {
        exam.SkinRemarks = null;
        exam.HeentRemarks = null;
        exam.ChestLungsRemarks = null;
        exam.HeartRemarks = null;
        exam.AbdomenRemarks = null;
        exam.NeurologicalRemarks = null;
        exam.DigitalRectalRemarks = null;
        exam.GenitourinaryRemarks = null;
        exam.MusculoskeletalRemarks = null;
        exam.SkinId = null;
        exam.HeentId = null;
        exam.ChestId = null;
        exam.HeartId = null;
        exam.AbdomenId = null;
        exam.NeuroId = null;
        exam.RectalId = null;
        exam.GuId = null;
    }

    private static void ApplyFindingToExamColumns(
        PatientPhysicalExam exam,
        PhysicalExamSystem sys,
        bool isNormal,
        string? code,
        string? remarks)
    {
        switch (sys)
        {
            case PhysicalExamSystem.GeneralSurvey:
                if (!string.IsNullOrWhiteSpace(code))
                {
                    exam.GenSurveyId = code;
                    exam.GeneralSurveyCodes = code;
                }
                exam.GeneralSurveyStatus = !isNormal || exam.GenSurveyId is "2" or "99"
                    ? GeneralSurveyStatus.Abnormal
                    : GeneralSurveyStatus.Normal;
                if (remarks != null) exam.GeneralSurveyRemarks = remarks;
                break;
            case PhysicalExamSystem.Skin:
                exam.SkinId = code;
                exam.SkinRemarks = remarks;
                break;
            case PhysicalExamSystem.Heent:
                exam.HeentId = code;
                exam.HeentRemarks = remarks;
                break;
            case PhysicalExamSystem.Chest:
                exam.ChestId = code;
                exam.ChestLungsRemarks = remarks;
                break;
            case PhysicalExamSystem.Heart:
                exam.HeartId = code;
                exam.HeartRemarks = remarks;
                break;
            case PhysicalExamSystem.Abdomen:
                exam.AbdomenId = code;
                exam.AbdomenRemarks = remarks;
                break;
            case PhysicalExamSystem.Neurological:
                exam.NeuroId = code;
                exam.NeurologicalRemarks = remarks;
                break;
            case PhysicalExamSystem.Rectal:
                exam.RectalId = code;
                exam.DigitalRectalRemarks = remarks;
                break;
            case PhysicalExamSystem.Genitourinary:
                exam.GuId = code;
                exam.GenitourinaryRemarks = remarks;
                break;
            case PhysicalExamSystem.Musculoskeletal:
                exam.MusculoskeletalRemarks = remarks;
                break;
        }
    }

    internal static bool TryParsePhysicalExamSystem(string? raw, out PhysicalExamSystem system)
    {
        system = PhysicalExamSystem.GeneralSurvey;
        if (string.IsNullOrWhiteSpace(raw))
        {
            return false;
        }

        if (Enum.TryParse<PhysicalExamSystem>(raw.Trim(), ignoreCase: true, out var direct))
        {
            system = direct;
            return true;
        }

        var norm = new string(raw.Where(char.IsLetterOrDigit).Select(char.ToLowerInvariant).ToArray());
        if (string.IsNullOrEmpty(norm)) return false;

        if (norm.Contains("general") || norm.Contains("survey"))
        {
            system = PhysicalExamSystem.GeneralSurvey;
            return true;
        }
        if (norm.Contains("skin") || norm.Contains("extremit"))
        {
            system = PhysicalExamSystem.Skin;
            return true;
        }
        if (norm.Contains("heent") || norm.Contains("head") || norm.Contains("eye"))
        {
            system = PhysicalExamSystem.Heent;
            return true;
        }
        if (norm.Contains("chest") || norm.Contains("lung") || norm.Contains("pulmo") || norm.Contains("respirat"))
        {
            system = PhysicalExamSystem.Chest;
            return true;
        }
        if (norm.Contains("heart") || norm.Contains("cvs") || norm.Contains("cardio"))
        {
            system = PhysicalExamSystem.Heart;
            return true;
        }
        if (norm.Contains("abdo") || norm.Contains("gastro") || norm is "gi" or "gitract")
        {
            system = PhysicalExamSystem.Abdomen;
            return true;
        }
        if (norm.Contains("neuro") || norm.Contains("cns"))
        {
            system = PhysicalExamSystem.Neurological;
            return true;
        }
        if (norm.Contains("rectal") || norm.Contains("dre"))
        {
            system = PhysicalExamSystem.Rectal;
            return true;
        }
        if (norm.Contains("genito") || norm == "gu")
        {
            system = PhysicalExamSystem.Genitourinary;
            return true;
        }
        if (norm.Contains("musculo") || norm.Contains("msk") || norm.Contains("skelet"))
        {
            system = PhysicalExamSystem.Musculoskeletal;
            return true;
        }

        return false;
    }

    private static bool HasAnyObGyneValue(ConsultationObGyneExamDto dto) =>
        dto.Gravidity.HasValue ||
        dto.Parity.HasValue ||
        dto.TermBirths.HasValue ||
        dto.PretermBirths.HasValue ||
        dto.Abortions.HasValue ||
        dto.LivingChildren.HasValue ||
        !string.IsNullOrWhiteSpace(dto.Lmp) ||
        !string.IsNullOrWhiteSpace(dto.Edd) ||
        dto.GestationalAgeWeeks.HasValue ||
        dto.FundicHeightCm.HasValue ||
        dto.FetalHeartToneBpm.HasValue ||
        !string.IsNullOrWhiteSpace(dto.FetalPresentation) ||
        !string.IsNullOrWhiteSpace(dto.Remarks);

    private static bool HasAnyPediatricMilestoneValue(ConsultationPediatricMilestoneDto dto) =>
        !string.IsNullOrWhiteSpace(dto.MilestoneVisitAge) ||
        !string.IsNullOrWhiteSpace(dto.GrossMotorStatus) ||
        !string.IsNullOrWhiteSpace(dto.FineMotorStatus) ||
        !string.IsNullOrWhiteSpace(dto.LanguageStatus) ||
        !string.IsNullOrWhiteSpace(dto.CognitiveStatus) ||
        !string.IsNullOrWhiteSpace(dto.SocialEmotionalStatus) ||
        (dto.DangerSigns != null && dto.DangerSigns.Any(s => !string.IsNullOrWhiteSpace(s))) ||
        !string.IsNullOrWhiteSpace(dto.Remarks);

    private static bool HasAnyAdolescentValue(ConsultationAdolescentAssessmentDto dto) =>
        dto.TannerStage.HasValue ||
        !string.IsNullOrWhiteSpace(dto.SmrBreastRating) ||
        !string.IsNullOrWhiteSpace(dto.SmrGenitalRating) ||
        !string.IsNullOrWhiteSpace(dto.SmrPubicHairRating) ||
        dto.MenarcheAgeYears.HasValue ||
        dto.IsSexuallyActive.HasValue ||
        dto.SubstanceUseNoted.HasValue ||
        dto.DepressionScreenPositive.HasValue ||
        !string.IsNullOrWhiteSpace(dto.Remarks);

    private static bool? ParseMilestoneAtPar(string? status)
    {
        if (string.IsNullOrWhiteSpace(status)) return null;
        if (status.Contains("delay", StringComparison.OrdinalIgnoreCase) ||
            status.Contains("abnorm", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }
        if (status.Contains("normal", StringComparison.OrdinalIgnoreCase) ||
            status.Contains("par", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }
        return null;
    }

    private static int? ParseStageNumber(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var match = FirstDigitRegex.Match(raw);
        if (match.Success && int.TryParse(match.Groups[1].Value, out var stage))
        {
            return stage;
        }
        return null;
    }
}
