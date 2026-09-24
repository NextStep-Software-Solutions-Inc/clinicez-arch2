using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class TriageVitals : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }

    public Guid QueueItemId { get; set; }
    public QueueItem? QueueItem { get; set; }

    public Guid PatientId { get; set; }
    public Guid? NurseId { get; set; }
    public string? RecordedByNurseName { get; set; }

    public DateTime RecordedAt { get; set; } = DateTime.UtcNow;

    // Vital Signs
    public int? SystolicBp { get; set; }
    public int? DiastolicBp { get; set; }
    public int? HeartRateBpm { get; set; }
    public decimal? TemperatureCelsius { get; set; }
    public int? RespiratoryRateBreathsPerMin { get; set; }
    public decimal? OxygenSaturationPercent { get; set; }
    public decimal? HeightCm { get; set; }
    public decimal? WeightKg { get; set; }
    public decimal? Bmi { get; set; }
    public int? PainScore { get; set; } // 0-10
    public string? Notes { get; set; }
}
