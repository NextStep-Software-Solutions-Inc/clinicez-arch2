using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

/// <summary>
/// Unified clinic stock &amp; OTC medicine / medical supply dispensing ledger.
/// Single source of truth for non-pharmacy clinical dispensing across:
///   1. Doctor Consultations (starter pieces dispensed from a signed prescription)
///   2. Routine Nurse Vitals Checks (OTC medicine or medical supply dispensed with vitals &amp; home instructions)
/// Requires zero drug inventory or stock-depletion configuration.
/// </summary>
public sealed class ClinicDispensingLog : ClinicScopedEntity
{
    public Guid PatientId { get; set; }
    public Patient? Patient { get; set; }
    public required string PatientName { get; set; }

    /// <summary>
    /// Clinical visit anchor enforcing the Two-Scenario Entry Rule (Consultation or Vitals Check).
    /// </summary>
    public Guid QueueItemId { get; set; }
    public QueueItem? QueueItem { get; set; }

    public ClinicDispenseSource Source { get; set; } = ClinicDispenseSource.NurseVitalsCheck;

    public Guid? ConsultationEncounterId { get; set; }
    public ConsultationEncounter? ConsultationEncounter { get; set; }

    public Guid? PrescriptionItemId { get; set; }
    public PrescriptionItem? PrescriptionItem { get; set; }

    public Guid? PatientVitalsId { get; set; }
    public PatientVitals? PatientVitals { get; set; }

    public required string ItemName { get; set; }
    public ClinicDispenseItemCategory ItemCategory { get; set; } = ClinicDispenseItemCategory.Medicine;
    public string? DosageOrSpec { get; set; }
    public string FormOrUnit { get; set; } = "Piece";
    public int QuantityDispensed { get; set; }
    public string? DirectionsOrInstructions { get; set; }

    /// <summary>
    /// Associated Review of Systems category (e.g., Dermatologic, Respiratory, Neurological, or EssentiallyNormal).
    /// </summary>
    public RosSystem RosCategory { get; set; } = RosSystem.EssentiallyNormal;

    /// <summary>
    /// True immediately for Nurse Vitals Check OTC dispensing; for Doctor Consultation items, becomes true only upon encounter sign-off.
    /// </summary>
    public bool IsConsultationValidated { get; set; } = true;

    public Guid? DispensedByStaffId { get; set; }
    public required string DispensedByStaffName { get; set; }
    public string DispensedByRole { get; set; } = "Nurse";
    public DateTime DispensedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Asynchronous physician review fields for nurse-dispensed OTC medicines/supplies (no prior approval required).
    /// </summary>
    public bool RequiresDoctorReview { get; set; }
    public Guid? ReviewedByDoctorId { get; set; }
    public string? ReviewedByDoctorName { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public string? DoctorReviewNotes { get; set; }
    public bool InterventionFlagged { get; set; }
}
