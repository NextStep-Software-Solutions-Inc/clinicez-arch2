using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class LabObservation : ClinicScopedEntity
{
    public Guid LabOrderId { get; set; }
    public LabOrder LabOrder { get; set; } = null!;

    public Guid? LabOrderItemId { get; set; }
    public LabOrderItem? LabOrderItem { get; set; }

    public string? LoincCode { get; set; }
    public required string AnalyteCode { get; set; }
    public required string AnalyteName { get; set; }
    public required string ValueText { get; set; }
    public decimal? NumericValue { get; set; }
    public string? Unit { get; set; }
    public decimal? ReferenceRangeLow { get; set; }
    public decimal? ReferenceRangeHigh { get; set; }
    public string? AbnormalFlag { get; set; }
    public bool IsCriticalPanic { get; set; }
    public string? ReferenceRangeText { get; set; }
    public string? Method { get; set; }
    public string? PerformedByStaffName { get; set; }

    public decimal? ValueConventional { get; set; }
    public string? UnitConventional { get; set; }
    public decimal? ValueSi { get; set; }
    public string? UnitSi { get; set; }
    public string? QualitativeCode { get; set; }
    public string? FindingCode { get; set; }
    public string? Remarks { get; set; }
}
