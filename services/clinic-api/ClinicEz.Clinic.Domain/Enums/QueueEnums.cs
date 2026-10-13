namespace ClinicEz.Clinic.Domain.Enums;

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
    OnHold = 9
}
