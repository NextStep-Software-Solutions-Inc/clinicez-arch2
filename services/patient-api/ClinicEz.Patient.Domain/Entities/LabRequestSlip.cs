using ClinicEz.Patient.Domain.Common;
using ClinicEz.Patient.Domain.Enums;

namespace ClinicEz.Patient.Domain.Entities;

/// <summary>The patient's copy of a lab request issued by a clinic, with the live stage/payment state the laboratory reports.</summary>
public sealed class LabRequestSlip : BaseEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    /// <summary>Id of the order across services (the requisition id); the idempotency key for upserts.</summary>
    public Guid RequisitionId { get; set; }

    public string OrderingTenantId { get; set; } = string.Empty;
    public string OrderingFacilityId { get; set; } = string.Empty;
    public string OrderingFacilityName { get; set; } = string.Empty;
    public string AccessionNumber { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Urgency { get; set; } = "Routine";
    /// <summary>JSON list of the requested tests (code, name, category).</summary>
    public string ItemsJson { get; set; } = "[]";

    public LabSlipStage Stage { get; set; } = LabSlipStage.Issued;
    /// <summary>When the stage last changed at the source; older status messages never overwrite a newer one.</summary>
    public DateTime? StageChangedAt { get; set; }
    public decimal? QuotedAmount { get; set; }
    public string? Currency { get; set; }
    public bool PaymentRequired { get; set; }
    public string? LaboratoryName { get; set; }
    public string? Reason { get; set; }

    /// <summary>QR content the patient shows at any ClinicEZ laboratory to claim the order.</summary>
    public string? ClaimToken { get; set; }
    public DateTime IssuedAt { get; set; }

    /// <summary>False while the row only exists because a status update arrived before the slip itself.</summary>
    public bool HasDetails { get; set; }
}