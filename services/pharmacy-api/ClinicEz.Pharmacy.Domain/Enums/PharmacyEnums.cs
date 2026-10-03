namespace ClinicEz.Pharmacy.Domain.Enums;

public enum PrescriptionStatus
{
    Pending = 0,
    InPreparation = 1,
    ReadyForPickup = 2,
    Dispensed = 3,
    Cancelled = 4
}

public enum ItemDispenseStatus
{
    Pending = 0,
    Dispensed = 1,
    OutOfStock = 2,
    Substituted = 3
}

public enum BatchStatus
{
    Active = 0,
    Depleted = 1,
    Expired = 2,
    Quarantined = 3
}
