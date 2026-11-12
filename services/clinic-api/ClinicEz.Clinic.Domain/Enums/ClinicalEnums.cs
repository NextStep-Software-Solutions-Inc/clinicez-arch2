namespace ClinicEz.Clinic.Domain.Enums;

public enum CivilStatus
{
    Single,
    Married,
    Widowed,
    Separated,
    Divorced,
    Annulled,
    Cohabiting,
    CommonLaw,
    Other
}

public enum BloodType
{
    APositive,
    ANegative,
    BPositive,
    BNegative,
    ABPositive,
    ABNegative,
    OPositive,
    ONegative,
    Unknown
}

public static class BloodTypeParser
{
    public static bool TryParse(string? value, out BloodType result)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            result = default;
            return false;
        }

        var trimmed = value.Trim();

        if (!char.IsDigit(trimmed[0]) && Enum.TryParse<BloodType>(trimmed, true, out result) && Enum.IsDefined(result))
        {
            return true;
        }

        var normalized = trimmed.Replace("_", " ").Trim().ToUpperInvariant();

        switch (normalized)
        {
            case "A+":
            case "A POSITIVE":
                result = BloodType.APositive;
                return true;
            case "A-":
            case "A NEGATIVE":
                result = BloodType.ANegative;
                return true;
            case "B+":
            case "B POSITIVE":
                result = BloodType.BPositive;
                return true;
            case "B-":
            case "B NEGATIVE":
                result = BloodType.BNegative;
                return true;
            case "AB+":
            case "AB POSITIVE":
                result = BloodType.ABPositive;
                return true;
            case "AB-":
            case "AB NEGATIVE":
                result = BloodType.ABNegative;
                return true;
            case "O+":
            case "O POSITIVE":
                result = BloodType.OPositive;
                return true;
            case "O-":
            case "O NEGATIVE":
                result = BloodType.ONegative;
                return true;
            case "UNKNOWN":
                result = BloodType.Unknown;
                return true;
            default:
                result = default;
                return false;
        }
    }

    public static BloodType? ParseOrNull(string? value)
    {
        return TryParse(value, out var result) ? result : null;
    }

    public static string? Format(BloodType? bloodType) => bloodType switch
    {
        BloodType.APositive => "A+",
        BloodType.ANegative => "A-",
        BloodType.BPositive => "B+",
        BloodType.BNegative => "B-",
        BloodType.ABPositive => "AB+",
        BloodType.ABNegative => "AB-",
        BloodType.OPositive => "O+",
        BloodType.ONegative => "O-",
        BloodType.Unknown => "Unknown",
        null => null,
        _ => bloodType.ToString()
    };
}

public enum PatientVerificationStatus
{
    Verified,
    PendingVerification,
    Unverified,
    Rejected,
    None
}

public enum PhilHealthMemberType
{
    MM,
    DD
}

public enum PhilHealthDependentRelationship
{
    S,
    C,
    P,
    Spouse = S,
    Child = C,
    Parent = P
}

public enum PhilHealthDeliveryType
{
    Vaginal,
    Cesarean,
    NormalSpontaneous = Vaginal,
    CesareanSection = Cesarean,
    AssistedBreech,
    VacuumExtraction,
    ForcepsDelivery,
    NotApplicable
}

public enum MedicalHistoryCategory
{
    ProblemListItem,
    MedicalHistory
}

public enum ConditionVerificationStatus
{
    Confirmed,
    Provisional,
    Differential,
    Refuted,
    EnteredInError
}

public enum ProblemStatus
{
    Active,
    Resolved,
    Inactive,
    Relapsed,
    Remission
}

public enum ProblemSeverity
{
    Mild,
    Moderate,
    Severe,
    LifeThreatening
}

public enum FamilyRelationship
{
    Mother,
    Father,
    Brother,
    Sister,
    Sibling,
    Child,
    Grandparent,
    Grandmother,
    Grandfather,
    Son,
    Daughter,
    UncleAunt,
    Uncle,
    Aunt,
    Cousin,
    Other
}

public enum SmokingStatus
{
    Never,
    Current,
    Former,
    NeverSmoked = Never,
    CurrentSmoker = Current,
    FormerSmoker = Former,
    OccasionalSmoker
}

public enum AlcoholStatus
{
    Never,
    Current,
    Former,
    NonDrinker = Never,
    OccasionalDrinker,
    ModerateDrinker,
    HeavyDrinker,
    FormerDrinker = Former
}

public enum GeneralSurveyStatus
{
    Normal,
    Abnormal,
    AlteredMentalStatus,
    AcuteDistress,
    Lethargic,
    Cachectic,
    ToxicLooking,
    Unconscious,
    Other
}

public enum PhysicalExamSystem
{
    GeneralSurvey,
    Skin,
    Heent,
    Chest,
    Heart,
    Abdomen,
    Genitourinary,
    Rectal,
    Neurological,
    Musculoskeletal,
    Psychiatric,
    Lymphatic,
    SkinExtremities = Skin,
    Neuro = Neurological,
    Gu = Genitourinary,
    ClinicalBreastExam = 14
}

public enum YakapEnlistmentStatus
{
    Active,
    Expired,
    Transferred,
    Draft,
    Registered,
    Verified,
    ProfilingCompleted,
    Transmitted,
    Suspended,
    Cancelled
}

public enum YakapEnlistmentSource
{
    ClinicEnlistment,
    PhilHealthMasterlist,
    SelfReported,
    WalkIn,
    OnlinePortal,
    MasterlistSync,
    AssistedIntake
}

public enum YakapPackageType
{
    Konsulta,
    YakapPlus,
    FirstPatientEncounter,
    FollowUpEncounter,
    AnnualCheckup,
    NcdHypertension,
    NcdDiabetes,
    Comprehensive
}

public enum YakapReportStatus
{
    U,
    V,
    F
}

public enum PatientAlertCategory
{
    ClinicalSafety,
    ClinicalUrgency,
    SafetyAlert,
    Behavioral,
    Administrative,
    Security,
    FallRisk,
    InfectionControl,
    BleedingRisk,
    Other
}

public enum PatientAlertSeverity
{
    Info,
    Low,
    Medium,
    Warning,
    High,
    Critical,
    Emergency
}

public enum PatientAlertStatus
{
    Active,
    Resolved,
    Acknowledged,
    Expired,
    Dismissed
}
