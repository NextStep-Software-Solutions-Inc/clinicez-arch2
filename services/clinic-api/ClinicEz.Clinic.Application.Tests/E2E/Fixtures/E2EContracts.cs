using System;
using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Tests.E2E.Fixtures;

/// <summary>
/// Domain contracts, DTOs, and representations for the 27 Clinic EZ comprehensive features
/// as defined in PROJECT.md and docs/plans/comprehensive-clinic-features-plan.md.
/// </summary>
public static class E2EContracts
{
    // ==========================================
    // Milestone M1: Features 1-6 (Scheduling)
    // ==========================================
    public enum SlotInterval
    {
        Minutes15 = 15,
        Minutes30 = 30,
        Minutes60 = 60
    }

    public record DoctorScheduleTemplateDto(
        Guid Id,
        Guid ClinicId,
        Guid DoctorId,
        DayOfWeek DayOfWeek,
        TimeOnly StartTime,
        TimeOnly EndTime,
        SlotInterval SlotDuration,
        bool IsActive,
        List<DoctorShiftBreakDto> Breaks);

    public record DoctorShiftBreakDto(
        Guid Id,
        Guid TemplateId,
        TimeOnly StartTime,
        TimeOnly EndTime,
        string Description);

    public record DoctorLeaveDto(
        Guid Id,
        Guid ClinicId,
        Guid DoctorId,
        DateTime StartUtc,
        DateTime EndUtc,
        string Reason,
        bool IsApproved);

    public record TimeSlotDto(
        DateTime StartUtc,
        DateTime EndUtc,
        bool IsAvailable,
        string? ConflictReason);

    public record BookAppointmentRequest(
        Guid ClinicId,
        Guid DoctorId,
        Guid PatientId,
        DateTime ScheduledAtUtc,
        int DurationMinutes);

    public record AppointmentRange(
        Guid AppointmentId,
        Guid ClinicId,
        Guid DoctorId,
        DateTime StartUtc,
        DateTime EndUtc,
        string Status);

    // ==========================================
    // Milestone M2: Features 7-13 (Profiling & Vitals)
    // ==========================================
    public record PatientSurgicalHistoryDto(
        Guid Id,
        Guid ClinicId,
        Guid PatientId,
        string ProcedureDescription,
        DateOnly ProcedureDate,
        string? HospitalFacility,
        string? Notes);

    public record PatientSocialHistoryDto(
        Guid Id,
        Guid ClinicId,
        Guid PatientId,
        bool IsSmoker,
        int? CigarettesPacksPerDay,
        bool IsAlcoholDrinker,
        int? BottlesPerDay,
        bool IsIllicitDrugUser,
        bool IsSexuallyActive,
        string? Notes);

    public record PatientReproductiveHistoryDto(
        Guid Id,
        Guid ClinicId,
        Guid PatientId,
        int? MenarcheAge,
        DateOnly? LastMenstrualPeriod,
        int? PeriodDurationDays,
        int? MenstrualIntervalDays,
        int? PadsPerDay,
        int? Gravida,
        int? Para,
        int? FullTermBirths,
        int? PrematureBirths,
        int? Abortions,
        int? LivingChildren,
        bool IsMenopausal,
        int? MenopauseAge,
        bool IsApplicable);

    public record ExtendedTriageVitalsDto(
        Guid Id,
        Guid ClinicId,
        Guid PatientId,
        DateTime RecordedAtUtc,
        int? SystolicBp,
        int? DiastolicBp,
        int? HeartRateBpm,
        decimal? TemperatureCelsius,
        int? RespiratoryRateBreathsPerMin,
        decimal? OxygenSaturationPercent,
        decimal? HeightCm,
        decimal? WeightKg,
        decimal? Bmi,
        int? PainScore,
        string? VisualAcuityLeft,
        string? VisualAcuityRight,
        decimal? HeadCircumferenceCm,
        decimal? MidUpperArmCircumferenceCm,
        string? Notes);

    public enum ZScoreCategory
    {
        SeverelyStunted,
        Stunted,
        Normal,
        Tall,
        SeverelyWasted,
        Wasted,
        RiskOfOverweight,
        Overweight,
        Obese
    }

    public record WhoZScoreEvaluation(
        int AgeMonths,
        string Gender, // "Male" or "Female"
        decimal LengthHeightCm,
        decimal WeightKg,
        decimal? WeightForAgeZScore,
        decimal? HeightForAgeZScore,
        decimal? WeightForHeightZScore,
        ZScoreCategory HeightCategory,
        ZScoreCategory WeightCategory,
        bool IsUnderFiveCohort);

    // ==========================================
    // Milestone M3: Features 14-17 (Consultations & PE)
    // ==========================================
    public enum EncounterType
    {
        PrivateCash,
        HmoInsurance,
        PhilHealthKonsulta
    }

