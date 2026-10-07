using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Features.Yakap.DTOs;

public sealed record YakapEnlistmentDto(
    string HciCaseNo,
    string HciTransNo,
    string EffYear,
    string EnlistStat,
    string EnlistDate,
    string PackageType,
    string MemPin,
    string MemFname,
    string? MemMname,
    string MemLname,
    string? MemExtname,
    string MemDob,
    string PatientPin,
    string PatientFname,
    string? PatientMname,
    string PatientLname,
    string? PatientExtname,
    string PatientSex,
    string PatientDob,
    string PatientType,
    string? PatientMobileNo,
    string? PatientLandlineNo,
    string WithConsent,
    string TransDate,
    string CreatedBy,
    string ReportStatus = "U",
    string DeficiencyRemarks = "");

public sealed record YakapMedicalHistoryDto(string MdiseaseCode, string ReportStatus = "U", string DeficiencyRemarks = "");
public sealed record YakapSpecificHistoryDto(string MdiseaseCode, string SpecificDesc, string ReportStatus = "U", string DeficiencyRemarks = "");
public sealed record YakapSurgicalHistoryDto(string SurgDesc, string SurgDate, string ReportStatus = "U", string DeficiencyRemarks = "");

public sealed record YakapSocialHistoryDto(
    string IsSmoker,
    string? NoCigpk,
    string IsAdrinker,
    string? NoBottles,
    string IllDrugUser,
    string IsSexuallyActive,
    string ReportStatus = "U",
    string DeficiencyRemarks = "");

public sealed record YakapImmunizationDto(
    string? ChildImmcode,
    string? YoungwImmcode,
    string? PregwImmcode,
    string? ElderlyImmcode,
    string? OtherImm,
    string ReportStatus = "U",
    string DeficiencyRemarks = "");

public sealed record YakapMenstrualHistoryDto(
    string MenarchePeriod,
    string? LastMensPeriod,
    string PeriodDuration,
    string MensInterval,
    string PadsPerDay,
    string OnsetSexIc,
    string? BirthCtrlMethod,
    string? IsMenopause,
    string? MenopauseAge,
    string IsApplicable,
    string ReportStatus = "U",
    string DeficiencyRemarks = "");

public sealed record YakapPregnancyHistoryDto(
    string PregCnt,
    string DeliveryCnt,
    string DeliveryTyp,
    string FullTermCnt,
    string PrematureCnt,
    string AbortionCnt,
    string LivChildrenCnt,
    string WPregIndhyp,
    string WFamPlan,
    string IsApplicable,
    string ReportStatus = "U",
    string DeficiencyRemarks = "");

public sealed record YakapPhysicalExamPertinentDto(
    string Systolic,
    string Diastolic,
    string Hr,
    string Rr,
    string Temp,
    string Height,
    string Weight,
    string BMI,
    string? ZScore = "",
    string? LeftVision = "",
    string? RightVision = "",
    string? Length = "",
    string? HeadCirc = "",
    string? SkinfoldThickness = "",
    string? Waist = "",
    string? Hip = "",
    string? Limbs = "",
    string? MidUpperArmCirc = "",
    string ReportStatus = "U",
    string DeficiencyRemarks = "");

public sealed record YakapPhysicalExamMiscDto(
    string? SkinId,
    string? HeentId,
    string? ChestId,
    string? HeartId,
    string? AbdomenId,
    string? NeuroId,
    string? RectalId,
    string? GuId,
    string ReportStatus = "U",
    string DeficiencyRemarks = "");

public sealed record YakapPhysicalExamSpecificDto(
    string? SkinRem,
    string? HeentRem,
    string? ChestRem,
    string? HeartRem,
    string? AbdomenRem,
    string? NeuroRem,
    string? RectalRem,
    string? GuRem,
    string ReportStatus = "U",
    string DeficiencyRemarks = "");

