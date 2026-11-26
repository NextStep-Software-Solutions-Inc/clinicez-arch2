using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.HealthScreenings.DTOs;
using ClinicEz.Clinic.Application.Features.LabOrders.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Triage.DTOs;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.HealthScreenings.Common;

internal static class HealthScreeningHelper
{
    public const string DefaultScreeningServiceCodeFallback = "HEALTH-SCREEN";

    public static string ResolveScreeningTypeLabel(HealthScreeningType type) => type switch
    {
        HealthScreeningType.RoutineWellness => "Routine Wellness & NCD Screening",
        HealthScreeningType.AnnualPhysicalExam => "Annual Physical Exam (APE)",
        HealthScreeningType.PreEmployment => "Pre-Employment Health Screening",
        HealthScreeningType.SchoolPhysical => "School Physical Examination",
        HealthScreeningType.YakapFpe => "PhilHealth YAKAP Health Screening (FPE)",
        HealthScreeningType.CommunityScreening => "Community Health Screening",
        _ => "Health Screening"
    };

    public static bool RequiresPhysicianSignOff(
        HealthScreeningType screeningType,
        VisitWorkflowMode workflowMode,
        FacilitySettings? settings)
    {
        if (workflowMode == VisitWorkflowMode.YakapAvailment || screeningType == HealthScreeningType.YakapFpe)
        {
            return !(settings?.AllowNurseMidwifeYakapFpeFacilitator ?? false);
        }

        return screeningType is
            HealthScreeningType.AnnualPhysicalExam or
            HealthScreeningType.PreEmployment or
            HealthScreeningType.SchoolPhysical;
    }

    public static bool IsCallerPhysician(IClinicContext clinicContext, StaffMember? staff)
    {
        if (clinicContext.HasPermission(ClinicPermissions.ConsultationsSign) ||
            clinicContext.HasPermission(ClinicPermissions.ConsultationsWrite))
        {
            return true;
        }

        if (staff?.Role == StaffRole.Doctor)
        {
            return true;
        }

        return string.Equals(clinicContext.StaffRole?.Trim(), "Doctor", StringComparison.OrdinalIgnoreCase);
    }

    public static bool IsCallerAuthorizedNurseOrMidwife(IClinicContext clinicContext, StaffMember? staff)
    {
        bool hasClinicalNursingPerms =
            clinicContext.HasPermission(ClinicPermissions.TriageWrite) &&
            (clinicContext.HasPermission(ClinicPermissions.PatientsWrite) ||
             clinicContext.HasPermission(ClinicPermissions.QueueCompleteNonDoctor));

        if (hasClinicalNursingPerms)
        {
            return true;
        }

        if (staff != null &&
            (staff.Role == StaffRole.Nurse ||
             (staff.Title?.Contains("Midwife", StringComparison.OrdinalIgnoreCase) == true) ||
             (staff.Specialty?.Contains("Midwife", StringComparison.OrdinalIgnoreCase) == true) ||
             (staff.ClinicRole?.Name?.Contains("Midwife", StringComparison.OrdinalIgnoreCase) == true)) &&
            (clinicContext.HasPermission(ClinicPermissions.TriageWrite) ||
             clinicContext.HasPermission(ClinicPermissions.PatientsWrite) ||
             clinicContext.HasPermission(ClinicPermissions.QueueCompleteNonDoctor)))
        {
            return true;
        }

        return string.Equals(clinicContext.StaffRole?.Trim(), "Midwife", StringComparison.OrdinalIgnoreCase) &&
               (clinicContext.HasPermission(ClinicPermissions.TriageWrite) ||
                clinicContext.HasPermission(ClinicPermissions.PatientsWrite) ||
                clinicContext.HasPermission(ClinicPermissions.QueueCompleteNonDoctor));
    }

