using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientImmunization : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid? BranchId { get; set; }
    public Guid PatientId { get; set; }
    public required string PatientName { get; set; }
    public Guid? ConsultationEncounterId { get; set; }

    // PhilHealth Statutory Alignment
    /// <summary>Catalog library: lib_immchild, lib_immyoungw, lib_immpregw, lib_immelderly, or OtherImm.</summary>
    public required string PhilHealthLibrary { get; set; }

    /// <summary>Statutory code (e.g., "C01", "Y01", "P01", "E01", or "999").</summary>
    public required string PhilHealthCode { get; set; }
    public required string VaccineName { get; set; }

    // Clinical Administration Parameters
    public string? BrandName { get; set; }
    public string? Manufacturer { get; set; }
    public required string LotBatchNumber { get; set; }
    public DateOnly ExpirationDate { get; set; }

    public int DoseSequence { get; set; } = 1; // 1 = Dose 1, 2 = Dose 2, 3 = Dose 3, 4 = Booster
    public bool IsSeriesCompleted { get; set; } = false;
    public string Route { get; set; } = "Intramuscular"; // IM, SC, Intradermal, Oral
    public string InjectionSite { get; set; } = "Left Deltoid"; // Left Deltoid, Right Deltoid, Anterolateral Thigh

    public DateTime AdministeredAtUtc { get; set; } = DateTime.UtcNow;
    public Guid AdministeredByStaffId { get; set; }
    public required string AdministeredByStaffName { get; set; }
    public string? AdministeredByPrcLicense { get; set; }

    // Adverse Event Following Immunization (AEFI)
    public bool HasAdverseReaction { get; set; } = false;
    public string AdverseReactionSeverity { get; set; } = "None"; // None, Mild, Moderate, Severe, Anaphylaxis
    public string? AdverseReactionRemarks { get; set; }
    public DateTime? AdverseReactionRecordedAtUtc { get; set; }

    // Historical Records & Baseline Profiling
    public bool IsHistorical { get; set; } = false;
    public string? HistoricalFacilityName { get; set; }
    public string? Remarks { get; set; }

    // Cross-Service Interoperability
    public bool IsSynchronizedToPatientApp { get; set; } = false;
    public DateTime? SynchronizedAtUtc { get; set; }
}
