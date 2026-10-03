using System;
using System.Collections.Generic;

namespace ClinicEz.Shared.Interoperability;

public record CriticalFindingDto
{
    public string AnalyteCode { get; init; } = string.Empty;
    public string AnalyteName { get; init; } = string.Empty;
    public string ObservedValue { get; init; } = string.Empty;
    public string Unit { get; init; } = string.Empty;
    public string ReferenceInterval { get; init; } = string.Empty;
    public string AlertDescription { get; init; } = string.Empty;
}

public record LabPanicResultAlertEvent
{
    public Guid AlertId { get; init; } = Guid.NewGuid();
    public Guid RequisitionId { get; init; }
    public string AccessionNumber { get; init; } = string.Empty;
    public Guid PatientId { get; init; }
    public string PatientName { get; init; } = string.Empty;
    public string OrderingFacilityId { get; init; } = string.Empty;
    public string OrderingFacilityName { get; init; } = string.Empty;
    public string OrderingDoctorName { get; init; } = string.Empty;
    public string? OrderingDoctorPrc { get; init; }
    public string Urgency { get; init; } = "STAT";
    public DateTime TriggeredAt { get; init; } = DateTime.UtcNow;
    public List<CriticalFindingDto> CriticalFindings { get; init; } = new();
}