public sealed record YakapNcdAnswersDto(
    string? Qid1Yn = "",
    string? Qid2Yn = "",
    string? Qid3Yn = "",
    string? Qid4Yn = "",
    string? Qid5Ynx = "",
    string? Qid6Yn = "",
    string? Qid7Yn = "",
    string? Qid8Yn = "",
    string? Qid9Yn = "",
    string? Qid10Yn = "",
    string? Qid11Yn = "",
    string? Qid12Yn = "",
    string? Qid13Yn = "",
    string? Qid14Yn = "",
    string? Qid15Yn = "",
    string? Qid16Yn = "",
    string? Qid17Abcde = "",
    string? Qid18Yn = "",
    string? Qid19Yn = "",
    string? Qid19Fbsmg = "",
    string? Qid19Fbsmmol = "",
    string? Qid19Fbsdate = "",
    string? Qid20Yn = "",
    string? Qid20Choleval = "",
    string? Qid20Choledate = "",
    string? Qid21Yn = "",
    string? Qid21Ketonval = "",
    string? Qid21Ketondate = "",
    string? Qid22Yn = "",
    string? Qid22Proteinval = "",
    string? Qid22Proteindate = "",
    string? Qid23Yn = "",
    string? Qid24Yn = "",
    string ReportStatus = "U",
    string DeficiencyRemarks = "");

public sealed record YakapProfileDto(
    string HciTransNo,
    string HciCaseNo,
    string ProfDate,
    string PatientPin,
    string PatientType,
    string PatientAge,
    string MemPin,
    string EffYear,
    string ATC,
    string IsWalkedIn,
    string TransDate,
    IReadOnlyList<YakapMedicalHistoryDto> MedicalHistories,
    IReadOnlyList<YakapSpecificHistoryDto> MedicalSpecifics,
    IReadOnlyList<YakapSurgicalHistoryDto> SurgicalHistories,
    IReadOnlyList<YakapMedicalHistoryDto> FamilyHistories,
    IReadOnlyList<YakapSpecificHistoryDto> FamilySpecifics,
    YakapSocialHistoryDto SocialHistory,
    IReadOnlyList<YakapImmunizationDto> Immunizations,
    YakapMenstrualHistoryDto MenstrualHistory,
    YakapPregnancyHistoryDto PregnancyHistory,
    YakapPhysicalExamPertinentDto PhysicalExam,
    string BloodType,
    string GenSurveyId,
    string? GenSurveyRem,
    IReadOnlyList<YakapPhysicalExamMiscDto> PhysicalExamMiscs,
    YakapPhysicalExamSpecificDto PhysicalExamSpecifics,
    YakapNcdAnswersDto NcdAnswers,
    string ReportStatus = "U",
    string DeficiencyRemarks = "");

public sealed record YakapDiagnosticOrderDto(
    string DiagnosticId,
    string? OthRemarks,
    string IsPhysicianRecommendation,
    string PatientRemarks,
    string ReportStatus = "U",
    string DeficiencyRemarks = "");

public sealed record YakapManagementDto(
    string ManagementId,
    string? OthRemarks,
    string ReportStatus = "U",
    string DeficiencyRemarks = "");

public sealed record YakapSoapDto(
    string HciCaseNo,
    string HciTransNo,
    string SoapDate,
    string PatientPin,
    string PatientType,
    string MemPin,
    string EffYear,
    string ATC,
    string IsWalkedIn,
    string CoPay,
    string TransDate,
    string IllnessHistory,
    string SignsSymptoms,
    string? OtherComplaint,
    string? PainSite,
    YakapPhysicalExamPertinentDto PhysicalExam,
    IReadOnlyList<YakapPhysicalExamMiscDto> PhysicalExamMiscs,
    YakapPhysicalExamSpecificDto PhysicalExamSpecifics,
    IReadOnlyList<string> IcdCodes,
    IReadOnlyList<YakapDiagnosticOrderDto> Diagnostics,
    IReadOnlyList<YakapManagementDto> Managements,
    string AdviceRemarks,
    string ReportStatus = "U",
    string DeficiencyRemarks = "");