    public record NineSystemPhysicalExamDto(
        bool AllEssentiallyNormal,
        string? SkinRemarks,
        string? HeentRemarks,
        string? ChestLungsRemarks,
        string? HeartCvsRemarks,
        string? AbdomenRemarks,
        string? NeuroRemarks,
        string? RectalRemarks,
        string? GenitourinaryRemarks,
        string? MusculoskeletalRemarks);

    public record DualModeConsultationDto(
        Guid Id,
        Guid ClinicId,
        Guid PatientId,
        Guid DoctorId,
        EncounterType Type,
        bool IsYakapEligible,
        string Subjective,
        string Objective,
        string Assessment,
        string Plan,
        string? DoctorPhilHealthPan,
        string? PhilHealthAtc,
        string? HciCaseNo,
        string? HciTransNo,
        string? SoapTransNo,
        NineSystemPhysicalExamDto PhysicalExam,
        bool IsSigned,
        DateTime? SignedAtUtc);

    // ==========================================
    // Milestone M4: Features 18-21 (Immunizations)
    // ==========================================
    public record PatientImmunizationDto(
        Guid Id,
        Guid ClinicId,
        Guid PatientId,
        string VaccineCode,
        string VaccineName,
        string StatutoryLibrary, // lib_immchild, lib_immyoungw, lib_immpregw, lib_immelderly, OtherImm
        string LotBatchNumber,
        DateOnly ExpirationDate,
        int DoseSequenceNumber,
        string InjectionSite,
        string InjectionRoute,
        DateOnly AdministeredDate,
        Guid AdministeredByStaffId,
        string? AdverseReactionNotes,
        bool IsHistoricalRecord);

    public record ImmunizationOutboxEnvelope(
        Guid MessageId,
        string Topic, // "clinical.immunization.administered"
        Guid PatientId,
        Guid ClinicId,
        string VaccineCode,
        string VaccineName,
        string LotNumber,
        int DoseNumber,
        DateTime AdministeredAtUtc,
        Guid AdministeredByStaffId,
        DateTime QueuedAtUtc);

    // ==========================================
    // Milestone M5: Features 22-25 (Problems, Allergies, CDS, PhilPEN)
    // ==========================================
    public enum ProblemStatus
    {
        Active,
        Resolved,
        InRemission
    }

    public record PatientProblemDto(
        Guid Id,
        Guid ClinicId,
        Guid PatientId,
        string Icd10Code,
        string DiagnosisDescription,
        DateOnly OnsetDate,
        ProblemStatus Status,
        DateOnly? ResolvedDate,
        string? PhilHealthDiseaseCode);

    public enum AllergyClassification
    {
        Drug,
        Food,
        Environmental
    }

    public enum AllergySeverity
    {
        Mild,
        Moderate,
        Severe,
        LifeThreateningAnaphylaxis
    }

    public record PatientAllergyDto(
        Guid Id,
        Guid ClinicId,
        Guid PatientId,
        AllergyClassification Classification,
        string Allergen,
        string ReactionManifestation,
        AllergySeverity Severity,
        bool IsAnaphylacticRisk);

    public enum CvdRiskBand
    {
        BandA_LessThan10Percent,
        BandB_10ToUnder20Percent,
        BandC_20ToUnder30Percent,
        BandD_30ToUnder40Percent,
        BandE_40PercentOrGreater
    }

    public record PhilPenSurveyAnswersDto(
        Guid Id,
        Guid ClinicId,
        Guid PatientId,
        int AgeYears,
        string Gender,
        bool IsSmoker,
        int SystolicBp,
        bool HasDiabetes,
        decimal? FastingBloodSugarMgDl,
        decimal? TotalCholesterolMgDl,
        decimal? BodyMassIndex,
        bool HasAnginaOrPreviousStroke,
        bool RenalDiseasePresent);

    public record PhilPenRiskResultDto(
        CvdRiskBand RiskBand,
        decimal CalculatedScorePercent,
        bool UsedBmiFallback,
        bool CrisisOverrideApplied,
        string ManagementRecommendation);

    // ==========================================
    // Milestone M6: Features 26-27 (Transmittal & DTD)
    // ==========================================
    public record YakapRelationalTransmittalDto(
        Guid TransmittalId,
        string TransmittalNumber,
        string EffectiveYear,
        string HciAccreditationNumber,
        List<DualModeConsultationDto> Consultations,
        List<PatientImmunizationDto> Immunizations,
        List<PatientProblemDto> Problems,
        List<PatientAllergyDto> Allergies,
        List<PhilPenRiskResultDto> NcdRiskAssessments,
        List<ExtendedTriageVitalsDto> TriageVitals);
}
