using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class ConsultationEncounter : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid? BranchId { get; set; }

    public Guid? QueueItemId { get; set; }
    public QueueItem? QueueItem { get; set; }

    public Guid? AppointmentId { get; set; }
    public Appointment? Appointment { get; set; }

    public Guid PatientId { get; set; }
    public required string PatientName { get; set; }

    public Guid DoctorId { get; set; }
    public required string DoctorName { get; set; }

    public DateTime EncounterDate { get; set; } = DateTime.UtcNow;

    // Structured SOAP Documentation
    public string Subjective { get; set; } = string.Empty;
    public string Objective { get; set; } = string.Empty;
    public string Assessment { get; set; } = string.Empty;
    public string Plan { get; set; } = string.Empty;

    // Physician credential snapshot at encounter signing
    public string? DoctorPrcLicense { get; set; }
    public string? DoctorPtr { get; set; }
    public string? DoctorS2License { get; set; }

    // Lock status
    public bool IsSigned { get; set; } = false;
    public DateTime? SignedAt { get; set; }

    // PhilHealth Konsulta / YAKAP Encounter Tracking
    public bool IsYakapEligible { get; set; } = false;
    public string? PhilHealthSignSympCode { get; set; }
    public string? PhilHealthOtherComplaint { get; set; }
    public string? PhilHealthPainSite { get; set; }
    public string? PhilHealthCaseNo { get; set; }
    public string? PhilHealthSoapTransNo { get; set; }

    // E-Prescription Interoperability & External Verification
    public string? PrescriptionNumber { get; set; }
    public string? RxPublicVerificationToken { get; set; }

    /// <summary>Hub claim capability printed as the prescription QR so any ClinicEZ pharmacy can dispense it.</summary>
    public string? RxClaimToken { get; set; }
    public DateTime? RxClaimExpiresAt { get; set; }
    public ClinicEz.Clinic.Domain.Enums.PrescriptionDispenseStatus RxDispenseStatus { get; set; } = ClinicEz.Clinic.Domain.Enums.PrescriptionDispenseStatus.Issued;
    public string? RxDispensedPharmacyName { get; set; }
    public string? RxDispensedPharmacistName { get; set; }
    public string? RxDispensedPharmacistPrc { get; set; }
    public string? RxDispensedReceiptNumber { get; set; }
    public string? RxDispensedReceiptUrl { get; set; }
    public DateTime? RxDispensedAt { get; set; }
    public string? RxNotes { get; set; }

    /// <summary>Stage owned by the pharmacy; mirrored here from <c>rx.status.changed</c>.</summary>
    public ClinicEz.Shared.Interoperability.RxStage RxStage { get; set; } = ClinicEz.Shared.Interoperability.RxStage.Issued;
    public string? RxStageReason { get; set; }
    public decimal? RxQuotedAmount { get; set; }
    /// <summary>When the pharmacy said the stage changed (its clock); a status message older than this is stale and ignored.</summary>
    public DateTime? RxStageReportedAt { get; set; }
    public string? RxPharmacyTenantId { get; set; }
    public string? RxPharmacyFacilityId { get; set; }
    public string? RxPharmacyName { get; set; }

    // Navigations
    public ICollection<EncounterDiagnosis> Diagnoses { get; set; } = new List<EncounterDiagnosis>();
    public ICollection<PrescriptionItem> Prescriptions { get; set; } = new List<PrescriptionItem>();
}

