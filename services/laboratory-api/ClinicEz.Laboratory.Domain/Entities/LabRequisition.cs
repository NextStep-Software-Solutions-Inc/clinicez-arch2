using System;
using System.Collections.Generic;
using ClinicEz.Laboratory.Domain.Common;
using ClinicEz.Laboratory.Domain.Enums;

namespace ClinicEz.Laboratory.Domain.Entities;

public sealed class LabRequisition : BaseEntity, ILabScopedEntity
{
    public required string TenantId { get; set; }
    public string? BranchId { get; set; }
    public Guid LaboratoryId { get; set; }

    public Guid? ExternalRequisitionId { get; set; }
    public required string AccessionNumber { get; set; }

    /// <summary>Tenant of the ordering clinic (envelope <c>From</c>); with <see cref="OrderingFacilityId"/> it is the reply address.</summary>
    public string? OrderingTenantId { get; set; }
    /// <summary>Facility id of the ordering clinic (envelope <c>From</c>).</summary>
    public string OrderingFacilityId { get; set; } = string.Empty;
    public string OrderingFacilityName { get; set; } = string.Empty;

    /// <summary>Workflow correlation id: the ordering clinic's requisition id. Carried on every reply.</summary>
    public Guid? CorrelationId { get; set; }

    public string OrderingDoctorName { get; set; } = string.Empty;
    public string? OrderingDoctorPrc { get; set; }

    public Guid PatientId { get; set; }
    public required string PatientName { get; set; }
    public string? PhilHealthPin { get; set; }
    public int PatientAge { get; set; }
    public string PatientGender { get; set; } = "Unknown";
    public string? ContactNumber { get; set; }

    public string? ClinicalDiagnosis { get; set; }
    public string? FastingInstructions { get; set; }
    public string Urgency { get; set; } = "Routine"; // Routine, STAT

    public RequisitionStatus Status { get; set; } = RequisitionStatus.PendingAccession;

    /// <summary>Clinic encounter/queue id (from <c>lab.order.issued</c>) used to group this order into the visit's consolidated bill.</summary>
    public string? VisitKey { get; set; }

    /// <summary>Where the order is in its lifecycle; every change is mirrored to the ordering clinic and the patient.</summary>
    public RequisitionStage Stage { get; set; } = RequisitionStage.Routed;
    public DateTime? StageChangedAtUtc { get; set; }
    /// <summary>Why the order was rejected or cancelled.</summary>
    public string? StageReason { get; set; }

    /// <summary>Payment policy in force when the order was accepted. Only <see cref="PaymentPolicy.Prepaid"/> blocks the work.</summary>
    public PaymentPolicy PaymentPolicy { get; set; } = PaymentPolicy.None;
    public decimal? QuotedAmount { get; set; }
    /// <summary>The billed lines (JSON of billing line DTOs) behind <see cref="QuotedAmount"/>; lets staff refresh the quote.</summary>
    public string? QuoteLinesJson { get; set; }
    public string Currency { get; set; } = "PHP";
    /// <summary>Set when billing confirmed a full payment at the cashier.</summary>
    public DateTime? PaidAtUtc { get; set; }
    public Guid? InvoiceId { get; set; }
    public string? ReceiptNumber { get; set; }

    /// <summary>Set when billing voided the invoice or refunded the payment after the order was accepted.</summary>
    public PaymentCorrection PaymentCorrection { get; set; } = PaymentCorrection.None;
    public DateTime? PaymentCorrectedAtUtc { get; set; }

    /// <summary>True when <see cref="PatientId"/> is a ClinicEZ patient (patient-api id); <see cref="Guid.Empty"/> means unknown.</summary>
    public bool HasClinicEzPatient => PatientId != Guid.Empty;

    /// <summary>True while a prepaid order has not been paid yet: specimen collection and processing must wait.</summary>
    public bool IsPaymentBlocking => PaymentPolicy == PaymentPolicy.Prepaid && PaidAtUtc == null;

    /// <summary>The id the ordering clinic knows this order by; it correlates every message about the order.</summary>
    public Guid ClinicRequisitionId => CorrelationId ?? ExternalRequisitionId ?? Id;

    public List<Specimen> Specimens { get; set; } = new();
    public List<AnalyteResult> AnalyteResults { get; set; } = new();
    public DiagnosticReport? DiagnosticReport { get; set; }
}
