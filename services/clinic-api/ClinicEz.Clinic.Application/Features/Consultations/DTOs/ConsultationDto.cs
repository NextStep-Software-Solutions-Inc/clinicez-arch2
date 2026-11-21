global using EncounterTimelineItemDto = ClinicEz.Clinic.Application.Features.Consultations.DTOs.ConsultationEncounterDto;

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using ClinicEz.Clinic.Application.Features.Dental.DTOs;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Application.Features.Consultations.DTOs;

public sealed record EncounterDiagnosisDto(
    Guid Id,
    string Icd10Code,
    string Description,
    bool IsPrimary);

public sealed record EncounterRosItemDto(
    Guid Id,
    string System,
    string SymptomCode,
    string? SymptomTitle,
    bool IsNormal,
    string? OtherSpecification,
    string? Remarks,
    string? OptionCode = null,
    string? SymptomName = null,
    bool? IsPertinentPositive = null,
    string? PainSite = null,
    string? OthersSpecifyText = null);

public sealed record PrescriptionItemDto(
    Guid Id,
    string GenericName,
    string? BrandName,
    string Dosage,
    string Form,
    string Sig,
    int Quantity,
    int? DurationDays,
    int Refills,
    bool IsDangerousDrug,
    string? Remarks,
    string? PhilHealthDrugCode = null,
    bool IsClinicDispensed = false,
    int? ClinicDispensedQuantity = null,
    DateTime? ClinicDispensedAt = null,
    string? ClinicDispensedBy = null,
    string? RosCategory = null);

public sealed record ConsultationPhysicalExamFindingDto(
    Guid? Id = null,
    string System = "",
    bool IsNormal = true,
    string FindingTitle = "",
    string? OptionCode = null,
    string? PhilHealthFindingCode = null,
    string? BodySite = null,
    string? Laterality = null,
    string? Remarks = null);

public sealed record ConsultationPhysicalExamDto(
    Guid? Id = null,
    string? GeneralSurveyId = null,
    string? GeneralSurveyRemarks = null,
    IReadOnlyList<ConsultationPhysicalExamFindingDto>? Findings = null);

public sealed record ConsultationObGyneExamDto(
    Guid? Id = null,
    int? Gravidity = null,
    int? Parity = null,
    int? TermBirths = null,
    int? PretermBirths = null,
    int? Abortions = null,
    int? LivingChildren = null,
    string? Lmp = null,
    string? Edd = null,
    int? GestationalAgeWeeks = null,
    decimal? FundicHeightCm = null,
    int? FetalHeartToneBpm = null,
    string? FetalPresentation = null,
    string? Remarks = null);

public sealed record ConsultationPediatricMilestoneDto(
    Guid? Id = null,
    string? MilestoneVisitAge = null,
    string? GrossMotorStatus = null,
    string? FineMotorStatus = null,
    string? LanguageStatus = null,
    string? CognitiveStatus = null,
    string? SocialEmotionalStatus = null,
    IReadOnlyList<string>? DangerSigns = null,
    string? Remarks = null);

public sealed record ConsultationAdolescentAssessmentDto(
    Guid? Id = null,
    int? TannerStage = null,
    string? SmrBreastRating = null,
    string? SmrGenitalRating = null,
    string? SmrPubicHairRating = null,
    int? MenarcheAgeYears = null,
    bool? IsSexuallyActive = null,
    bool? SubstanceUseNoted = null,
    bool? DepressionScreenPositive = null,
    string? Remarks = null);

public sealed record ConsultationHeadsssAssessmentDto(
    Guid? Id = null,
    string Domain = "",
    string AssessmentText = "",
    bool? HasRedFlags = null,
    IReadOnlyList<string>? RedFlags = null);

public sealed record ConsultationBpMonitoringLogDto(
    Guid? Id = null,
    string RecordedAt = "",
    int Systolic = 0,
    int Diastolic = 0,
    int? PulseBpm = null,
    string? Location = null,
    string? Arm = null,
    string? Remarks = null);

public sealed record DraftDiagnosticOrderDto(
    string? ServiceItemId = null,
    string? Code = null,
    string Name = "",
    string Category = "Diagnostic",
    decimal StandardPrice = 0m,
    string? PhilHealthCode = null,
    string FulfillmentMode = "outside",
    string? Instructions = null);

public sealed record DraftProcedureOrderDto(
    string? ServiceItemId = null,
    string? Code = null,
    string Name = "",
    string Category = "Procedure",
    decimal StandardPrice = 0m,
    string? Instructions = null,
    string? RoomId = null,
    string? RoomName = null,
    string? TargetRoomId = null,
    string? TargetRoomName = null,
    string? Status = null,
    int? ToothNumber = null,
    string? ToothSurface = null,
    bool IsHandedOff = false,
    string? ProcedureId = null);

public sealed record DraftDentalToothDto(
    int ToothNumber = 0,
    string Status = "Healthy",
    string? Surface = null,
    string? Notes = null);