    /// <summary>
    /// Authorizes clinical screening progress saves and consultation escalations for nursing/midwifery staff.
    /// Explicitly requires <see cref="ClinicPermissions.TriageWrite"/> (never <see cref="ClinicPermissions.PatientsWrite"/> alone)
    /// so administrative staff such as Front Desk Receptionists or Cashiers are blocked.
    /// </summary>
    public static bool IsCallerAuthorizedClinicalNurseOrMidwife(IClinicContext clinicContext, StaffMember? staff)
    {
        if (!clinicContext.HasPermission(ClinicPermissions.TriageWrite))
        {
            return false;
        }

        if (staff != null &&
            staff.Role is StaffRole.Receptionist or StaffRole.Cashier &&
            !(staff.Title?.Contains("Midwife", StringComparison.OrdinalIgnoreCase) == true) &&
            !(staff.Specialty?.Contains("Midwife", StringComparison.OrdinalIgnoreCase) == true) &&
            !(staff.ClinicRole?.Name?.Contains("Midwife", StringComparison.OrdinalIgnoreCase) == true))
        {
            return false;
        }

        if (staff == null &&
            (string.Equals(clinicContext.StaffRole?.Trim(), "Receptionist", StringComparison.OrdinalIgnoreCase) ||
             string.Equals(clinicContext.StaffRole?.Trim(), "Front Desk Receptionist", StringComparison.OrdinalIgnoreCase) ||
             string.Equals(clinicContext.StaffRole?.Trim(), "Cashier", StringComparison.OrdinalIgnoreCase) ||
             string.Equals(clinicContext.StaffRole?.Trim(), "Clinic Cashier / Billing Officer", StringComparison.OrdinalIgnoreCase)))
        {
            return false;
        }

        return true;
    }

    public static async Task<ServiceItem?> ResolveScreeningServiceItemAsync(
        Guid? explicitServiceItemId,
        VisitWorkflowMode workflowMode,
        FacilitySettings? settings,
        IRepository<ServiceItem>? serviceItemRepo,
        Guid clinicId,
        CancellationToken ct)
    {
        if (serviceItemRepo == null)
        {
            return null;
        }

        if (explicitServiceItemId.HasValue && explicitServiceItemId.Value != Guid.Empty)
        {
            return await serviceItemRepo
                .Query(s => s.Id == explicitServiceItemId.Value && !s.IsDeleted && s.IsActive && s.ClinicId == clinicId)
                .AsNoTracking()
                .FirstOrDefaultAsync(ct);
        }

        if (workflowMode == VisitWorkflowMode.YakapAvailment)
        {
            return null;
        }

        if (settings?.DefaultHealthScreeningServiceItemId is Guid defaultItemId && defaultItemId != Guid.Empty)
        {
            var configuredItem = await serviceItemRepo
                .Query(s => s.Id == defaultItemId && !s.IsDeleted && s.IsActive && s.ClinicId == clinicId)
                .AsNoTracking()
                .FirstOrDefaultAsync(ct);

            if (configuredItem != null)
            {
                return configuredItem;
            }
        }

        var targetCode = !string.IsNullOrWhiteSpace(settings?.DefaultHealthScreeningServiceCode)
            ? settings.DefaultHealthScreeningServiceCode.Trim()
            : DefaultScreeningServiceCodeFallback;

        var upperCode = targetCode.ToUpperInvariant();
        return await serviceItemRepo
            .Query(s => !s.IsDeleted && s.IsActive && s.ClinicId == clinicId && s.Code.ToUpper() == upperCode)
            .AsNoTracking()
            .FirstOrDefaultAsync(ct);
    }

    public static string? ResolvePatientPin(Patient patient, PatientPhilHealthMembership? membership)
    {
        if (!string.IsNullOrWhiteSpace(patient.PhilHealthNumber))
        {
            return patient.PhilHealthNumber.Trim();
        }

        if (membership != null)
        {
            if (!string.IsNullOrWhiteSpace(membership.MemberPin))
                return membership.MemberPin.Trim();
            if (!string.IsNullOrWhiteSpace(membership.PrincipalMemberPin))
                return membership.PrincipalMemberPin.Trim();
        }

        return null;
    }

