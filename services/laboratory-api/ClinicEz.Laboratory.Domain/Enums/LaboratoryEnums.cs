namespace ClinicEz.Laboratory.Domain.Enums;

public enum RequisitionStatus
{
    PendingAccession,
    SpecimenCollected,
    InTesting,
    AwaitingReview,
    Verified,
    Rejected
}

public enum SpecimenStatus
{
    Pending,
    Collected,
    ReceivedInLab,
    Rejected
}

public enum SpecimenContainerType
{
    Purple_EDTA,
    Yellow_SST,
    Red_Serum,
    Grey_Fluoride,
    LightBlue_Citrate,
    Urine_Cup,
    Stool_Vial
}

public enum AnalyteFlag
{
    Normal,
    Low,
    High,
    Critical
}