public sealed record ConsultationDraftWorkspaceDto(
    string? CdsOverrideReason = null,
    bool? CdsOverrideConfirmed = null,
    string? PlanDiagnosticServicesOption = null,
    bool? PlanHasMedicationPrescription = null,
    bool? PlanHasReferral = null,
    bool? PlanHasCancerScreening = null,
    bool? PlanHasFollowUp = null,
    string? MedCertFitness = null,
    string? MedCertRestDays = null,
    string? MedCertPurpose = null,
    string? MedCertRemarks = null,
    string? RefFacility = null,
    string? RefDepartment = null,
    string? RefUrgency = null,
    string? RefReason = null,
    string? RefSummary = null,
    bool? RxShowAddForm = null,
    string? RxDraftGeneric = null,
    string? RxDraftDosage = null,
    string? RxDraftForm = null,
    string? RxDraftSig = null,
    string? RxDraftQuantity = null,
    string? RxDraftClinicDispensedQty = null,
    bool? RxDraftDangerous = null,
    string? RxDraftDrugCode = null,
    IReadOnlyList<string>? RosCategories = null);

internal sealed record ConsultationDraftEnvelope(
    IReadOnlyList<DraftDiagnosticOrderDto>? DraftDiagnosticOrders = null,
    IReadOnlyList<DraftProcedureOrderDto>? DraftProcedures = null,
    IReadOnlyList<DraftDentalToothDto>? DraftDentalTeeth = null,
    ConsultationDraftWorkspaceDto? DraftWorkspace = null);

public sealed record ConsultationEncounterDto(
    Guid Id,
    string TenantId,
    Guid ClinicId,
    Guid? QueueItemId,
    Guid? AppointmentId,
    Guid PatientId,
    string PatientName,
    Guid DoctorId,
    string DoctorName,
    DateTime EncounterDate,
    string Subjective,
    string Objective,
    string Assessment,
    string Plan,
    string? HomeInstructions,
    string? DoctorPrcLicense,
    string? DoctorPtr,
    string? DoctorS2License,
    bool IsSigned,
    DateTime? SignedAt,
    IReadOnlyList<EncounterDiagnosisDto> Diagnoses,
    IReadOnlyList<PrescriptionItemDto> Prescriptions,
    bool IsYakapEligible = false,
    string? PhilHealthSignSympCode = null,
    string? PhilHealthOtherComplaint = null,
    string? PhilHealthPainSite = null,
    string? PhilHealthCaseNo = null,
    string? PhilHealthSoapTransNo = null,
    string? DoctorPhilHealthPan = null,
    string? PhilHealthAtc = null,
    string? HciCaseNo = null,
    string? HciTransNo = null,
    string? SoapTransNo = null,
    string? GeneralSurveyId = null,
    string? GeneralSurveyRemarks = null,
    string? PhysicalExamFindingsJson = null,
    RxPharmacyStatusDto? RxStatus = null,
    List<DentalToothRecordDto>? DentalFindings = null,
    string? CounselingCodes = null,
    string? RoutineVaccineName = null,
    string? RoutineVaccineDate = null,
    string? AdultsRoutineScreeningCode = null,
    string? PediatricRoutineScreeningCode = null,
    string? PrenatalScreeningServicesCode = null,
    string? CancerScreeningCodes = null,
    string? DiagnosticServicesOption = null,
    bool HasMedicationPrescription = false,
    bool HasReferral = false,
    string? OtherMedicalAdviceSpec = null,
    bool HasFollowUp = false,
    string? FollowUpDate = null,
    string? FollowUpScheduleText = null,
    string? FollowUpReason = null,
    string? FollowUpVaccineName = null,
    string? FollowUpVaccineNextDate = null,
    string? RosCategory = null,
    string? RosCategoryLabel = null,
    IReadOnlyList<EncounterRosItemDto>? ReviewOfSystemsItems = null,
    string? VisitWorkflowMode = null,
    DateTime? CreatedAt = null,
    DateTime? UpdatedAt = null,
    IReadOnlyList<ConsultationPhysicalExamDto>? PhysicalExams = null,
    ConsultationObGyneExamDto? ObGyneExam = null,
    IReadOnlyList<ConsultationPediatricMilestoneDto>? PediatricMilestones = null,
    ConsultationAdolescentAssessmentDto? AdolescentAssessment = null,
    IReadOnlyList<ConsultationHeadsssAssessmentDto>? HeadsssAssessments = null,
    IReadOnlyList<ConsultationBpMonitoringLogDto>? BpMonitoringLogs = null,
    IReadOnlyList<DraftDiagnosticOrderDto>? DraftDiagnosticOrders = null,
    IReadOnlyList<DraftProcedureOrderDto>? DraftProcedures = null,
    IReadOnlyList<DraftDentalToothDto>? DraftDentalTeeth = null,
    ConsultationDraftWorkspaceDto? DraftWorkspace = null,
    IReadOnlyList<string>? RosCategories = null);

