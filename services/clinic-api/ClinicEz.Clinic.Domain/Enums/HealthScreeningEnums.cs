namespace ClinicEz.Clinic.Domain.Enums;

public enum HealthScreeningType
{
    RoutineWellness = 1,
    AnnualPhysicalExam = 2,
    PreEmployment = 3,
    SchoolPhysical = 4,
    YakapFpe = 5,
    CommunityScreening = 6
}

public enum HealthScreeningStatus
{
    InProgress = 1,
    AwaitingDoctor = 2,
    Completed = 3,
    EscalatedToConsultation = 4,
    Cancelled = 5
}

public enum HealthScreeningDisposition
{
    Cleared = 1,
    ClearedWithAdvice = 2,
    ForWorkup = 3,
    EscalatedToConsultation = 4
}
