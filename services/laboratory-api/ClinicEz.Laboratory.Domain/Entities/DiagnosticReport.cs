using System;
using ClinicEz.Laboratory.Domain.Common;

namespace ClinicEz.Laboratory.Domain.Entities;

public sealed class DiagnosticReport : BaseEntity
{
    public Guid LabRequisitionId { get; set; }
    public required string ReportNumber { get; set; }
    public DateTime ReleasedAt { get; set; } = DateTime.UtcNow;

    public required string PathologistName { get; set; }
    public required string PathologistPrcLicense { get; set; }

    public required string MedicalTechnologistName { get; set; }
    public required string MedicalTechnologistPrcLicense { get; set; }

    public string? PathologistImpression { get; set; }
    public bool IsCriticalResult { get; set; }
    public string? SignedPdfBase64 { get; set; }
}
