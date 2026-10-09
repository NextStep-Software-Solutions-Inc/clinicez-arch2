using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class ClinicLabOrder : BaseEntity
{
    public string? TenantId { get; set; }
    public Guid ClinicId { get; set; }

    public required string OrderNumber { get; set; }
    public Guid PatientId { get; set; }
    public required string PatientName { get; set; }
    public Guid? ConsultationId { get; set; }

    public Guid? OrderedByDoctorId { get; set; }
    public string? OrderedByDoctorName { get; set; }
    public DateTime OrderDate { get; set; } = DateTime.UtcNow;

    public LabOrderStatus Status { get; set; } = LabOrderStatus.Ordered;
    public string? ClinicalDiagnosis { get; set; }
    public string? Notes { get; set; }

    /// <summary>Lifecycle stage owned by the performing lab; mirrored here from <c>lab.order.status.changed</c>.</summary>
    public LabOrderStage Stage { get; set; } = LabOrderStage.Issued;
    public DateTime StageChangedAt { get; set; } = DateTime.UtcNow;
    /// <summary>When the laboratory said the stage changed (its clock); a status message older than this is stale and ignored.</summary>
    public DateTime? StageReportedAt { get; set; }
    public string? StageReason { get; set; }
    public decimal? QuotedAmount { get; set; }
    public string? QuotedCurrency { get; set; }
    public bool PaymentRequired { get; set; }

    /// <summary>The laboratory the clinician routed the order to; null for a patient-carried slip.</summary>
    public string? TargetTenantId { get; set; }
    public Guid? TargetFacilityId { get; set; }

    /// <summary>The laboratory that is performing the order (learned from its status messages, also for a claimed slip).</summary>
    public string? LaboratoryTenantId { get; set; }
    public string? LaboratoryFacilityId { get; set; }
    public string? LaboratoryName { get; set; }

    /// <summary>Hub claim capability printed as the slip QR so any ClinicEZ laboratory can take the order.</summary>
    public string? ClaimToken { get; set; }
    public DateTime? ClaimExpiresAt { get; set; }

    // Interoperability & External Lab Ingestion Fields
    public string? ExternalLabName { get; set; }
    public string? ExternalReportUrl { get; set; }
    public string? ExternalReportType { get; set; } // Photo, PDF
    public string? UploadedBy { get; set; } // Patient, ExternalLab, ClinicStaff
    public string? ObservationsJson { get; set; } // Serialized discrete analyte results
    public string? PathologistImpression { get; set; }
    public string? VerifiedByPathologist { get; set; }
    public string? PathologistPrcLicense { get; set; }
    public DateTime? ReportReleasedAt { get; set; }

    // Critical Panic Result Interoperability Fields
    public bool HasCriticalPanicAlert { get; set; } = false;
    public string? CriticalFindingsJson { get; set; }
    public DateTime? PanicAlertTriggeredAt { get; set; }
    public DateTime? PanicAcknowledgedAt { get; set; }
    public string? PanicAcknowledgedBy { get; set; }

    public List<ClinicLabOrderItem> Items { get; set; } = new();
}

public sealed class ClinicLabOrderItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid LabOrderId { get; set; }
    public required string TestName { get; set; }
    public required string Category { get; set; }
    public string? Instructions { get; set; }
    public LabOrderStatus Status { get; set; } = LabOrderStatus.Ordered;
    public string? PhilHealthServiceCode { get; set; }
}
