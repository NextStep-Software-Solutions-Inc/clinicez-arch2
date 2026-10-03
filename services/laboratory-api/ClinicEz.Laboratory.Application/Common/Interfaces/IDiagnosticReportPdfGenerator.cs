using ClinicEz.Laboratory.Domain.Entities;

namespace ClinicEz.Laboratory.Application.Common.Interfaces;

public interface IDiagnosticReportPdfGenerator
{
    byte[] GeneratePdf(LabRequisition requisition);
    string GenerateHtml(LabRequisition requisition);
}
