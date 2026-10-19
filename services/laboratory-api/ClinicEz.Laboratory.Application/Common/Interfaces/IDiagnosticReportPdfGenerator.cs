using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Shared.Documents.Configuration;

namespace ClinicEz.Laboratory.Application.Common.Interfaces;

public interface IDiagnosticReportPdfGenerator
{
    /// <param name="tenantConfig">The laboratory's own letterhead (see <see cref="ILabPrintoutConfigProvider"/>); there is no built-in default.</param>
    byte[] GeneratePdf(LabRequisition requisition, TenantPrintoutConfig tenantConfig);
    string GenerateHtml(LabRequisition requisition, TenantPrintoutConfig tenantConfig);
}
