using ClinicEz.Patient.Domain.Common;
using ClinicEz.Patient.Domain.Enums;

namespace ClinicEz.Patient.Domain.Entities;

public sealed class ImagingResult : BaseEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;
    public Guid ClinicId { get; set; }
    public Guid? ConsultationId { get; set; }
    public Consultation? Consultation { get; set; }

    public ImagingModality Modality { get; set; }
    public string? BodyPart { get; set; }
    public string? Findings { get; set; }
    public string? Impression { get; set; }
    public string? ImageUrl { get; set; }
    public DateTime PerformedAt { get; set; }
}