    public static YakapFpeReadinessDto EvaluateYakapReadiness(
        Patient patient,
        PatientPhilHealthMembership? membership,
        IReadOnlyList<PatientYakapEnlistment> enlistments,
        HealthScreening screening,
        PatientVitals? vitals,
        PatientPhysicalExam? physicalExam,
        NcdRiskAssessment? ncdAssessment,
        DateOnly referenceDate,
        PatientIdentityVerification? latestVerification = null,
        YakapSubmission? latestSubmission = null)
    {
        var missing = new List<string>();
        var warnings = new List<string>();

        var resolvedPin = ResolvePatientPin(patient, membership);
        bool hasValidPin = !string.IsNullOrWhiteSpace(resolvedPin) && PhilHealthPinNormalizer.IsValidPin(resolvedPin);
        if (!hasValidPin)
        {
            missing.Add("Enter a valid 12-digit PhilHealth number for the patient (or their sponsor).");
        }

        var nonDeletedEnlistments = enlistments.Where(e => !e.IsDeleted).ToList();
        var activeEnlistment = nonDeletedEnlistments.FirstOrDefault(e => e.IsActiveOn(referenceDate))
            ?? nonDeletedEnlistments.FirstOrDefault(e =>
                e.EffectiveYear == referenceDate.Year &&
                e.Status.IsUsableActiveStatus());

        bool hasActiveEnlistment = activeEnlistment != null;
        if (!hasActiveEnlistment)
        {
            missing.Add($"Assign this patient to your clinic for PhilHealth annual checkups covering {referenceDate:yyyy-MM-dd}.");
        }

        bool hasIdentityVerification = latestVerification != null && latestVerification.VerifiedAtUtc.HasValue;
        if (!hasIdentityVerification)
        {
            warnings.Add("Confirm patient identity (Face Scan, Text Code, or Photo ID) to enable immediate PhilHealth submission.");
        }

        bool hasAtcOrWalkIn = screening.IsWalkedIn || !string.IsNullOrWhiteSpace(screening.PhilHealthAtc);
        if (!hasAtcOrWalkIn)
        {
            missing.Add("Enter a PhilHealth Visit Code or mark the visit as Walk-In.");
        }

        bool hasVitals = vitals != null;
        if (!hasVitals)
        {
            missing.Add("Complete Step 1: Vitals & Measurements first.");
        }

        bool hasPhysicalExam = physicalExam != null;
        if (!hasPhysicalExam)
        {
            warnings.Add("Complete Step 3: Physical Exam before doctor sign-off.");
        }

        bool isAdult = false;
        if (patient.DateOfBirth is { } dob)
        {
            int ageYears = referenceDate.Year - dob.Year;
            if (dob > referenceDate.AddYears(-ageYears)) ageYears--;
            isAdult = ageYears >= 20;
        }
        bool hasNcdAssessment = !isAdult || ncdAssessment != null;
        if (isAdult && ncdAssessment == null)
        {
            warnings.Add("Heart & diabetes risk questions are recommended for adults aged 20 and older.");
        }

        var currentYearEntry = nonDeletedEnlistments.FirstOrDefault(e => e.EffectiveYear == referenceDate.Year);
        bool alreadyCompletedThisYear = currentYearEntry != null && (
            !string.IsNullOrWhiteSpace(currentYearEntry.ProfilingTransNo) ||
            currentYearEntry.ProfilingDate.HasValue ||
            currentYearEntry.Status is YakapEnlistmentStatus.ProfilingCompleted or YakapEnlistmentStatus.Transmitted);

        if (alreadyCompletedThisYear)
        {
            warnings.Add($"PhilHealth annual checkup already completed for {referenceDate.Year}.");
        }

        return new YakapFpeReadinessDto(
            IsReady: missing.Count == 0,
            HasValidPin: hasValidPin,
            HasActiveEnlistment: hasActiveEnlistment,
            HasAtcOrWalkIn: hasAtcOrWalkIn,
            HasVitals: hasVitals,
            HasPhysicalExam: hasPhysicalExam,
            HasNcdAssessment: hasNcdAssessment,
            AlreadyCompletedThisYear: alreadyCompletedThisYear,
            ExistingProfilingTransNo: currentYearEntry?.ProfilingTransNo,
            ExistingProfilingDate: currentYearEntry?.ProfilingDate,
            MissingRequirements: missing,
            Warnings: warnings,
            HasIdentityVerification: hasIdentityVerification,
            VerificationMode: latestVerification?.Mode.ToString(),
            SelectionStatus: currentYearEntry?.RegistrationStatusCode,
            YesReferenceNo: latestSubmission?.YesReferenceNo ?? currentYearEntry?.YesReferenceNo,
            SubmissionStatus: latestSubmission?.ProcessingStatus.ToString(),
            UploadTransactionNo: latestSubmission?.UploadTransactionNo);
    }

