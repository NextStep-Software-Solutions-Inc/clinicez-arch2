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

/// <summary>
/// When a laboratory expects payment for an order. <see cref="Prepaid"/> blocks specimen collection and processing until
/// the cashier confirms payment, <see cref="Postpaid"/> bills the order but never blocks the work, <see cref="None"/>
/// skips billing altogether.
/// </summary>
public enum PaymentPolicy
{
    Prepaid,
    Postpaid,
    None
}

/// <summary>A correction billing applied to the invoice behind an order after the fact.</summary>
public enum PaymentCorrection
{
    None,

    /// <summary>The invoice was voided; nothing had been paid.</summary>
    Voided,

    /// <summary>The payment was reversed at the cashier.</summary>
    Refunded
}

/// <summary>
/// Lifecycle of an order inside this laboratory. Names mirror the shared <c>LabOrderStage</c> wire contract, which
/// the Domain layer cannot reference; the Application layer maps between the two by name.
/// </summary>
public enum RequisitionStage
{
    Routed,
    Claimed,
    AwaitingPayment,
    Paid,
    SpecimenCollected,
    InProcess,
    ResultFinalized,
    Rejected,
    Cancelled
}