public sealed record YakapFbsResultDto(
    string ReferralFacility,
    string LabDate,
    string GlucoseMg,
    string GlucoseMmol,
    string DateAdded,
    string Status = "D",
    string DiagnosticLabFee = "0.00",
    string ReportStatus = "U",
    string DeficiencyRemarks = "");

public sealed record YakapRbsResultDto(
    string ReferralFacility,
    string LabDate,
    string GlucoseMg,
    string GlucoseMmol,
    string DateAdded,
    string Status = "D",
    string DiagnosticLabFee = "0.00",
    string ReportStatus = "U",
    string DeficiencyRemarks = "");

public sealed record YakapCbcResultDto(
    string ReferralFacility,
    string LabDate,
    string Hematocrit,
    string HemoglobinG,
    string HemoglobinMmol,
    string MhcPg,
    string MhcFmol,
    string MchcGhb,
    string MchcMmol,
    string McvUm,
    string McvFl,
    string Wbc1000,
    string Wbc10,
    string Myelocyte,
    string NeutrophilsBnd,
    string NeutrophilsSeg,
    string Lymphocytes,
    string Monocytes,
    string Eosinophils,
    string Basophils,
    string Platelet,
    string DateAdded,
    string Status = "D",
    string DiagnosticLabFee = "0.00",
    string ReportStatus = "U",
    string DeficiencyRemarks = "");

public sealed record YakapUrinalysisResultDto(
    string ReferralFacility,
    string LabDate,
    string Gravity,
    string Appearance,
    string Color,
    string Glucose,
    string Proteins,
    string Ketones,
    string Ph,
    string RbCells,
    string WbCells,
    string Bacteria,
    string Crystals,
    string BladderCell,
    string SquamousCell,
    string TubularCell,
    string BroadCasts,
    string EpithelialCast,
    string GranularCast,
    string HyalineCast,
    string RbcCast,
    string WaxyCast,
    string WcCast,
    string Albumin,
    string PusCells,
    string DateAdded,
    string Status = "D",
    string DiagnosticLabFee = "0.00",
    string ReportStatus = "U",
    string DeficiencyRemarks = "");

public sealed record YakapChestXrayResultDto(
    string ReferralFacility,
    string LabDate,
    string Findings,
    string? RemarksFindings,
    string Observation,
    string? RemarksObservation,
    string DateAdded,
    string Status = "D",
    string DiagnosticLabFee = "0.00",
    string ReportStatus = "U",
    string DeficiencyRemarks = "");

public sealed record YakapDiagnosticResultDto(
    string HciCaseNo,
    string HciTransNo,
    string PatientPin,
    string PatientType,
    string MemPin,
    string EffYear,
    IReadOnlyList<YakapFbsResultDto>? FbsResults = null,
    IReadOnlyList<YakapRbsResultDto>? RbsResults = null,
    IReadOnlyList<YakapCbcResultDto>? CbcResults = null,
    IReadOnlyList<YakapUrinalysisResultDto>? UrinalysisResults = null,
    IReadOnlyList<YakapChestXrayResultDto>? ChestXrayResults = null);

public sealed record YakapMedicineDto(
    string HciCaseNo,
    string HciTransNo,
    string Category,
    string DrugCode,
    string GenericCode,
    string SaltCode,
    string StrengthCode,
    string FormCode,
    string UnitCode,
    string PackageCode,
    string? OtherMedicine,
    string? OthMedDrugGrouping,
    string Route,
    string Quantity,
    string ActualUnitPrice,
    string TotalAmtPrice,
    string InstructionQuantity,
    string InstructionStrength,
    string InstructionFrequency,
    string PrescribingPhysician,
    string IsDispensed,
    string? DateDispensed,
    string? DispensingPersonnel,
    string IsApplicable,
    string DateAdded,
    string ReportStatus = "U",
    string DeficiencyRemarks = "");

