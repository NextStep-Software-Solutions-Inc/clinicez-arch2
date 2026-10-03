using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Shared.Interoperability;
using MassTransit;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Services;

public class LabRequisitionPublisher : ILabRequisitionPublisher
{
    private readonly IPublishEndpoint _publishEndpoint;
    private readonly ILogger<LabRequisitionPublisher> _logger;

    public LabRequisitionPublisher(IPublishEndpoint publishEndpoint, ILogger<LabRequisitionPublisher> logger)
    {
        _publishEndpoint = publishEndpoint;
        _logger = logger;
    }

    public async Task PublishRequisitionIssuedAsync(LabRequisitionIssuedEvent requisitionEvent, CancellationToken cancellationToken = default)
    {
        try
        {
            await _publishEndpoint.Publish(requisitionEvent, cancellationToken);
            _logger.LogInformation("[ClinicEz.Clinic] Successfully published LabRequisitionIssuedEvent #{AccessionNumber} to RabbitMQ", requisitionEvent.AccessionNumber);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[ClinicEz.Clinic] RabbitMQ publish notice: Could not dispatch event #{AccessionNumber} to broker ({Message}). Requisition remains securely committed in ClinicDb.", requisitionEvent.AccessionNumber, ex.Message);
        }
    }

    public async Task PublishExternalResultUploadedAsync(ExternalLabResultUploadedEvent uploadedEvent, CancellationToken cancellationToken = default)
    {
        try
        {
            await _publishEndpoint.Publish(uploadedEvent, cancellationToken);
            _logger.LogInformation("[ClinicEz.Clinic] Successfully published ExternalLabResultUploadedEvent #{AccessionNumber} to RabbitMQ", uploadedEvent.AccessionNumber);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[ClinicEz.Clinic] RabbitMQ publish notice: Could not dispatch external result upload event #{AccessionNumber} to broker ({Message}). Result remains securely committed in ClinicDb.", uploadedEvent.AccessionNumber, ex.Message);
        }
    }
}
