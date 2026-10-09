namespace ClinicEz.Pharmacy.Domain.Enums;

public enum PrescriptionStatus
{
    Pending = 0,
    InPreparation = 1,
    ReadyForPickup = 2,
    Dispensed = 3,
    Cancelled = 4,
    /// <summary>Pharmacy staff accepted the whole prescription; dispensing may proceed (subject to the payment policy).</summary>
    Accepted = 5,
    /// <summary>Only some items were accepted; the rest are ItemDispenseStatus.Rejected and are never dispensed.</summary>
    PartiallyAccepted = 6,
    Rejected = 7
}

public enum ItemDispenseStatus
{
    Pending = 0,
    Dispensed = 1,
    OutOfStock = 2,
    Substituted = 3,
    /// <summary>Declined by pharmacy staff in a partial acceptance.</summary>
    Rejected = 4
}

public enum BatchStatus
{
    Active = 0,
    Depleted = 1,
    Expired = 2,
    Quarantined = 3
}

/// <summary>When a pharmacy collects payment, snapshotted onto each order when it is received.</summary>
public enum PharmacyPaymentPolicy
{
    /// <summary>Payment must be confirmed by billing before anything is dispensed.</summary>
    Prepaid = 0,
    /// <summary>An invoice is raised on acceptance, but dispensing does not wait for payment.</summary>
    Postpaid = 1,
    /// <summary>No invoice is raised.</summary>
    None = 2
}

public enum PrescriptionPaymentStatus
{
    NotRequired = 0,
    AwaitingPayment = 1,
    Paid = 2
}
