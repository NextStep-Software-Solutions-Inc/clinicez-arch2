using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Laboratory.Application.Interop;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Laboratory.Infrastructure.Services;

public class DiagnosticReportPublisher : IDiagnosticReportPublisher
{
    private readonly IInteropPublisher _publisher;
    private readonly ILogger<DiagnosticReportPublisher> _logger;

    public DiagnosticReportPublisher(IInteropPublisher publisher, ILogger<DiagnosticReportPublisher> logger)
    {
        _publisher = publisher;
        _logger = logger;
    }

    public void EnqueueReportFinalized(DiagnosticReportFinalizedEvent reportEvent)
    {
        _logger.LogInformation(
            "[DiagnosticReportPublisher] Queueing {Type} for Accession {AccessionNumber} (Requisition {RequisitionId}, Pathologist {PathologistName}) to the ordering clinic",
            InteropTypes.LabResultFinalized, reportEvent.AccessionNumber, reportEvent.RequisitionId, reportEvent.PathologistName);

        _publisher.Enqueue(
            InteropTypes.LabResultFinalized,
            LabInteropParties.Laboratory(reportEvent.LaboratoryTenantId, reportEvent.LaboratoryFacilityId),
            LabInteropParties.OrderingClinic(reportEvent.OrderingTenantId, reportEvent.OrderingFacilityId),
            reportEvent.RequisitionId,
            reportEvent);
    }
}
