using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Shared.Interoperability;
using MassTransit;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Services;

public class PrescriptionPublisher : IPrescriptionPublisher
{
    private readonly IPublishEndpoint _publishEndpoint;
    private readonly ILogger<PrescriptionPublisher> _logger;

    public PrescriptionPublisher(IPublishEndpoint publishEndpoint, ILogger<PrescriptionPublisher> logger)
    {
        _publishEndpoint = publishEndpoint;
        _logger = logger;
    }

    public async Task PublishPrescriptionIssuedAsync(PrescriptionIssuedEvent prescriptionEvent, CancellationToken cancellationToken = default)
    {
        try
        {
            await _publishEndpoint.Publish(prescriptionEvent, cancellationToken);
            _logger.LogInformation("[ClinicEz.Clinic] Successfully published PrescriptionIssuedEvent #{PrescriptionNumber} to RabbitMQ", prescriptionEvent.PrescriptionNumber);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[ClinicEz.Clinic] RabbitMQ publish notice: Could not dispatch event #{PrescriptionNumber} to broker ({Message}). Prescription remains securely committed in ClinicDb.", prescriptionEvent.PrescriptionNumber, ex.Message);
        }
    }
}
