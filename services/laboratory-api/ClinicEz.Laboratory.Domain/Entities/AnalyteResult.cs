using System;
using ClinicEz.Laboratory.Domain.Common;
using ClinicEz.Laboratory.Domain.Enums;

namespace ClinicEz.Laboratory.Domain.Entities;

public sealed class AnalyteResult : BaseEntity
{
    public Guid LabRequisitionId { get; set; }
    public required string PanelName { get; set; }
    public required string AnalyteCode { get; set; }
    public required string AnalyteName { get; set; }
    public required string Value { get; set; }
    public string Unit { get; set; } = string.Empty;
    public string ReferenceInterval { get; set; } = string.Empty;
    public AnalyteFlag Flag { get; set; } = AnalyteFlag.Normal;
    public string? Interpretation { get; set; }
    public string? EnteredByMedTechName { get; set; }
    public DateTime EnteredAt { get; set; } = DateTime.UtcNow;
}
