using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Application.Common.Interfaces;

/// <summary>
/// Generates sample/preview PDFs for clinic stationery and document templates.
/// </summary>
public interface ISampleDocumentGenerator
{
    (byte[] PdfBytes, string FileName) GenerateSamplePdf(
        string docType,
        bool wetSignature,
        string? paperSize,
        FacilitySettings settings);
}