    public static string MapDeliveryMethodCode(YakapServiceDeliveryMethod method) => method switch
    {
        YakapServiceDeliveryMethod.FacilityBased => "1",
        YakapServiceDeliveryMethod.OutOfFacility => "2",
        YakapServiceDeliveryMethod.SettingsBased => "3",
        _ => "1"
    };

    public static HealthScreeningDto ToDto(
        HealthScreening hs,
        QueueItem? queueItem = null,
        ServiceItem? serviceItem = null) =>
        new(
            Id: hs.Id,
            PatientId: hs.PatientId,
            QueueItemId: hs.QueueItemId,
            ConsultationEncounterId: hs.ConsultationEncounterId,
            YakapEnlistmentId: hs.YakapEnlistmentId,
            PatientVitalsId: hs.PatientVitalsId,
            PatientPhysicalExamId: hs.PatientPhysicalExamId,
            NcdRiskAssessmentId: hs.NcdRiskAssessmentId,
            ServiceItemId: hs.ServiceItemId,
            ServiceItemCode: serviceItem?.Code,
            ServiceItemName: serviceItem?.Name,
            ServiceItemPrice: serviceItem?.StandardPrice,
            ScreeningType: hs.ScreeningType,
            WorkflowMode: hs.WorkflowMode,
            Status: hs.Status,
            Disposition: hs.Disposition,
            ScreeningDateUtc: hs.ScreeningDateUtc,
            ScreenedByNurseId: hs.ScreenedByNurseId,
            ScreenedByNurseName: hs.ScreenedByNurseName,
            NurseCompletedAtUtc: hs.NurseCompletedAtUtc,
            ExaminedByDoctorId: hs.ExaminedByDoctorId,
            ExaminedByDoctorName: hs.ExaminedByDoctorName,
            CompletedAtUtc: hs.CompletedAtUtc,
            NurseScreeningNotes: hs.NurseScreeningNotes,
            ClinicalImpression: hs.ClinicalImpression,
            PreventiveCounselingNotes: hs.PreventiveCounselingNotes,
            RecommendedFollowUpDate: hs.RecommendedFollowUpDate,
            PhilHealthAtc: hs.PhilHealthAtc,
            IsWalkedIn: hs.IsWalkedIn,
            ServiceDeliveryMethod: hs.ServiceDeliveryMethod,
            FpeClassificationType: hs.FpeClassificationType,
            ProfilingTransNo: hs.ProfilingTransNo,
            QueueNumber: queueItem?.QueueNumber,
            QueueStatus: queueItem?.Status,
            AdultsRoutineScreeningCode: hs.AdultsRoutineScreeningCode,
            PediatricRoutineScreeningCode: hs.PediatricRoutineScreeningCode,
            PrenatalScreeningServicesCode: hs.PrenatalScreeningServicesCode,
            BreastCancerScreeningCode: hs.BreastCancerScreeningCode,
            CervicalCancerScreeningCode: hs.CervicalCancerScreeningCode,
            ColorectalCancerScreeningCode: hs.ColorectalCancerScreeningCode,
            ProstateCancerScreeningCode: hs.ProstateCancerScreeningCode,
            PatientIdentityVerificationId: hs.PatientIdentityVerificationId,
            YakapSubmissionId: hs.YakapSubmissionId);

