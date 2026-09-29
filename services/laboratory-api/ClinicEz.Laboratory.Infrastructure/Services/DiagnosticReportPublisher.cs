using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Shared.Interoperability;
using MassTransit;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Laboratory.Infrastructure.Services;

public class DiagnosticReportPublisher : IDiagnosticReportPublisher
{
    private readonly IPublishEndpoint _publishEndpoint;
    private readonly ILogger<DiagnosticReportPublisher> _logger;

    public DiagnosticReportPublisher(IPublishEndpoint publishEndpoint, ILogger<DiagnosticReportPublisher> logger)
    {
        _publishEndpoint = publishEndpoint;
        _logger = logger;
    }

    public async Task PublishReportFinalizedAsync(DiagnosticReportFinalizedEvent reportEvent, CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation(
                "[DiagnosticReportPublisher] Broadcasting DiagnosticReportFinalizedEvent for Accession {AccessionNumber} (Requisition {RequisitionId}, Pathologist {PathologistName}) to RabbitMQ",
                reportEvent.AccessionNumber, reportEvent.RequisitionId, reportEvent.PathologistName);

            await _publishEndpoint.Publish(reportEvent, cancellationToken);

            _logger.LogInformation(
                "[DiagnosticReportPublisher] Successfully published report finalized event for Accession {AccessionNumber}",
                reportEvent.AccessionNumber);
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "[DiagnosticReportPublisher] Failed to publish DiagnosticReportFinalizedEvent for Accession {AccessionNumber}. Event will remain in local database.",
                reportEvent.AccessionNumber);
            // Non-blocking in offline / disconnected mode
        }
    }
}
