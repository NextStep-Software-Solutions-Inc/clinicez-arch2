namespace ClinicEz.Clinic.Domain.Enums;

public enum VisitType
{
    Consultation = 1,
    VitalsCheckOnly = 2,
    RetailPurchase = 3,
    StandaloneProcedure = 4,
    LaboratorySpecimen = 5,
    AdministrativeDocument = 6,
    CashierSettlement = 7
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