    public static HealthScreeningDetailDto ToDetailDto(
        HealthScreening hs,
        QueueItem? queueItem,
        ServiceItem? serviceItem,
        PatientVitals? vitals,
        PatientPhysicalExam? physicalExam,
        NcdRiskAssessment? ncdAssessment,
        IReadOnlyList<LabOrder> labOrders,
        YakapFpeReadinessDto? yakapReadiness,
        FacilitySettings? settings,
        YakapSubmission? submission = null) =>
        new(
            Id: hs.Id,
            PatientId: hs.PatientId,
            QueueItemId: hs.QueueItemId,
            ConsultationEncounterId: hs.ConsultationEncounterId,
            YakapEnlistmentId: hs.YakapEnlistmentId,
            PatientVitalsId: hs.PatientVitalsId,
            PatientPhysicalExamId: hs.PatientPhysicalExamId,
            NcdRiskAssessmentId: hs.NcdRiskAssessmentId,
            ServiceItemId: hs.ServiceItemId,
            ServiceItemCode: serviceItem?.Code,
            ServiceItemName: serviceItem?.Name,
            ServiceItemPrice: serviceItem?.StandardPrice,
            ScreeningType: hs.ScreeningType,
            WorkflowMode: hs.WorkflowMode,
            Status: hs.Status,
            Disposition: hs.Disposition,
            ScreeningDateUtc: hs.ScreeningDateUtc,
            ScreenedByNurseId: hs.ScreenedByNurseId,
            ScreenedByNurseName: hs.ScreenedByNurseName,
            NurseCompletedAtUtc: hs.NurseCompletedAtUtc,
            ExaminedByDoctorId: hs.ExaminedByDoctorId,
            ExaminedByDoctorName: hs.ExaminedByDoctorName,
            CompletedAtUtc: hs.CompletedAtUtc,
            NurseScreeningNotes: hs.NurseScreeningNotes,
            ClinicalImpression: hs.ClinicalImpression,
            PreventiveCounselingNotes: hs.PreventiveCounselingNotes,
            RecommendedFollowUpDate: hs.RecommendedFollowUpDate,
            PhilHealthAtc: hs.PhilHealthAtc,
            IsWalkedIn: hs.IsWalkedIn,
            ServiceDeliveryMethod: hs.ServiceDeliveryMethod,
            FpeClassificationType: hs.FpeClassificationType,
            ProfilingTransNo: hs.ProfilingTransNo,
            QueueNumber: queueItem?.QueueNumber,
            QueueStatus: queueItem?.Status,
            AdultsRoutineScreeningCode: hs.AdultsRoutineScreeningCode,
            PediatricRoutineScreeningCode: hs.PediatricRoutineScreeningCode,
            PrenatalScreeningServicesCode: hs.PrenatalScreeningServicesCode,
            BreastCancerScreeningCode: hs.BreastCancerScreeningCode,
            CervicalCancerScreeningCode: hs.CervicalCancerScreeningCode,
            ColorectalCancerScreeningCode: hs.ColorectalCancerScreeningCode,
            ProstateCancerScreeningCode: hs.ProstateCancerScreeningCode,
            Vitals: MapVitals(vitals, queueItem),
            PhysicalExam: MapPhysicalExam(physicalExam),
            NcdRiskAssessment: MapNcdAssessment(ncdAssessment),
            LabOrders: labOrders.Select(MapLabOrder).ToList(),
            YakapReadiness: yakapReadiness,
            RequiresPhysicianSignOff: RequiresPhysicianSignOff(hs.ScreeningType, hs.WorkflowMode, settings),
            AllowNurseMidwifeYakapFpeFacilitator: settings?.AllowNurseMidwifeYakapFpeFacilitator ?? false,
            PatientIdentityVerificationId: hs.PatientIdentityVerificationId,
            YakapSubmissionId: hs.YakapSubmissionId ?? submission?.Id,
            YakapSubmissionStatus: submission?.ProcessingStatus.ToString() ?? yakapReadiness?.SubmissionStatus,
            YakapUploadTransactionNo: submission?.UploadTransactionNo ?? yakapReadiness?.UploadTransactionNo,
            YesReferenceNo: submission?.YesReferenceNo ?? yakapReadiness?.YesReferenceNo);

