namespace ClinicEz.Clinic.Domain.Enums;

public enum VisitType
{
    RoutineCheckup = 1,
    AcuteIllnessConsultation = 2,
    ChronicDiseaseFollowUp = 3,
    PreventiveHealthAssessment = 4,
    UrgentCareVisit = 5
}

public static class VisitTypeExtensions
{
    public static bool IsPhysicianConsultation(this VisitType visitType) => visitType switch
    {
        VisitType.RoutineCheckup => true,
        VisitType.AcuteIllnessConsultation => true,
        VisitType.ChronicDiseaseFollowUp => true,
        VisitType.UrgentCareVisit => true,
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