public static class ConsultationPlanManagementMapper
{
    private const string MetaPrefix = "__CLINICEZ_META__:";

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public static void Apply(
        ConsultationEncounter encounter,
        string? counselingCodes,
        string? routineVaccineName,
        string? routineVaccineDate,
        string? adultsRoutineScreeningCode,
        string? pediatricRoutineScreeningCode,
        string? prenatalScreeningServicesCode,
        string? cancerScreeningCodes,
        string? diagnosticServicesOption,
        bool? hasMedicationPrescription,
        bool? hasReferral,
        string? otherMedicalAdviceSpec,
        bool? hasFollowUp,
        string? followUpDate,
        string? followUpScheduleText,
        string? followUpReason,
        string? followUpVaccineName,
        string? followUpVaccineNextDate)
    {
        if (counselingCodes != null) encounter.CounselingCodes = Truncate(counselingCodes, 100);
        if (routineVaccineName != null) encounter.RoutineVaccineName = Truncate(routineVaccineName, 255);
        if (routineVaccineDate != null) encounter.RoutineVaccineDate = ParseOptionalDate(routineVaccineDate);
        if (adultsRoutineScreeningCode != null) encounter.AdultsRoutineScreeningCode = Truncate(adultsRoutineScreeningCode, 100);
        if (pediatricRoutineScreeningCode != null) encounter.PediatricRoutineScreeningCode = Truncate(pediatricRoutineScreeningCode, 100);
        if (prenatalScreeningServicesCode != null) encounter.PrenatalScreeningServicesCode = Truncate(prenatalScreeningServicesCode, 100);
        if (cancerScreeningCodes != null) encounter.PhilHealthManagementCodes = string.IsNullOrWhiteSpace(cancerScreeningCodes) ? null : cancerScreeningCodes.Trim();
        if (diagnosticServicesOption != null) encounter.DiagnosticServicesOption = Truncate(diagnosticServicesOption, 10);
        if (hasMedicationPrescription.HasValue) encounter.HasMedicationPrescription = hasMedicationPrescription.Value;
        if (hasReferral.HasValue) encounter.HasReferral = hasReferral.Value;
        if (otherMedicalAdviceSpec != null) encounter.OtherMedicalAdviceSpec = Truncate(otherMedicalAdviceSpec, 500);
        if (hasFollowUp.HasValue) encounter.HasFollowUp = hasFollowUp.Value;
        if (followUpDate != null) encounter.FollowUpDate = ParseOptionalDate(followUpDate);
        if (followUpScheduleText != null) encounter.FollowUpScheduleText = Truncate(followUpScheduleText, 100);
        if (followUpReason != null) encounter.FollowUpReason = Truncate(followUpReason, 250);
        if (followUpVaccineName != null) encounter.FollowUpVaccineName = Truncate(followUpVaccineName, 255);
        if (followUpVaccineNextDate != null) encounter.FollowUpVaccineNextDate = ParseOptionalDate(followUpVaccineNextDate);
    }