    public static TriageVitalsDto? MapVitals(PatientVitals? v, QueueItem? queueItem = null)
    {
        if (v == null) return null;
        return new TriageVitalsDto(
            Id: v.Id,
            TenantId: v.TenantId,
            ClinicId: v.ClinicId,
            QueueItemId: v.QueueItemId,
            PatientId: v.PatientId,
            NurseId: v.NurseId,
            RecordedByNurseName: v.RecordedByNurseName,
            RecordedAt: v.RecordedAt,
            SystolicBp: v.SystolicBp,
            DiastolicBp: v.DiastolicBp,
            HeartRateBpm: v.HeartRateBpm,
            TemperatureCelsius: v.TemperatureCelsius,
            RespiratoryRateBreathsPerMin: v.RespiratoryRateBreathsPerMin,
            OxygenSaturationPercent: v.OxygenSaturationPercent,
            HeightCm: v.HeightCm,
            WeightKg: v.WeightKg,
            Bmi: v.Bmi,
            PainScore: v.PainScore,
            Notes: v.Notes,
            VisualAcuityLeft: v.VisualAcuityLeft,
            VisualAcuityRight: v.VisualAcuityRight,
            HeadCircumferenceCm: v.HeadCircumferenceCm,
            MidUpperArmCircumferenceCm: v.MidUpperArmCircumferenceCm,
            IsMeasuredRecumbent: v.IsMeasuredRecumbent,
            ZScoreWeightForAge: v.ZScoreWeightForAge,
            ZScoreLengthForAge: v.ZScoreLengthForAge,
            ZScoreWeightForLength: v.ZScoreWeightForLength,
            GrowthZScoreCategory: v.GrowthZScoreCategory,
            GrowthZScoreCode: v.GrowthZScoreCode,
            WaistCircumferenceCm: v.WaistCircumferenceCm,
            HipCircumferenceCm: v.HipCircumferenceCm,
            BodyLengthCm: v.BodyLengthCm,
            SkinfoldThicknessMm: v.SkinfoldThicknessMm,
            LimbsCircumferenceCm: v.LimbsCircumferenceCm,
            PreAssessmentNotes: v.PreAssessmentNotes,
            PreAssessmentRemarks: v.PreAssessmentRemarks,
            TriageAcuityReason: v.TriageAcuityReason,
            HomeInstructions: v.HomeInstructions,
            RosCategory: v.RosCategory?.ToString(),
            RosCategoryLabel: v.RosCategory.HasValue ? RosCategoryHelper.ToDisplayLabel(v.RosCategory.Value) : null,
            ChiefComplaint: queueItem?.ChiefComplaint);
    }

    public static PatientPhysicalExamProfileDto? MapPhysicalExam(PatientPhysicalExam? exam)
    {
        if (exam == null) return null;
        return new PatientPhysicalExamProfileDto(
            Id: exam.Id,
            PatientId: exam.PatientId,
            GenSurveyId: exam.GenSurveyId ?? (exam.GeneralSurveyStatus == GeneralSurveyStatus.Normal ? "1" : "2"),
            GenSurveyRemarks: exam.GeneralSurveyRemarks,
            SkinId: exam.SkinId ?? "1",
            SkinRemarks: exam.SkinRemarks,
            HeentId: exam.HeentId ?? "11",
            HeentRemarks: exam.HeentRemarks,
            ChestId: exam.ChestId ?? "6",
            ChestRemarks: exam.ChestLungsRemarks,
            HeartId: exam.HeartId ?? "5",
            HeartRemarks: exam.HeartRemarks,
            AbdomenId: exam.AbdomenId ?? "7",
            AbdomenRemarks: exam.AbdomenRemarks,
            NeuroId: exam.NeuroId ?? "6",
            NeuroRemarks: exam.NeurologicalRemarks,
            RectalId: exam.RectalId ?? "1",
            RectalRemarks: exam.DigitalRectalRemarks,
            GuId: exam.GuId ?? "1",
            GuRemarks: exam.GenitourinaryRemarks,
            CreatedAt: exam.CreatedAt,
            UpdatedAt: exam.UpdatedAt);
    }

