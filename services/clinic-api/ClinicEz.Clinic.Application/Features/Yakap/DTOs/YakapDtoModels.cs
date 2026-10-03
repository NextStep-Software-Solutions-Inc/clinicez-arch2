using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Features.Yakap.DTOs;

public sealed record YakapCatalogItemDto(string Code, string Description, string? Category = null);

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
