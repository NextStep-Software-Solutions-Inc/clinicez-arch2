using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class YakapTransmittalItem : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }

    public Guid YakapTransmittalId { get; set; }
    public YakapTransmittal? Transmittal { get; set; }

    public Guid PatientId { get; set; }
    public required string PatientName { get; set; }
    public required string PhilHealthIdentificationNumber { get; set; }

    public Guid? ConsultationEncounterId { get; set; }
    public ConsultationEncounter? ConsultationEncounter { get; set; }

    public DateTime? EncounterDate { get; set; }

    /// <summary>
    /// Type of item: "Enlistment", "Profile", "Soap", "Medicine", "Diagnostic".
    /// </summary>
    public required string ItemType { get; set; }

    /// <summary>
    /// PhilHealth item report status: "U" (Unprocessed/Uploaded), "A" (Accepted), "D" (Deficient).
    /// </summary>
    public string ReportStatus { get; set; } = "U";

    /// <summary>
    /// Individual deficiency remarks if rejected by PhilHealth validation.
    /// </summary>
    public string? DeficiencyRemarks { get; set; }
}
