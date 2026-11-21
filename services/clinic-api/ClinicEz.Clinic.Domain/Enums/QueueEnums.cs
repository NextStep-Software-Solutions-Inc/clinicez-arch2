namespace ClinicEz.Clinic.Domain.Enums;

public enum VisitType
{
    RoutineCheckup = 1,
    AcuteIllnessConsultation = 2,
    ChronicDiseaseFollowUp = 3,
    PreventiveHealthAssessment = 4,
    UrgentCareVisit = 5,

    // Legacy visit types preserved for backwards compatibility and test fixtures
    Consultation = 6,
    VitalsCheckOnly = 7,
    RetailPurchase = 8,
    StandaloneProcedure = 9,
    LaboratorySpecimen = 10,
    AdministrativeDocument = 11,
    CashierSettlement = 12
}

public static class VisitTypeExtensions
{
    public static bool IsPhysicianConsultation(this VisitType visitType) => visitType switch
    {
        VisitType.RoutineCheckup => true,
        VisitType.AcuteIllnessConsultation => true,
        VisitType.ChronicDiseaseFollowUp => true,
        VisitType.UrgentCareVisit => true,
        VisitType.Consultation => true,
        _ => false
    };

    public static bool IsPhysicianConsultationString(string? visitType) => (visitType ?? string.Empty).Trim() switch
    {
        nameof(VisitType.RoutineCheckup) => true,
        nameof(VisitType.AcuteIllnessConsultation) => true,
        nameof(VisitType.ChronicDiseaseFollowUp) => true,
        nameof(VisitType.UrgentCareVisit) => true,
        "Consultation" => true,
        _ => false
    };

    public static string ToDisplayLabel(this VisitType visitType) => visitType switch
    {
        VisitType.RoutineCheckup => "Routine Checkup",
        VisitType.AcuteIllnessConsultation => "Acute Illness Consultation",
        VisitType.ChronicDiseaseFollowUp => "Chronic Disease Follow-Up",
        VisitType.PreventiveHealthAssessment => "Preventive Health Assessment",
        VisitType.UrgentCareVisit => "Urgent Care Visit",
        VisitType.Consultation => "Consultation",
        VisitType.VitalsCheckOnly => "Vitals Check",
        VisitType.RetailPurchase => "Retail Purchase",
        VisitType.StandaloneProcedure => "Standalone Procedure",
        VisitType.LaboratorySpecimen => "Laboratory Specimen",
        VisitType.AdministrativeDocument => "Administrative Document",
        VisitType.CashierSettlement => "Cashier Settlement",
        _ => string.Empty
    };
}

public enum QueuePriority
{
    Routine = 1,
    Urgent = 2,
    Emergency = 3
}

public enum QueueStatus
{
    Waiting = 1,
    Triaged = 2,
    InConsultation = 3,
    Completed = 4,
    Cancelled = 5,
    NoShow = 6,
    PendingProcedure = 7,
    ReEvaluation = 8,
    OnHold = 9,
    DischargedNonDoctor = 10,
    Diverted = 11
}

