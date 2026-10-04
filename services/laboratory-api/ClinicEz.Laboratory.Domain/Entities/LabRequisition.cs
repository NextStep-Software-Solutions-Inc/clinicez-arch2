using System;
using System.Collections.Generic;
using ClinicEz.Laboratory.Domain.Common;
using ClinicEz.Laboratory.Domain.Enums;

namespace ClinicEz.Laboratory.Domain.Entities;

public sealed class LabRequisition : BaseEntity
{
    public required string TenantId { get; set; }
    public string? BranchId { get; set; }
    public Guid LaboratoryId { get; set; }

    public Guid? ExternalRequisitionId { get; set; }
    public required string AccessionNumber { get; set; }

    public string OrderingFacilityId { get; set; } = string.Empty;
    public string OrderingFacilityName { get; set; } = string.Empty;

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

    public List<Specimen> Specimens { get; set; } = new();
    public List<AnalyteResult> AnalyteResults { get; set; } = new();
    public DiagnosticReport? DiagnosticReport { get; set; }
}
