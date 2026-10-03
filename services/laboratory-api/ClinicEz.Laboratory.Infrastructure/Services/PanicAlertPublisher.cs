using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Shared.Interoperability;
using MassTransit;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Laboratory.Infrastructure.Services;

public class PanicAlertPublisher : IPanicAlertPublisher
{
    private readonly IPublishEndpoint _publishEndpoint;
    private readonly ILogger<PanicAlertPublisher> _logger;

    public PanicAlertPublisher(IPublishEndpoint publishEndpoint, ILogger<PanicAlertPublisher> logger)
    {
        _publishEndpoint = publishEndpoint;
        _logger = logger;
    }

    public async Task PublishPanicAlertAsync(LabPanicResultAlertEvent alertEvent, CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogWarning(
                "[PanicAlertPublisher] BROADCASTING STAT LabPanicResultAlertEvent for Accession #{AccessionNumber}, Patient: {PatientName}, {CriticalCount} critical finding(s). Doctor: {DoctorName}",
                alertEvent.AccessionNumber, alertEvent.PatientName, alertEvent.CriticalFindings.Count, alertEvent.OrderingDoctorName);

            await _publishEndpoint.Publish(alertEvent, cancellationToken);

            _logger.LogInformation(
                "[PanicAlertPublisher] Successfully dispatched panic alert across RabbitMQ for Accession #{AccessionNumber}",
                alertEvent.AccessionNumber);
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "[PanicAlertPublisher] Failed to publish STAT LabPanicResultAlertEvent for Accession #{AccessionNumber}. Local alert log preserved.",
                alertEvent.AccessionNumber);
        }
    }
}