public sealed record YakapReportDocumentDto(
    string Username,
    string Password,
    string HciAccreNo,
    string PmccNo,
    string CertificationId,
    string HciTransmittalNumber,
    IReadOnlyList<YakapEnlistmentDto> Enlistments,
    IReadOnlyList<YakapProfileDto> Profiles,
    IReadOnlyList<YakapSoapDto> Soaps,
    IReadOnlyList<YakapDiagnosticResultDto> DiagnosticResults,
    IReadOnlyList<YakapMedicineDto> Medicines);

public sealed record GenerateAndValidateReportProxyRequest
{
    public required YakapReportDocumentDto Document { get; init; }
    public required string ReportTagging { get; init; }
}

public sealed record YakapValidationProxyResponse(
    bool IsValid,
    string? TransmittalNumber,
    string? RawXml,
    string? EncryptedPayload,
    string? PhilHealthSoapResponse,
    IReadOnlyList<string>? ValidationErrors);

public sealed record GenerateAndSubmitReportProxyRequest
{
    public required YakapReportDocumentDto Document { get; init; }
    public required string ReportTagging { get; init; }
}

public sealed record YakapSubmissionProxyResponse(
    bool IsSuccess,
    string TransmittalNumber,
    string? TransactionNumber,
    string? RawXml,
    string? PhilHealthSoapResponse,
    IReadOnlyList<string>? ValidationErrors);

public sealed record ExtractMasterlistProxyRequest
{
    public required string AccreditationNumber { get; init; }
    public required string Password { get; init; }
    public required string SoftwareCertificationId { get; init; }
    public required string CipherKey { get; init; }
    public required string EffectiveYear { get; init; }
}

public sealed record YakapBeneficiaryDto(
    string PhilHealthIdentificationNumber,
    string MemberPhilHealthIdentificationNumber,
    string LastName,
    string FirstName,
    string? MiddleName,
    string? ExtensionName,
    string DateOfBirth,
    string Sex,
    string MemberType,
    string EffectivityYear,
    string RegistrationDate,
    string PackageType);

public sealed record YakapMasterlistProxyResponse(
    bool IsSuccess,
    string? AccreditationNumber,
    string? EffectiveYear,
    int TotalCount,
    IReadOnlyList<YakapBeneficiaryDto> Beneficiaries,
    string? RawXml,
    string? ErrorMessage);

public sealed record ConfigurePhilHealthCredentialsProxyRequest(
    System.Guid TenantId,
    string FacilityName,
    string AccreditationNumber,
    string PmccNumber,
    string SoftwareCertificateId,
    string Username,
    string Password,
    string CipherKey,
    string? KonsultaEndpoint = null);

public sealed record PhilHealthConfigStatusResponse(
    System.Guid TenantId,
    string FacilityName,
    string AccreditationNumber,
    string PmccNumber,
    string SoftwareCertificateId,
    string KonsultaEndpoint,
    bool IsConfigured,
    bool IsActive,
    System.DateTimeOffset? UpdatedAt);

public sealed record ConfigureClinicPhilHealthCredentialsRequest(
    string FacilityName,
    string AccreditationNumber,
    string PmccNumber,
    string SoftwareCertificateId,
    string Username,
    string Password,
    string CipherKey,
    string? KonsultaEndpoint = null);

public sealed record PhilHealthConditionEntryDto(
    string Code,
    string? SpecificDesc = null);

public sealed record PhilHealthSurgicalEntryDto(
    string ProcedureDesc,
    string? ProcedureDate = null);

public sealed record PhilHealthPatientProfileDto
{
    public string? Pin { get; init; }
    public string? MemberPin { get; init; }
    public string? MemberType { get; init; } = "MM"; // MM = Member, DD = Dependent
    public string? MemberLastName { get; init; }
    public string? MemberFirstName { get; init; }
    public string? MemberMiddleName { get; init; }
    public string? MemberSuffix { get; init; }
    public string? MemberBirthDate { get; init; } // yyyy-MM-dd
    public string? DependentRelationship { get; init; } // "S" (Spouse), "C" (Child), "P" (Parent), "D" (Disabled)
    public string? Atc { get; init; } = "A";
    public string? IsWalkedIn { get; init; } = "Y";
    public string? BloodType { get; init; }

