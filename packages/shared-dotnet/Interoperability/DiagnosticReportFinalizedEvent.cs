using System;
using System.Collections.Generic;

namespace ClinicEz.Shared.Interoperability;

public record AnalyteObservationDto
{
    public string PanelName { get; init; } = string.Empty;
    public string AnalyteCode { get; init; } = string.Empty;
    public string AnalyteName { get; init; } = string.Empty;
    public string Value { get; init; } = string.Empty;
    public string Unit { get; init; } = string.Empty;
    public string ReferenceInterval { get; init; } = string.Empty;
    public string Flag { get; init; } = "Normal"; // Normal, Low, High, Critical
    public string? Interpretation { get; init; }
}

public record DiagnosticReportFinalizedEvent
{
    public Guid ReportId { get; init; } = Guid.NewGuid();
    public Guid RequisitionId { get; init; }
    public string AccessionNumber { get; init; } = string.Empty;
    public string LaboratoryFacilityId { get; init; } = string.Empty;
    public string LaboratoryTenantId { get; init; } = string.Empty;
    public string LaboratoryName { get; init; } = string.Empty;
    public string PathologistName { get; init; } = string.Empty;
    public string PathologistPrcLicense { get; init; } = string.Empty;
    public string MedicalTechnologistName { get; init; } = string.Empty;
    public string MedicalTechnologistPrcLicense { get; init; } = string.Empty;
    public DateTime ReleasedAt { get; init; } = DateTime.UtcNow;
    public List<AnalyteObservationDto> Observations { get; init; } = new();
    public string? PathologistImpression { get; init; }
    public bool IsCriticalResult { get; init; }
    public string? SignedPdfBase64 { get; init; }
}
