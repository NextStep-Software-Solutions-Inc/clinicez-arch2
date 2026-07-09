using PatientAppBE.Domain.Common;

namespace PatientAppBE.Domain.Entities;

public sealed class Prescription : BaseEntity
{
    public Guid ConsultationId { get; set; }
    public Consultation Consultation { get; set; } = null!;
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;
    public Guid ClinicId { get; set; }

    public string MedicationName { get; set; } = string.Empty;
    public string? GenericName { get; set; }
    public string? Dosage { get; set; }
    public string? Frequency { get; set; }
    public string? Duration { get; set; }
    public string? Instructions { get; set; }
    public int? Quantity { get; set; }
    public DateTime IssuedAt { get; set; }
    public bool IsDispensed { get; set; }
}
