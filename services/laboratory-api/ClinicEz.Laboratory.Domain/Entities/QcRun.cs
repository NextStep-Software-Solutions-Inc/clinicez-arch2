using System;
using ClinicEz.Laboratory.Domain.Common;
using ClinicEz.Laboratory.Domain.Enums;

namespace ClinicEz.Laboratory.Domain.Entities;

public sealed class QcRun : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid QcLotId { get; set; }
    public required string AnalyteCode { get; set; }
    public double MeasuredValue { get; set; }
    public double ZScore { get; set; }
    public DateTime RunAt { get; set; } = DateTime.UtcNow;
    public string RunByMedTechName { get; set; } = string.Empty;
    public QcRunStatus Status { get; set; } = QcRunStatus.Passed;
    public string ViolationRules { get; set; } = string.Empty;
    public string? CorrectiveAction { get; set; }
    public string? Notes { get; set; }
}
