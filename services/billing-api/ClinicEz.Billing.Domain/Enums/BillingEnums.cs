namespace ClinicEz.Billing.Domain.Enums;

public enum InvoiceStatus
{
    Open,
    PartiallyPaid,
    Paid,
    Void,
    Refunded,
    /// <summary>Settled, then part of the money was given back. Locked like a paid invoice; the rest can still be refunded.</summary>
    PartiallyRefunded
}

/// <summary>Where an invoice came from: another facility's <c>billing.invoice.requested</c> message, or the cashier's own counter.</summary>
public enum InvoiceOrigin
{
    Requested,
    WalkIn
}

public enum PaymentMethod
{
    Cash,
    Card,
    GCash,
    Maya,
    Other,
    /// <summary>Settled by a third party (PhilHealth / HMO): recorded as external, never counted in the cash drawer.</summary>
    Insurance
}

public enum InsurerKind
{
    PhilHealth,
    Hmo,
    Other
}

public enum DiscountKind
{
    Senior,
    Pwd,
    Promo,
    Other
}

public enum DiscountMode
{
    Percentage,
    Fixed
}

public enum ShiftStatus
{
    Open,
    Closed
}

public enum StaffRole
{
    Cashier,
    Supervisor,
    Admin
}