    public static NcdRiskAssessmentDto? MapNcdAssessment(NcdRiskAssessment? entity)
    {
        if (entity == null) return null;
        return new NcdRiskAssessmentDto(
            entity.Id,
            entity.PatientId,
            entity.ConsultationEncounterId,
            entity.AssessmentDate,
            entity.AssessedByStaffId,
            entity.AssessedByStaffName,
            entity.EatsProcessedFoodWeekly,
            entity.ThreeServingsVegetablesDaily,
            entity.TwoToThreeServingsFruitDaily,
            entity.PhysicalActivityAtLeast150MinsWeekly,
            entity.DiagnosedDiabetes,
            entity.HasPolyphagia,
            entity.HasPolydipsia,
            entity.HasPolyuria,
            entity.DiabetesMedicationStatus,
            entity.HasRaisedBloodGlucose,
            entity.FastingBloodSugarMgDl,
            entity.FastingBloodSugarMmolL,
            entity.FastingBloodSugarDate,
            entity.HasChestPain,
            entity.PainInCenterOfChestOrLeftArm,
            entity.PainWhenWalkingUphill,
            entity.SlowsDownWhenPainOccurs,
            entity.PainRelievedWithin10Mins,
            entity.PainRelievedByNitrates,
            entity.SevereChestPainOver30Mins,
            entity.TransientNeurologicalDeficits,
            entity.HasRaisedBloodLipids,
            entity.TotalCholesterolMgDl,
            entity.TotalCholesterolDate,
            entity.HasHistoryAnginaHeartAttack,
            entity.HasHistoryStrokeOrTia,
            entity.UrineKetonesPresent,
            entity.UrineKetonesValue,
            entity.UrineKetonesDate,
            entity.UrineProteinPresent,
            entity.UrineProteinValue,
            entity.UrineProteinDate,
            entity.RiskBand,
            entity.CalculatedRiskScorePercent,
            entity.Remarks,
            entity.CreatedAt,
            entity.CreatedBy,
            entity.UpdatedAt,
            entity.UpdatedBy,
            entity.IsDeleted,
            entity.DeletedAt,
            entity.DeletedBy,
            entity.VoidReason);
    }

    public static ClinicLabOrderDto MapLabOrder(LabOrder order) =>
        new(
            Id: order.Id,
            TenantId: order.TenantId,
            ClinicId: order.ClinicId,
            OrderNumber: order.OrderNumber,
            PatientId: order.PatientId,
            PatientName: order.PatientName,
            ConsultationId: order.ConsultationId,
            OrderedByDoctorId: order.OrderedByDoctorId,
            OrderedByDoctorName: order.OrderedByDoctorName,
            OrderDate: order.OrderDate,
            Status: order.Status,
            ClinicalDiagnosis: order.ClinicalDiagnosis,
            Notes: order.Notes,
            Items: order.Items?.Select(i => new ClinicLabOrderItemDto(
                Id: i.Id,
                TestName: i.TestName,
                Category: i.Category,
                Instructions: i.Instructions,
                Status: i.Status,
                LoincCode: i.LoincCode,
                IsPhysicianRecommended: i.IsPhysicianRecommended,
                PatientComplianceCode: i.PatientComplianceCode,
                DiagnosticFee: i.DiagnosticFee,
                IsDoneOutsideFacility: i.IsDoneOutsideFacility)).ToList() ?? new List<ClinicLabOrderItemDto>(),
            PublicUploadUrl: null,
            ExternalLabName: order.ExternalLabName,
            ExternalReportUrl: order.ExternalReportUrl,
            UploadedBy: order.UploadedBy,
            PathologistImpression: order.PathologistImpression,
            VerifiedByPathologist: order.VerifiedByPathologist,
            PathologistPrcLicense: order.PathologistPrcLicense,
            ReportReleasedAt: order.ReportReleasedAt,
            HasCriticalPanicAlert: order.HasCriticalPanicAlert,
            PanicAlertTriggeredAt: order.PanicAlertTriggeredAt,
            PanicAcknowledgedAt: order.PanicAcknowledgedAt,
            PanicAcknowledgedBy: order.PanicAcknowledgedBy,
            Stage: order.Stage,
            StageReason: order.StageReason,
            QuotedAmount: order.QuotedAmount,
            QuotedCurrency: order.QuotedCurrency,
            PaymentRequired: order.PaymentRequired,
            LaboratoryName: order.LaboratoryName,
            ClaimToken: order.ClaimToken,
            QueueItemId: order.QueueItemId,
            IsSigned: order.IsSigned);
}
