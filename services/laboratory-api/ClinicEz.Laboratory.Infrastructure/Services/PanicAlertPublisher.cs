using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Laboratory.Application.Interop;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Laboratory.Infrastructure.Services;

public class PanicAlertPublisher : IPanicAlertPublisher
{
    private readonly IInteropPublisher _publisher;
    private readonly ILogger<PanicAlertPublisher> _logger;

    public PanicAlertPublisher(IInteropPublisher publisher, ILogger<PanicAlertPublisher> logger)
    {
        _publisher = publisher;
        _logger = logger;
    }

    public void EnqueuePanicAlert(LabPanicResultAlertEvent alertEvent)
    {
        _logger.LogWarning(
            "[PanicAlertPublisher] Queueing STAT {Type} for Accession #{AccessionNumber}, Patient: {PatientName}, {CriticalCount} critical finding(s). Doctor: {DoctorName}",
            InteropTypes.LabResultPanic, alertEvent.AccessionNumber, alertEvent.PatientName, alertEvent.CriticalFindings.Count, alertEvent.OrderingDoctorName);

        _publisher.Enqueue(
            InteropTypes.LabResultPanic,
            LabInteropParties.Laboratory(alertEvent.LaboratoryTenantId, alertEvent.LaboratoryFacilityId),
            LabInteropParties.OrderingClinic(alertEvent.OrderingTenantId, alertEvent.OrderingFacilityId),
            alertEvent.RequisitionId,
            alertEvent);
    }
}
