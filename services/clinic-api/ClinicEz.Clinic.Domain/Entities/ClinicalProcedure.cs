using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class ClinicalProcedure : BaseEntity
{
    public string? TenantId { get; set; }
    public Guid ClinicId { get; set; }

    public Guid PatientId { get; set; }
    public required string PatientName { get; set; }
    public Guid? QueueItemId { get; set; }
    public Guid? ConsultationId { get; set; }

    public string? ProcedureCode { get; set; }
    public required string ProcedureName { get; set; }
    public required string Category { get; set; } // Nebulization, Immunization, WoundCare, Diagnostic, MinorSurgery

    public Guid? OrderedByDoctorId { get; set; }
    public string? OrderedByDoctorName { get; set; }
    public Guid? PerformedByStaffId { get; set; }
    public string? PerformedByStaffName { get; set; }
    public DateTime? PerformedAt { get; set; }
    public DateTime ScheduledAt { get; set; } = DateTime.UtcNow;

    public ProcedureStatus Status { get; set; } = ProcedureStatus.Ordered;

    public string? PreProcedureVitalsJson { get; set; }
    public string? PostProcedureVitalsJson { get; set; }
    public string? MedicationAdministered { get; set; }
    public string? LotNumber { get; set; }
    public DateTime? ExpirationDate { get; set; }
    public string? SiteRoute { get; set; }
    public string? ClinicalNotes { get; set; }
    public string? Complications { get; set; }

    /// <summary>
    /// Optional target treatment room where the procedure is routed for nursing execution.
    /// </summary>
    public Guid? TargetRoomId { get; set; }
    public ClinicRoom? TargetRoom { get; set; }
    public string? TargetRoomName { get; set; }
}
