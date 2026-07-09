using PatientAppBE.Domain.Common;

namespace PatientAppBE.Domain.Entities;

public sealed class VitalSigns : BaseEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;
    public Guid ClinicId { get; set; }
    public Guid? ConsultationId { get; set; }
    public Consultation? Consultation { get; set; }

    public DateTime RecordedAt { get; set; }
    public decimal? WeightKg { get; set; }
    public decimal? HeightCm { get; set; }
    public decimal? Bmi { get; set; }
    public int? SystolicBp { get; set; }
    public int? DiastolicBp { get; set; }
    public int? HeartRateBpm { get; set; }
    public decimal? TemperatureCelsius { get; set; }
    public decimal? OxygenSaturationPercent { get; set; }
    public int? RespiratoryRateBreathsPerMin { get; set; }
}