    public static ConsultationEncounterDto ToDto(
        ConsultationEncounter encounter,
        string? hciTransNo = null,
        RxPharmacyStatusDto? rxStatus = null,
        List<DentalToothRecordDto>? dentalFindings = null,
        string? tenantIdOverride = null)
    {
        var draftEnvelope = DeserializeDraftEnvelope(encounter.IsSigned ? null : encounter.DraftOrdersJson);
        var physicalExamsDto = MapPhysicalExams(encounter);
        var obGyneDto = MapObGyneExam(encounter.ObGyneExam);
        var milestonesDto = MapPediatricMilestones(encounter.PediatricMilestones);
        var adolescentDto = MapAdolescentAssessment(encounter.AdolescentAssessment);
        var headsssDto = MapHeadsssAssessments(encounter.HeadsssAssessments);
        var bpLogsDto = MapBpMonitoringLogs(encounter.BpMonitoringLogs);

        var resolvedWorkflowMode = encounter.IsYakapEligible
            ? Domain.Enums.VisitWorkflowMode.YakapAvailment.ToString()
            : encounter.VisitWorkflowMode.ToString();

        var hasExplicitWorkspaceRosCategories = draftEnvelope?.DraftWorkspace?.RosCategories != null;
        var resolvedRosSystems = new List<Domain.Enums.RosSystem>();
        if (hasExplicitWorkspaceRosCategories)
        {
            foreach (var rawCat in draftEnvelope!.DraftWorkspace!.RosCategories!)
            {
                if (RosCategoryHelper.TryParse(rawCat, out var parsedCat) && !resolvedRosSystems.Contains(parsedCat))
                {
                    resolvedRosSystems.Add(parsedCat);
                }
            }
        }
        else if (encounter.RosCategory.HasValue)
        {
            resolvedRosSystems.Add(encounter.RosCategory.Value);
        }
        if (resolvedRosSystems.Any(s => s != Domain.Enums.RosSystem.EssentiallyNormal))
        {
            resolvedRosSystems.RemoveAll(s => s == Domain.Enums.RosSystem.EssentiallyNormal);
        }
        var primaryRosCategory = resolvedRosSystems.Count > 0
            ? resolvedRosSystems[0].ToString()
            : encounter.RosCategory?.ToString();
        var rosCategoryLabel = resolvedRosSystems.Count > 0
            ? string.Join(", ", resolvedRosSystems.Select(RosCategoryHelper.ToDisplayLabel))
            : !hasExplicitWorkspaceRosCategories && encounter.RosCategory.HasValue
                ? RosCategoryHelper.ToDisplayLabel(encounter.RosCategory.Value)
                : null;
        var rosCategoriesList = hasExplicitWorkspaceRosCategories
            ? resolvedRosSystems.Select(s => s.ToString()).ToList()
            : resolvedRosSystems.Count > 0
                ? resolvedRosSystems.Select(s => s.ToString()).ToList()
                : null;

        return new ConsultationEncounterDto(
            encounter.Id,
            tenantIdOverride ?? encounter.TenantId,
            encounter.ClinicId,
            encounter.QueueItemId,
            encounter.AppointmentId,
            encounter.PatientId,
            encounter.PatientName,
            encounter.DoctorId,
            encounter.DoctorName,
            encounter.EncounterDate,
            encounter.Subjective,
            encounter.Objective,
            encounter.Assessment,
            encounter.Plan,
            encounter.HomeInstructions,
            encounter.DoctorPrcLicense,
            encounter.DoctorPtr,
            encounter.DoctorS2License,
            encounter.IsSigned,
            encounter.SignedAt,
            encounter.Diagnoses.Select(d => new EncounterDiagnosisDto(d.Id, d.Icd10Code, d.Description, d.IsPrimary)).ToList(),
            encounter.Prescriptions.Select(p => new PrescriptionItemDto(
                p.Id,
                p.GenericName,
                p.BrandName,
                p.Dosage,
                p.Form,
                p.Sig,
                p.Quantity,
                p.DurationDays,
                p.Refills,
                p.IsDangerousDrug,
                p.Remarks,
                p.PhilHealthDrugCode,
                encounter.IsSigned && p.IsClinicDispensed,
                p.ClinicDispensedQuantity,
                encounter.IsSigned ? p.ClinicDispensedAt : null,
                encounter.IsSigned ? p.ClinicDispensedBy : null,
                p.RosCategory?.ToString())).ToList(),
            encounter.IsYakapEligible,
            encounter.PhilHealthSignSympCode,
            encounter.PhilHealthOtherComplaint,
            encounter.PhilHealthPainSite,
            encounter.PhilHealthCaseNo,
            encounter.PhilHealthSoapTransNo,
            encounter.DoctorPhilHealthPan,
            encounter.PhilHealthAtc,
            encounter.PhilHealthCaseNo,
            hciTransNo,
            encounter.PhilHealthSoapTransNo,
            encounter.PhysicalExams.FirstOrDefault()?.GenSurveyId,
            encounter.PhysicalExams.FirstOrDefault()?.GeneralSurveyRemarks,
            encounter.GetPhysicalExamFindings() != null ? JsonSerializer.Serialize(encounter.GetPhysicalExamFindings()) : null,
            rxStatus,
            dentalFindings,
            encounter.CounselingCodes,
            encounter.RoutineVaccineName,
            encounter.RoutineVaccineDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            encounter.AdultsRoutineScreeningCode,
            encounter.PediatricRoutineScreeningCode,
            encounter.PrenatalScreeningServicesCode,
            encounter.PhilHealthManagementCodes,
            encounter.DiagnosticServicesOption,
            encounter.HasMedicationPrescription || encounter.Prescriptions.Count > 0,
            encounter.HasReferral,
            encounter.OtherMedicalAdviceSpec,
            encounter.HasFollowUp,
            encounter.FollowUpDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            encounter.FollowUpScheduleText,
            encounter.FollowUpReason,
            encounter.FollowUpVaccineName,
            encounter.FollowUpVaccineNextDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            primaryRosCategory,
            rosCategoryLabel,
            encounter.ReviewOfSystemsItems?.Select(MapRosItem).ToList(),
            VisitWorkflowMode: resolvedWorkflowMode,
            CreatedAt: encounter.CreatedAt,
            UpdatedAt: encounter.UpdatedAt ?? encounter.CreatedAt,
            PhysicalExams: physicalExamsDto,
            ObGyneExam: obGyneDto,
            PediatricMilestones: milestonesDto,
            AdolescentAssessment: adolescentDto,
            HeadsssAssessments: headsssDto,
            BpMonitoringLogs: bpLogsDto,
            DraftDiagnosticOrders: draftEnvelope?.DraftDiagnosticOrders,
            DraftProcedures: draftEnvelope?.DraftProcedures,
            DraftDentalTeeth: draftEnvelope?.DraftDentalTeeth,
            DraftWorkspace: draftEnvelope?.DraftWorkspace,
            RosCategories: rosCategoriesList);
    }

