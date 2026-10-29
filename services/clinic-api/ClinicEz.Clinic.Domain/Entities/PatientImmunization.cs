using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientImmunization : ClinicScopedEntity
{
    public Guid? BranchId { get; set; }
    public Guid PatientId { get; set; }
    public Patient? Patient { get; set; }
    public required string PatientName { get; set; }
    public Guid? ConsultationEncounterId { get; set; }

    // Payer-Agnostic Core & PhilHealth Statutory Alignment
    public string? VaccineCode { get; set; }
    public required string VaccineName { get; set; }
    public string? PhilHealthLibrary { get; set; }
    public string? PhilHealthCode { get; set; }
    public string? PhilHealthVaccinationStatusCode { get; set; }

    // Clinical Administration Parameters
    public string? BrandName { get; set; }
    public string? Manufacturer { get; set; }
    public string? LotBatchNumber { get; set; }
    public DateOnly? ExpirationDate { get; set; }

    public int DoseSequence { get; set; } = 1; // 1 = Dose 1, 2 = Dose 2, 3 = Dose 3, 4 = Booster
    public int? TotalDosesInSeries { get; set; }
    public DateOnly? NextDueDate { get; set; }
    public bool IsSeriesCompleted { get; set; } = false;
    public string? Route { get; set; } = "Intramuscular"; // IM, SC, Intradermal, Oral
    public string? InjectionSite { get; set; } = "Left Deltoid"; // Left Deltoid, Right Deltoid, Anterolateral Thigh

    public DateTime AdministeredAtUtc { get; set; } = DateTime.UtcNow;
    public Guid? AdministeredByStaffId { get; set; }
    public string? AdministeredByStaffName { get; set; }
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
