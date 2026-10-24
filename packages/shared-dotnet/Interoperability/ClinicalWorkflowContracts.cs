using System.Text.Json.Serialization;
using System;
using System.Collections.Generic;
using System.Text.Json;
using ClinicEz.Shared.Common;

namespace ClinicEz.Shared.Interoperability;

// ---------------------------------------------------------------------------------------------
// Shared enums for the clinical workflows (plan 4.6)
// ---------------------------------------------------------------------------------------------

/// <summary>Lifecycle of a lab order, owned by the performing lab and mirrored to the clinic and the patient.</summary>
[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum LabOrderStage
{
    Issued,
    Routed,
    Claimed,
    AwaitingPayment,
    Paid,
    SpecimenCollected,
    InProcess,
    ResultFinalized,
    ExternalSubmitted,
    Reviewed,
    Rejected,
    Cancelled
}

/// <summary>Where a result came from. Always derived server-side from the channel, never supplied by a caller.</summary>
[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum ResultSource { ClinicEzLab, ExternalLab, PatientUploaded }

/// <summary>Clinic EZ lab results arrive Verified; external and patient uploads stay Unverified until the ordering doctor reviews.</summary>
[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum VerificationState { Verified, Unverified, Rejected }

[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum RxStage { Issued, Accepted, PartiallyAccepted, Rejected, Dispensed, ExternalDispensed }

[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum PatientDocumentKind { LabRequest, Prescription, LabResult, MedicalCertificate, DispenseReceipt }

[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum UploaderKind { ExternalLab, Patient }

// ---------------------------------------------------------------------------------------------
// Billing (per-cell cashiering; decision D5). facility -> billing: `billing.invoice.requested`.
// Addressing: To = Party.ForFacility(tenantId, issuingFacilityId, facilityType, InteropServices.Billing).
// billing -> facility: `billing.payment.confirmed`, From = the same facility party with Service=billing,
// To = Party.ForFacility(tenantId, facilityId, facilityType). CorrelationId = InvoiceRequestId.
// billing -> portal (finance rollup, NO PHI): `billing.invoice.paid`.
// ---------------------------------------------------------------------------------------------

public record BillingLineDto
{
    public string Code { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public int Quantity { get; init; } = 1;
    public decimal UnitPrice { get; init; }
}

public record BillingInvoiceRequestedPayload
{
    /// <summary>Idempotency + correlation key chosen by the requesting facility (usually the source document id). Re-sending the same id while unpaid replaces the lines.</summary>
    public Guid InvoiceRequestId { get; init; }
    public string TenantId { get; init; } = string.Empty;
    public string FacilityId { get; init; } = string.Empty;
    public FacilityType FacilityType { get; init; }
    public string? BranchId { get; init; }
    public Guid? PatientId { get; init; }
    public string PatientName { get; init; } = string.Empty;
    /// <summary>Groups lines from clinic, lab and pharmacy into ONE consolidated visit bill at the shared counter (clinic encounter / queue id).</summary>
    public string? VisitKey { get; init; }
    /// <summary>"Consultation", "LabOrder", "Prescription", ...</summary>
    public string SourceType { get; init; } = string.Empty;
    public Guid SourceId { get; init; }
    public List<BillingLineDto> Lines { get; init; } = new();
    public string Currency { get; init; } = "PHP";
    public DateTime RequestedAtUtc { get; init; } = DateTime.UtcNow;
}

public record BillingPaymentConfirmedPayload
{
    public Guid InvoiceRequestId { get; init; }
    public Guid InvoiceId { get; init; }
    public string SourceType { get; init; } = string.Empty;
    public Guid SourceId { get; init; }
    public decimal AmountDue { get; init; }
    public decimal AmountPaid { get; init; }
    public bool FullyPaid { get; init; }
    public string? PaymentMethod { get; init; }
    public string? ReceiptNumber { get; init; }
    public DateTime PaidAtUtc { get; init; } = DateTime.UtcNow;
}

/// <summary>Finance summary for the workspace rollup in portal-api. Deliberately contains no patient data.</summary>
public record BillingInvoicePaidPayload
{
    public string TenantId { get; init; } = string.Empty;
    public string FacilityId { get; init; } = string.Empty;
    public FacilityType FacilityType { get; init; }
    public string? BranchId { get; init; }
    public Guid InvoiceId { get; init; }
    public string SourceType { get; init; } = string.Empty;
    public decimal Total { get; init; }
    public string Currency { get; init; } = "PHP";
    public DateTime PaidAtUtc { get; init; } = DateTime.UtcNow;
}

// ---------------------------------------------------------------------------------------------
// Lab / pharmacy status mirrors. CorrelationId = RequisitionId / PrescriptionId (GUID).
// Lab sends `lab.order.status.changed` to the ordering clinic AND to Party.ForPatient(patientId) when the
// order's PatientId is a Clinic EZ patient (patient-api id).
// ---------------------------------------------------------------------------------------------

public record LabOrderStatusChangedPayload
{
    public Guid RequisitionId { get; init; }
    public string? OrderingTenantId { get; init; }
    public string? OrderingFacilityId { get; init; }
    public Guid? PatientId { get; init; }
    public string LaboratoryTenantId { get; init; } = string.Empty;
    public string LaboratoryFacilityId { get; init; } = string.Empty;
    public string LaboratoryName { get; init; } = string.Empty;
    public LabOrderStage Stage { get; init; }
    public decimal? QuotedAmount { get; init; }
    public string? Currency { get; init; }
    public bool PaymentRequired { get; init; }
    public string? Reason { get; init; }
    public DateTime ChangedAtUtc { get; init; } = DateTime.UtcNow;
}

/// <summary>Doctor accepted/rejected an unverified (external or patient-uploaded) result. Clinic -> lab (if routed) and patient.</summary>
public record LabResultReviewedPayload
{
    public Guid RequisitionId { get; init; }
    public Guid? ReportId { get; init; }
    public Guid? PatientId { get; init; }
    public VerificationState State { get; init; }
    public string ReviewedByName { get; init; } = string.Empty;
    public string? ReviewedByPrc { get; init; }
    public string? Remarks { get; init; }
    public DateTime ReviewedAtUtc { get; init; } = DateTime.UtcNow;
}

public record RxStatusChangedPayload
{
    public Guid PrescriptionId { get; init; }
    public string? OrderingTenantId { get; init; }
    public string? OrderingFacilityId { get; init; }
    public Guid? PatientId { get; init; }
    public string PharmacyTenantId { get; init; } = string.Empty;
    public string PharmacyFacilityId { get; init; } = string.Empty;
    public string PharmacyName { get; init; } = string.Empty;
    public RxStage Stage { get; init; }
    public decimal? QuotedAmount { get; init; }
    public string? Reason { get; init; }
    public DateTime ChangedAtUtc { get; init; } = DateTime.UtcNow;
}

// ---------------------------------------------------------------------------------------------
// Pharmacy OTC / Retail Counter Dispensation (clinic -> pharmacy: `pharmacy.otc.dispensed`).
// Sent when an in-clinic cashier settles retail medications or OTC supplies, decrements pharmacy lots via FEFO.
// ---------------------------------------------------------------------------------------------

public record OtcDispensedItemDto
{
    public Guid? ServiceItemId { get; init; }
    public string? ItemCode { get; init; }
    public string Description { get; init; } = string.Empty;
    public string Category { get; init; } = string.Empty;
    public int Quantity { get; init; } = 1;
    public decimal UnitPrice { get; init; }
    public decimal TotalPrice { get; init; }

    public OtcDispensedItemDto() { }

    public OtcDispensedItemDto(
        Guid? serviceItemId,
        string? itemCode,
        string description,
        string category,
        int quantity,
        decimal unitPrice,
        decimal totalPrice)
    {
        ServiceItemId = serviceItemId;
        ItemCode = itemCode;
        Description = description;
        Category = category;
        Quantity = quantity;
        UnitPrice = unitPrice;
        TotalPrice = totalPrice;
    }
}

public record PharmacyOtcDispensedItemDto : OtcDispensedItemDto
{
    public PharmacyOtcDispensedItemDto() { }

    public PharmacyOtcDispensedItemDto(
        Guid? serviceItemId,
        string? itemCode,
        string description,
        string category,
        int quantity,
        decimal unitPrice,
        decimal totalPrice)
        : base(serviceItemId, itemCode, description, category, quantity, unitPrice, totalPrice) { }
}

public record PharmacyOtcDispensedPayload
{
    public Guid EventId { get; init; } = Guid.NewGuid();
    public Guid InvoiceId { get; init; }
    public string InvoiceNumber { get; init; } = string.Empty;
    public Guid ClinicId { get; init; }
    public DateTime DispensedAtUtc { get; init; } = DateTime.UtcNow;
    public IReadOnlyList<OtcDispensedItemDto> Items { get; init; } = new List<OtcDispensedItemDto>();

    public PharmacyOtcDispensedPayload() { }

    public PharmacyOtcDispensedPayload(
        Guid eventId,
        Guid invoiceId,
        string invoiceNumber,
        Guid clinicId,
        DateTime dispensedAtUtc,
        IReadOnlyList<OtcDispensedItemDto> items)
    {
        EventId = eventId;
        InvoiceId = invoiceId;
        InvoiceNumber = invoiceNumber;
        ClinicId = clinicId;
        DispensedAtUtc = dispensedAtUtc;
        Items = items;
    }
}

// ---------------------------------------------------------------------------------------------
// Documents to the patient (patient-api keeps a copy of everything issued to the patient: right of access).
// Any issuing facility -> Party.ForPatient(patientId), type `patient.document.issued`.
// ---------------------------------------------------------------------------------------------

public record PatientDocumentIssuedPayload
{
    /// <summary>Id of the source document (requisition, prescription, report, certificate id): the idempotency key for upserts.</summary>
    public Guid DocumentId { get; init; }
    public PatientDocumentKind Kind { get; init; }
    public Guid PatientId { get; init; }
    public string IssuerTenantId { get; init; } = string.Empty;
    public string IssuerFacilityId { get; init; } = string.Empty;
    public FacilityType IssuerFacilityType { get; init; }
    public string IssuerName { get; init; } = string.Empty;
    public string Title { get; init; } = string.Empty;
    public DateTime IssuedAtUtc { get; init; } = DateTime.UtcNow;
    public string? Status { get; init; }
    public ResultSource? Source { get; init; }
    public VerificationState? Verification { get; init; }
    public string? VerificationToken { get; init; }
    public string? VerificationUrl { get; init; }
    /// <summary>QR content patients show at a lab/pharmacy to claim the order (hub claim token).</summary>
    public string? ClaimToken { get; init; }
    /// <summary>Kind-specific structured body: LabRequisitionIssuedEvent, PrescriptionIssuedEvent, DiagnosticReportFinalizedEvent, MedicalCertificateIssuedPayload, PrescriptionDispensedEvent.</summary>
    public JsonElement? Body { get; init; }
}

public record MedicalCertificateIssuedPayload
{
    public Guid CertificateId { get; init; }
    public string CertificateNumber { get; init; } = string.Empty;
    public Guid PatientId { get; init; }
    public string PatientName { get; init; } = string.Empty;
    public string IssuerTenantId { get; init; } = string.Empty;
    public string IssuerFacilityId { get; init; } = string.Empty;
    public string IssuerName { get; init; } = string.Empty;
    public string DoctorName { get; init; } = string.Empty;
    public string DoctorPrcLicense { get; init; } = string.Empty;
    public string? DoctorPtrNumber { get; init; }
    public string Purpose { get; init; } = string.Empty;
    public string? Diagnosis { get; init; }
    public string? Remarks { get; init; }
    public int? RestDays { get; init; }
    public DateTime? ValidFrom { get; init; }
    public DateTime? ValidTo { get; init; }
    public DateTime IssuedAtUtc { get; init; } = DateTime.UtcNow;
    public string? VerificationToken { get; init; }
    public string? VerificationUrl { get; init; }
}

// ---------------------------------------------------------------------------------------------
// Patient-controlled sharing (plan 4.8). Clinic -> Party.ForPatient: `patient.share.redeem`;
// patient-api replies to the SAME facility with `patient.share.snapshot`, CorrelationId copied from the request.
// ---------------------------------------------------------------------------------------------

[Flags]
[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum SharingScopes
{
    None = 0,
    Demographics = 1,
    Allergies = 2,
    Medications = 4,
    Conditions = 8,
    Immunizations = 16,
    LabResults = 32,
    Prescriptions = 64,
    Vitals = 128,
    All = Demographics | Allergies | Medications | Conditions | Immunizations | LabResults | Prescriptions | Vitals
}

/// <summary>
/// Redeems either a QR share token (<see cref="ShareToken"/>) or a manually entered one-time code
/// (<see cref="ClinicEzId"/> + <see cref="Code"/>, <see cref="ShareToken"/> left empty). A QR token may allow several
/// redemptions (each returns a fresh snapshot); a code is single use and lives for minutes.
/// </summary>
public record PatientShareRedeemPayload
{
    /// <summary>The short-lived signed token rendered as a QR by the patient app. Empty when redeeming by code.</summary>
    public string ShareToken { get; init; } = string.Empty;
    public string Purpose { get; init; } = "Consultation";

    /// <summary>The patient's ClinicEzId, typed by the facility when redeeming by <see cref="Code"/>.</summary>
    public string? ClinicEzId { get; init; }

    /// <summary>The one-time short code the patient reads out (case and hyphen insensitive), typed with <see cref="ClinicEzId"/>.</summary>
    public string? Code { get; init; }
}

public record ShareItemDto
{
    public string Kind { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string? Detail { get; init; }
    public DateTime? RecordedAtUtc { get; init; }
}

public record ShareDemographicsDto
{
    public string? FirstName { get; init; }
    public string? MiddleName { get; init; }
    public string? LastName { get; init; }
    public string? Suffix { get; init; }
    public string FullName { get; init; } = string.Empty;
    public string? DateOfBirth { get; init; }
    public string? Sex { get; init; }
    public string? MobileNumber { get; init; }
    public string? Email { get; init; }
    public string? Address { get; init; }
    public string? PhilHealthPin { get; init; }
}

/// <summary>Why a redeem was answered with <c>Granted = false</c>; <see cref="PatientShareSnapshotPayload.DenialReason"/> carries the human text.</summary>
[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum ShareDenialCode
{
    /// <summary>Malformed or forged token, or a code that matches nothing.</summary>
    Invalid,
    /// <summary>The token or code is past its lifetime.</summary>
    Expired,
    /// <summary>The token or code has used up all its redemptions.</summary>
    Exhausted,
    /// <summary>The patient behind the token or ClinicEzId does not exist.</summary>
    PatientUnknown,
    /// <summary>Too many wrong codes were tried; wait and ask the patient for a new code.</summary>
    RateLimited,
    /// <summary>The patient revoked this facility's access that the token had created.</summary>
    Revoked
}

public record PatientShareSnapshotPayload
{
    public bool Granted { get; init; }
    public string? DenialReason { get; init; }

    /// <summary>Set whenever <see cref="Granted"/> is false.</summary>
    public ShareDenialCode? DenialCode { get; init; }
    public Guid? GrantId { get; init; }
    public Guid PatientId { get; init; }
    public string ClinicEzId { get; init; } = string.Empty;
    public SharingScopes Scopes { get; init; }
    public DateTime? ExpiresAtUtc { get; init; }

    /// <summary>1-based count of this redemption of the token (always 1 for a code).</summary>
    public int RedemptionNumber { get; init; }

    /// <summary>How many times the token may be redeemed in all (1 for a code).</summary>
    public int MaxRedemptions { get; init; }

    /// <summary>True when this facility already held a grant from the same token: <see cref="GrantId"/> is unchanged and the content is a fresh snapshot to merge over the earlier import.</summary>
    public bool IsRefresh { get; init; }
    public ShareDemographicsDto? Demographics { get; init; }
    public List<ShareItemDto> Items { get; init; } = new();
}

// ---------------------------------------------------------------------------------------------
// Hub claim capability client DTOs (wire-compatible with the hub's /v1/claims endpoints).
// ---------------------------------------------------------------------------------------------

public record ClaimSlipRequest(ClinicEz.Shared.Interop.InteropEnvelope Envelope, int? TtlHours = null);

public record ClaimSlipResult(Guid ClaimId, string Token, DateTime ExpiresAtUtc);

public record ClaimRedeemRequest(string TenantId, string FacilityId);

public record ClaimRedeemResult(Guid ClaimId, Guid CorrelationId, Guid MessageId, string Type, string IssuerTenantId, string IssuerFacilityId);