    public static EncounterRosItemDto MapRosItem(EncounterReviewOfSystemsItem r)
    {
        var (painSite, cleanRemarks) = SplitPainSiteAndRemarks(r.Remarks);
        return new EncounterRosItemDto(
            r.Id,
            r.System.ToString(),
            r.SymptomCode,
            r.SymptomTitle,
            r.IsNormal,
            r.OtherSpecification,
            cleanRemarks,
            OptionCode: r.SymptomCode,
            SymptomName: r.SymptomTitle,
            IsPertinentPositive: !r.IsNormal,
            PainSite: painSite,
            OthersSpecifyText: r.OtherSpecification);
    }

    internal static (string? PainSite, string? CleanRemarks) SplitPainSiteAndRemarks(string? rawRemarks)
    {
        if (string.IsNullOrWhiteSpace(rawRemarks))
        {
            return (null, null);
        }

        var trimmed = rawRemarks.Trim();
        if (!trimmed.StartsWith("Site:", StringComparison.OrdinalIgnoreCase))
        {
            return (null, trimmed);
        }

        var afterPrefix = trimmed[5..].Trim();
        var sepIdx = afterPrefix.IndexOf(';');
        if (sepIdx < 0)
        {
            return (string.IsNullOrWhiteSpace(afterPrefix) ? null : afterPrefix, null);
        }

        var site = afterPrefix[..sepIdx].Trim();
        var rest = afterPrefix[(sepIdx + 1)..].Trim();
        if (rest.StartsWith("Site:", StringComparison.OrdinalIgnoreCase))
        {
            var (_, nestedRest) = SplitPainSiteAndRemarks(rest);
            rest = nestedRest ?? string.Empty;
        }

        return (
            string.IsNullOrWhiteSpace(site) ? null : site,
            string.IsNullOrWhiteSpace(rest) ? null : rest);
    }

    internal static string? SerializeDraftEnvelope(ConsultationDraftEnvelope? envelope)
    {
        if (envelope == null)
        {
            return null;
        }

        bool hasAny =
            envelope.DraftDiagnosticOrders != null ||
            envelope.DraftProcedures != null ||
            envelope.DraftDentalTeeth != null ||
            HasDraftWorkspaceData(envelope.DraftWorkspace);

        return hasAny ? JsonSerializer.Serialize(envelope, JsonOpts) : null;
    }

