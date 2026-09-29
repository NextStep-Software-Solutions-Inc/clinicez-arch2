using System;
using System.Collections.Generic;
using ClinicEz.Laboratory.Domain.Enums;

namespace ClinicEz.Laboratory.Application.Features.Requisitions.DTOs;

public record SpecimenDto
{
    public Guid Id { get; init; }
    public string Barcode { get; init; } = string.Empty;
    public string ContainerType { get; init; } = string.Empty;
    public string SpecimenType { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public DateTime? CollectedAt { get; init; }
    public string? CollectedByPhlebotomistName { get; init; }
    public DateTime? ReceivedInLabAt { get; init; }
    public string? Notes { get; init; }
}

public record AnalyteResultDto
{
    public Guid Id { get; init; }
    public string PanelName { get; init; } = string.Empty;
    public string AnalyteCode { get; init; } = string.Empty;
    public string AnalyteName { get; init; } = string.Empty;
    public string Value { get; init; } = string.Empty;
    public string Unit { get; init; } = string.Empty;
    public string ReferenceInterval { get; init; } = string.Empty;
    public string Flag { get; init; } = "Normal";
    public string? Interpretation { get; init; }
    public string? EnteredByMedTechName { get; init; }
    public DateTime EnteredAt { get; init; }
}

public record DiagnosticReportDto
{
    public Guid Id { get; init; }
    public string ReportNumber { get; init; } = string.Empty;
    public DateTime ReleasedAt { get; init; }
    public string PathologistName { get; init; } = string.Empty;
    public string PathologistPrcLicense { get; init; } = string.Empty;
    public string MedicalTechnologistName { get; init; } = string.Empty;
    public string MedicalTechnologistPrcLicense { get; init; } = string.Empty;
    public string? PathologistImpression { get; init; }
    public bool IsCriticalResult { get; init; }
    public string? SignedPdfBase64 { get; init; }
}

public record LabRequisitionDto
{
    public Guid Id { get; init; }
    public Guid? ExternalRequisitionId { get; init; }
    public string AccessionNumber { get; init; } = string.Empty;
    public string OrderingFacilityName { get; init; } = string.Empty;
    public string OrderingDoctorName { get; init; } = string.Empty;
    public string? OrderingDoctorPrc { get; init; }
    public Guid PatientId { get; init; }
    public string PatientName { get; init; } = string.Empty;
    public string? PhilHealthPin { get; init; }
    public int PatientAge { get; init; }
    public string PatientGender { get; init; } = "Unknown";
    public string? ContactNumber { get; init; }
    public string? ClinicalDiagnosis { get; init; }
    public string? FastingInstructions { get; init; }
    public string Urgency { get; init; } = "Routine";
    public string Status { get; init; } = "PendingAccession";
    public DateTime CreatedAt { get; init; }
    public List<SpecimenDto> Specimens { get; init; } = new();
    public List<AnalyteResultDto> AnalyteResults { get; init; } = new();
    public DiagnosticReportDto? DiagnosticReport { get; init; }
}
