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

public enum SpecimenRejectionReason
{
    None,
    Hemolyzed,
    Lipemic,
    Icteric,
    Clotted,
    InsufficientVolume_QNS,
    WrongContainer,
    UnlabeledMislabeled,
    Contaminated
}

public enum StorageTemperature
{
    Ambient_20_25C,
    Refrigerated_2_8C,
    Frozen_Minus20C,
    DeepFreeze_Minus80C
}

public enum SpecimenStorageStatus
{
    InTransit,
    InTesting,
    StoredInRack,
    Disposed
}

public enum ControlLevel
{
    Level1_Low,
    Level2_Normal,
    Level3_High
}

public enum QcRunStatus
{
    Passed,
    Warning,
    Rejected
}

public enum NotificationMethod
{
    Telephone,
    DirectEMR,
    SMS,
    InPerson
}