    internal static ConsultationDraftEnvelope? DeserializeDraftEnvelope(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<ConsultationDraftEnvelope>(json, JsonOpts);
        }
        catch
        {
            return null;
        }
    }

    internal static string? PackEntityMetadata<TMeta>(string? userRemarks, TMeta meta, int? maxLength = null)
    {
        var metaJson = JsonSerializer.Serialize(meta, JsonOpts);
        var suffix = $"{MetaPrefix}{metaJson}";

        if (string.IsNullOrWhiteSpace(userRemarks))
        {
            if (maxLength.HasValue && suffix.Length > maxLength.Value)
            {
                return null;
            }
            return suffix;
        }

        var trimmedUser = userRemarks.Trim();
        if (maxLength.HasValue)
        {
            if (suffix.Length >= maxLength.Value)
            {
                return Truncate(trimmedUser, maxLength.Value);
            }

            var availableForUser = maxLength.Value - suffix.Length - 1;
            if (availableForUser <= 0)
            {
                return suffix;
            }

            if (trimmedUser.Length > availableForUser)
            {
                trimmedUser = trimmedUser[..availableForUser].TrimEnd();
            }
        }

        return string.IsNullOrWhiteSpace(trimmedUser)
            ? suffix
            : $"{trimmedUser}\n{suffix}";
    }

    internal static (string? UserRemarks, TMeta? Meta) UnpackEntityMetadata<TMeta>(string? rawRemarks) where TMeta : class
    {
        if (string.IsNullOrWhiteSpace(rawRemarks))
        {
            return (null, null);
        }

        var idx = rawRemarks.IndexOf(MetaPrefix, StringComparison.Ordinal);
        if (idx < 0)
        {
            return (rawRemarks, null);
        }

        var userPart = idx > 0 ? rawRemarks[..idx].Trim() : null;
        var jsonPart = rawRemarks[(idx + MetaPrefix.Length)..].Trim();
        try
        {
            var meta = JsonSerializer.Deserialize<TMeta>(jsonPart, JsonOpts);
            return (string.IsNullOrWhiteSpace(userPart) ? null : userPart, meta);
        }
        catch
        {
            return (string.IsNullOrWhiteSpace(userPart) ? null : userPart, null);
        }
    }

    internal static string MapHeadsssDomainToUi(HeadsssDomain domain) => domain switch
    {
        HeadsssDomain.EducationEmployment => "Education",
        HeadsssDomain.DrugsSubstances => "Drugs",
        HeadsssDomain.SuicideDepression => "Suicide",
        _ => domain.ToString()
    };

    internal static HeadsssDomain MapHeadsssDomainFromUi(string? domain)
    {
        if (string.IsNullOrWhiteSpace(domain)) return HeadsssDomain.Home;
        var norm = domain.Trim();
        if (norm.Equals("Education", StringComparison.OrdinalIgnoreCase) ||
            norm.Equals("Employment", StringComparison.OrdinalIgnoreCase) ||
            norm.Equals("EducationEmployment", StringComparison.OrdinalIgnoreCase))
        {
            return HeadsssDomain.EducationEmployment;
        }
        if (norm.Equals("Drugs", StringComparison.OrdinalIgnoreCase) ||
            norm.Equals("Substances", StringComparison.OrdinalIgnoreCase) ||
            norm.Equals("DrugsSubstances", StringComparison.OrdinalIgnoreCase))
        {
            return HeadsssDomain.DrugsSubstances;
        }
        if (norm.Equals("Suicide", StringComparison.OrdinalIgnoreCase) ||
            norm.Equals("Depression", StringComparison.OrdinalIgnoreCase) ||
            norm.Equals("SuicideDepression", StringComparison.OrdinalIgnoreCase) ||
            norm.Equals("DepressionSuicide", StringComparison.OrdinalIgnoreCase))
        {
            return HeadsssDomain.SuicideDepression;
        }
        return Enum.TryParse<HeadsssDomain>(norm, ignoreCase: true, out var parsed)
            ? parsed
            : HeadsssDomain.Home;
    }

    private static IReadOnlyList<ConsultationPhysicalExamDto>? MapPhysicalExams(ConsultationEncounter encounter)
    {
        if (encounter.PhysicalExams == null || encounter.PhysicalExams.Count == 0)
        {
            return null;
        }

        return encounter.PhysicalExams
            .Select(pe => new ConsultationPhysicalExamDto(
                Id: pe.Id,
                GeneralSurveyId: pe.GenSurveyId,
                GeneralSurveyRemarks: pe.GeneralSurveyRemarks,
                Findings: pe.Findings?
                    .Select(f =>
                    {
                        var code = f.PhilHealthFindingCode ?? ResolveSystemCode(pe, f.System, f.IsNormal);
                        var remarks = f.Remarks ?? ResolveSystemRemarks(pe, f.System);
                        return new ConsultationPhysicalExamFindingDto(
                            Id: f.Id,
                            System: f.System.ToString(),
                            IsNormal: f.IsNormal,
                            FindingTitle: f.FindingTitle,
                            OptionCode: code,
                            PhilHealthFindingCode: code,
                            BodySite: f.BodySite,
                            Laterality: f.Laterality,
                            Remarks: remarks);
                    })
                    .ToList()))
            .ToList();
    }

    private static string? ResolveSystemCode(PatientPhysicalExam pe, PhysicalExamSystem sys, bool isNormal) => sys switch
    {
        PhysicalExamSystem.GeneralSurvey => pe.GenSurveyId ?? (isNormal ? "1" : "2"),
        PhysicalExamSystem.Skin => pe.SkinId ?? (isNormal ? "1" : "99"),
        PhysicalExamSystem.Heent => pe.HeentId ?? (isNormal ? "11" : "99"),
        PhysicalExamSystem.Chest => pe.ChestId ?? (isNormal ? "6" : "99"),
        PhysicalExamSystem.Heart => pe.HeartId ?? (isNormal ? "5" : "99"),
        PhysicalExamSystem.Abdomen => pe.AbdomenId ?? (isNormal ? "7" : "99"),
        PhysicalExamSystem.Neurological => pe.NeuroId ?? (isNormal ? "6" : "99"),
        PhysicalExamSystem.Rectal => pe.RectalId ?? (isNormal ? "1" : "99"),
        PhysicalExamSystem.Genitourinary => pe.GuId ?? (isNormal ? "1" : "99"),
        PhysicalExamSystem.Musculoskeletal => isNormal ? "1" : "99",
        _ => isNormal ? "1" : "99"
    };

    private static string? ResolveSystemRemarks(PatientPhysicalExam pe, PhysicalExamSystem sys) => sys switch
    {
        PhysicalExamSystem.GeneralSurvey => pe.GeneralSurveyRemarks,
        PhysicalExamSystem.Skin => pe.SkinRemarks,
        PhysicalExamSystem.Heent => pe.HeentRemarks,
        PhysicalExamSystem.Chest => pe.ChestLungsRemarks,
        PhysicalExamSystem.Heart => pe.HeartRemarks,
        PhysicalExamSystem.Abdomen => pe.AbdomenRemarks,
        PhysicalExamSystem.Neurological => pe.NeurologicalRemarks,
        PhysicalExamSystem.Rectal => pe.DigitalRectalRemarks,
        PhysicalExamSystem.Genitourinary => pe.GenitourinaryRemarks,
        PhysicalExamSystem.Musculoskeletal => pe.MusculoskeletalRemarks,
        _ => null
    };

    private static ConsultationObGyneExamDto? MapObGyneExam(EncounterObGyneExam? exam)
    {
        if (exam == null) return null;
        var (userRemarks, meta) = UnpackEntityMetadata<ConsultationObGyneExamDto>(exam.Remarks);
        return new ConsultationObGyneExamDto(
            Id: exam.Id,
            Gravidity: meta?.Gravidity,
            Parity: meta?.Parity,
            TermBirths: meta?.TermBirths,
            PretermBirths: meta?.PretermBirths,
            Abortions: meta?.Abortions,
            LivingChildren: meta?.LivingChildren,
            Lmp: meta?.Lmp,
            Edd: meta?.Edd,
            GestationalAgeWeeks: meta?.GestationalAgeWeeks,
            FundicHeightCm: exam.FundicHeightCm ?? meta?.FundicHeightCm,
            FetalHeartToneBpm: exam.FetalHeartToneBpm ?? meta?.FetalHeartToneBpm,
            FetalPresentation: exam.LeopoldL1 ?? meta?.FetalPresentation,
            Remarks: userRemarks);
    }

    private static IReadOnlyList<ConsultationPediatricMilestoneDto>? MapPediatricMilestones(
        ICollection<EncounterPediatricMilestone>? milestones)
    {
        if (milestones == null || milestones.Count == 0) return null;
        return milestones
            .Select(m =>
            {
                var (userRemarks, meta) = UnpackEntityMetadata<ConsultationPediatricMilestoneDto>(m.DevelopmentalRemarks);
                var dangerSigns = m.DangerSigns is { Count: > 0 }
                    ? m.DangerSigns
                        .Where(d => d.IsPresent)
                        .Select(d => !string.IsNullOrWhiteSpace(d.Description) ? d.Description! : d.DangerSignCode)
                        .ToList()
                    : meta?.DangerSigns?.ToList();

                return new ConsultationPediatricMilestoneDto(
                    Id: m.Id,
                    MilestoneVisitAge: meta?.MilestoneVisitAge ?? m.MilestoneVisitAgeCode,
                    GrossMotorStatus: m.GrossMotorRemarks ?? meta?.GrossMotorStatus ?? MapAtParBool(m.IsGrossMotorAtPar),
                    FineMotorStatus: m.FineMotorRemarks ?? meta?.FineMotorStatus ?? MapAtParBool(m.IsFineMotorAtPar),
                    LanguageStatus: m.LanguageRemarks ?? meta?.LanguageStatus ?? MapAtParBool(m.IsLanguageAtPar),
                    CognitiveStatus: m.CognitiveRemarks ?? meta?.CognitiveStatus ?? MapAtParBool(m.IsCognitiveAtPar),
                    SocialEmotionalStatus: m.PsychosocialRemarks ?? meta?.SocialEmotionalStatus ?? MapAtParBool(m.IsPsychosocialAtPar),
                    DangerSigns: dangerSigns,
                    Remarks: userRemarks);
            })
            .ToList();
    }

    private static string? MapAtParBool(bool? isAtPar) =>
        isAtPar.HasValue ? (isAtPar.Value ? "Normal" : "Delayed") : null;

    private static ConsultationAdolescentAssessmentDto? MapAdolescentAssessment(EncounterAdolescentAssessment? item)
    {
        if (item == null) return null;
        var (userRemarks, meta) = UnpackEntityMetadata<ConsultationAdolescentAssessmentDto>(item.Remarks);
        int? parsedTanner = meta?.TannerStage;
        if (!parsedTanner.HasValue && int.TryParse(item.SmrResultCode, out var codeStage))
        {
            parsedTanner = codeStage;
        }
        parsedTanner ??= item.BreastStage ?? item.GenitalStage ?? item.PubicHairStage;

        return new ConsultationAdolescentAssessmentDto(
            Id: item.Id,
            TannerStage: parsedTanner,
            SmrBreastRating: meta?.SmrBreastRating ?? (item.BreastStage.HasValue ? $"Stage {item.BreastStage.Value}" : null),
            SmrGenitalRating: meta?.SmrGenitalRating ?? (item.GenitalStage.HasValue ? $"Stage {item.GenitalStage.Value}" : null),
            SmrPubicHairRating: meta?.SmrPubicHairRating ?? (item.PubicHairStage.HasValue ? $"Stage {item.PubicHairStage.Value}" : null),
            MenarcheAgeYears: meta?.MenarcheAgeYears,
            IsSexuallyActive: item.Q06SexuallyActiveUnsafeSex ?? meta?.IsSexuallyActive,
            SubstanceUseNoted: item.Q05TobaccoAlcoholDrugUse ?? meta?.SubstanceUseNoted,
            DepressionScreenPositive: item.Q07DepressionOrSadness ?? meta?.DepressionScreenPositive,
            Remarks: userRemarks);
    }

    private static IReadOnlyList<ConsultationHeadsssAssessmentDto>? MapHeadsssAssessments(
        ICollection<EncounterHeadsssDomainAssessment>? items)
    {
        if (items == null || items.Count == 0) return null;
        return items
            .Select(h => new ConsultationHeadsssAssessmentDto(
                Id: h.Id,
                Domain: MapHeadsssDomainToUi(h.Domain),
                AssessmentText: h.PatientAnswers ?? string.Empty,
                HasRedFlags: h.RequiresUrgentReferral || !string.IsNullOrWhiteSpace(h.RedFlagCodes),
                RedFlags: !string.IsNullOrWhiteSpace(h.RedFlagCodes)
                    ? h.RedFlagCodes.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    : null))
            .ToList();
    }

    private static IReadOnlyList<ConsultationBpMonitoringLogDto>? MapBpMonitoringLogs(
        ICollection<PatientBpMonitoringLog>? logs)
    {
        if (logs == null || logs.Count == 0) return null;
        var result = new List<ConsultationBpMonitoringLogDto>();
        foreach (var log in logs)
        {
            var (userRemarks, meta) = UnpackEntityMetadata<ConsultationBpMonitoringLogDto>(log.ClinicalInterpretation);
            var firstDay = log.Days?.OrderBy(d => d.DayNumber).FirstOrDefault();
            var systolic = firstDay?.AmSystolic
                ?? (log.OverallAverageSystolic.HasValue ? (int)Math.Round(log.OverallAverageSystolic.Value) : meta?.Systolic ?? 0);
            var diastolic = firstDay?.AmDiastolic
                ?? (log.OverallAverageDiastolic.HasValue ? (int)Math.Round(log.OverallAverageDiastolic.Value) : meta?.Diastolic ?? 0);
            var pulse = firstDay?.AmHeartRate ?? meta?.PulseBpm;
            var recordedAt = !string.IsNullOrWhiteSpace(meta?.RecordedAt)
                ? meta.RecordedAt
                : log.StartDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

            result.Add(new ConsultationBpMonitoringLogDto(
                Id: log.Id,
                RecordedAt: recordedAt,
                Systolic: systolic,
                Diastolic: diastolic,
                PulseBpm: pulse,
                Location: meta?.Location ?? firstDay?.Remarks,
                Arm: meta?.Arm,
                Remarks: userRemarks));
        }
        return result;
    }

    private static bool HasDraftWorkspaceData(ConsultationDraftWorkspaceDto? ws) =>
        ws != null &&
        (!string.IsNullOrWhiteSpace(ws.CdsOverrideReason) ||
         ws.CdsOverrideConfirmed == true ||
         ws.PlanDiagnosticServicesOption != null ||
         ws.PlanHasMedicationPrescription.HasValue ||
         ws.PlanHasReferral.HasValue ||
         ws.PlanHasCancerScreening.HasValue ||
         ws.PlanHasFollowUp.HasValue ||
         !string.IsNullOrWhiteSpace(ws.MedCertFitness) ||
         !string.IsNullOrWhiteSpace(ws.MedCertRestDays) ||
         !string.IsNullOrWhiteSpace(ws.MedCertPurpose) ||
         !string.IsNullOrWhiteSpace(ws.MedCertRemarks) ||
         !string.IsNullOrWhiteSpace(ws.RefFacility) ||
         !string.IsNullOrWhiteSpace(ws.RefDepartment) ||
         !string.IsNullOrWhiteSpace(ws.RefUrgency) ||
         !string.IsNullOrWhiteSpace(ws.RefReason) ||
         !string.IsNullOrWhiteSpace(ws.RefSummary) ||
         ws.RxShowAddForm == true ||
         !string.IsNullOrWhiteSpace(ws.RxDraftGeneric) ||
         !string.IsNullOrWhiteSpace(ws.RxDraftDosage) ||
         (!string.IsNullOrWhiteSpace(ws.RxDraftForm) && !string.Equals(ws.RxDraftForm, "Tablet", StringComparison.OrdinalIgnoreCase)) ||
         !string.IsNullOrWhiteSpace(ws.RxDraftSig) ||
         (!string.IsNullOrWhiteSpace(ws.RxDraftQuantity) && ws.RxDraftQuantity != "30") ||
         !string.IsNullOrWhiteSpace(ws.RxDraftClinicDispensedQty) ||
         ws.RxDraftDangerous == true ||
         !string.IsNullOrWhiteSpace(ws.RxDraftDrugCode) ||
         ws.RosCategories != null);

    internal static string? Truncate(string? value, int maxLen)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        return trimmed.Length <= maxLen ? trimmed : trimmed[..maxLen];
    }

    internal static DateOnly? ParseOptionalDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        if (DateOnly.TryParseExact(
            trimmed,
            new[] { "yyyy-MM-dd", "MM/dd/yyyy", "M/d/yyyy" },
            CultureInfo.InvariantCulture,
            DateTimeStyles.None,
            out var exact))
        {
            return exact;
        }
        if (DateTime.TryParse(trimmed, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var dt))
        {
            return DateOnly.FromDateTime(dt);
        }
        if (DateOnly.TryParse(trimmed, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
        {
            return parsed;
        }
        return null;
    }
}
