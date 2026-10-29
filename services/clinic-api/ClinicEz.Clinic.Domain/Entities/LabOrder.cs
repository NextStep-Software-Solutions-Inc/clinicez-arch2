using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Domain.Entities;

public class LabOrder : ClinicScopedEntity
{
    public required string OrderNumber { get; set; }
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;
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
    public string? PathologistImpression { get; set; }
    public string? VerifiedByPathologist { get; set; }
    public string? PathologistPrcLicense { get; set; }
    public DateTime? ReportReleasedAt { get; set; }

    // Critical Panic Result Interoperability Fields
    public bool HasCriticalPanicAlert { get; set; } = false;
    public DateTime? PanicAlertTriggeredAt { get; set; }
    public DateTime? PanicAcknowledgedAt { get; set; }
    public string? PanicAcknowledgedBy { get; set; }
    // PhilHealth Statutory Tracking (PCAPI diagnostic-request)
    public string? PhilHealthRequestTransNo { get; set; }
    public string? RequestingPhysicianName { get; set; }
    public string? RequestingPhysicianPrcNo { get; set; }
    public string? RequestingPhysicianPan { get; set; }
    public string? SignOffPhysicianName { get; set; }
    public string? SignOffPhysicianDesignation { get; set; }
    public string? SignOffPhysicianPrcNo { get; set; }
    public string? SignOffPhysicianPan { get; set; }

    public ICollection<LabOrderItem> Items { get; set; } = new List<LabOrderItem>();
    public ICollection<LabObservation> Observations { get; set; } = new List<LabObservation>();
}
