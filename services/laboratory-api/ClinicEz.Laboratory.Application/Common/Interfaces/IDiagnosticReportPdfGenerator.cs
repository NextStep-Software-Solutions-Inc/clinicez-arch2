using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Shared.Documents.Configuration;

namespace ClinicEz.Laboratory.Application.Common.Interfaces;

public interface IDiagnosticReportPdfGenerator
{
    byte[] GeneratePdf(LabRequisition requisition, TenantPrintoutConfig? tenantConfig = null);
    string GenerateHtml(LabRequisition requisition, TenantPrintoutConfig? tenantConfig = null);
}
