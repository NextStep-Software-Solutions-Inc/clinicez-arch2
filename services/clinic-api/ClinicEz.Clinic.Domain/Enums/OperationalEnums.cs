namespace ClinicEz.Clinic.Domain.Enums;

public enum InvoiceStatus
{
    Draft,
    Paid,
    PartiallyPaid,
    Voided,
    Refunded
}

public enum PaymentMethod
{
    Cash,
    GCash,
    Maya,
    CreditCard,
    DebitCard,
    PhilHealthKonsulta,
    HmoInsurance
}

public enum DiscountType
{
    None,
    SeniorCitizen,
    Pwd,
    PhilHealthKonsulta,
    Custom
}

public enum ProcedureStatus
{
    Ordered,
    InProgress,
    Completed,
    Cancelled
}

public enum LabOrderStatus
{
    Ordered,
    SpecimenCollected,
    SentToLab,
    ResultsReceived,
    Completed,
    CompletedWithExternalReport,
    Cancelled
}

public enum PrescriptionDispenseStatus
{
    Issued,
    SentToPartnerPharmacy,
    DispensedAtPartnerPharmacy,
    DispensedExternally,
    Cancelled
}