    // Medical & Surgical Histories
    public List<PhilHealthConditionEntryDto> MedicalHistories { get; init; } = [];
    public List<PhilHealthSurgicalEntryDto> SurgicalHistories { get; init; } = [];
    public List<PhilHealthConditionEntryDto> FamilyHistories { get; init; } = [];

    // Social History
    public bool IsSmoker { get; init; }
    public string? CigarettesPerDay { get; init; }
    public bool IsAlcoholDrinker { get; init; }
    public string? BottlesPerDay { get; init; }
    public bool IllDrugUser { get; init; }
    public bool IsSexuallyActive { get; init; }

    // Immunizations
    public List<string> ChildImmunizations { get; init; } = [];
    public List<string> YoungWomanImmunizations { get; init; } = [];
    public List<string> PregnantWomanImmunizations { get; init; } = [];
    public List<string> ElderlyImmunizations { get; init; } = [];
    public List<string> OtherImmunizations { get; init; } = [];

    // Menstrual History (Female >= 9)
    public bool MenstrualApplicable { get; init; }
    public string? MenarcheAge { get; init; }
    public string? LastMensPeriod { get; init; }
    public string? PeriodDurationDays { get; init; }
    public string? CycleIntervalDays { get; init; }
    public string? PadsPerDay { get; init; }
    public string? CoitarcheAge { get; init; }
    public string? BirthControlMethod { get; init; }
    public bool IsMenopause { get; init; }
    public string? MenopauseAge { get; init; }

    // Obstetric History (Female)
    public bool PregnancyApplicable { get; init; }
    public int Gravida { get; init; }
    public int Para { get; init; }
    public string? DeliveryType { get; init; } // V = Vaginal, C = Cesarean, X = N/A
    public int FullTermCount { get; init; }
    public int PrematureCount { get; init; }
    public int AbortionCount { get; init; }
    public int LivingChildrenCount { get; init; }
    public bool PreEclampsiaHypertension { get; init; }
    public bool FamilyPlanningCounseling { get; init; }

    // Physical Examination Pertinents
    public string? Systolic { get; init; }
    public string? Diastolic { get; init; }
    public string? HeartRate { get; init; }
    public string? RespiratoryRate { get; init; }
    public string? Temperature { get; init; }
    public string? HeightCm { get; init; }
    public string? WeightKg { get; init; }
    public string? Bmi { get; init; }
    public string? WaistCm { get; init; }
    public string? HipCm { get; init; }
    public string? LengthCm { get; init; }
    public string? HeadCircCm { get; init; }
    public string? SkinfoldThicknessMm { get; init; }
    public string? MuacCm { get; init; }
    public string? ZScore { get; init; }
    public string? VisualAcuityLeft { get; init; }
    public string? VisualAcuityRight { get; init; }

    // Organ Systems (1 = Normal, 2 = Abnormal)
    public string SkinId { get; init; } = "1";
    public string? SkinRemarks { get; init; }
    public string HeentId { get; init; } = "1";
    public string? HeentRemarks { get; init; }
    public string ChestId { get; init; } = "1";
    public string? ChestRemarks { get; init; }
    public string HeartId { get; init; } = "1";
    public string? HeartRemarks { get; init; }
    public string AbdomenId { get; init; } = "1";
    public string? AbdomenRemarks { get; init; }
    public string NeuroId { get; init; } = "1";
    public string? NeuroRemarks { get; init; }
    public string RectalId { get; init; } = "1";
    public string? RectalRemarks { get; init; }
    public string GuId { get; init; } = "1";
    public string? GuRemarks { get; init; }

    // General Survey
    public string GenSurveyId { get; init; } = "1";
    public string? GenSurveyRemarks { get; init; }

    // PhilPEN 24 Questions
    public YakapNcdAnswersDto NcdAnswers { get; init; } = new();

    public System.DateTimeOffset? LastUpdatedAt { get; init; }
    public string? UpdatedBy { get; init; }
}

