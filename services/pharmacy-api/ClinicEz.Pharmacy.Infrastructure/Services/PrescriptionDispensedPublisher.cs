using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Application.Common.Interfaces;
using ClinicEz.Shared.Interoperability;
using MassTransit;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Pharmacy.Infrastructure.Services;

public class PrescriptionDispensedPublisher : IPrescriptionDispensedPublisher
{
    private readonly IPublishEndpoint _publishEndpoint;
    private readonly ILogger<PrescriptionDispensedPublisher> _logger;

    public PrescriptionDispensedPublisher(IPublishEndpoint publishEndpoint, ILogger<PrescriptionDispensedPublisher> logger)
    {
        _publishEndpoint = publishEndpoint;
        _logger = logger;
    }

    public async Task PublishPrescriptionDispensedAsync(PrescriptionDispensedEvent dispensedEvent, CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation(
                "[PrescriptionDispensedPublisher] Broadcasting PrescriptionDispensedEvent for Prescription {PrescriptionNo} (Pharmacist {PharmacistName}) to RabbitMQ",
                dispensedEvent.PrescriptionNumber, dispensedEvent.DispensingPharmacistName);

            await _publishEndpoint.Publish(dispensedEvent, cancellationToken);

            _logger.LogInformation(
                "[PrescriptionDispensedPublisher] Successfully published PrescriptionDispensedEvent for Prescription {PrescriptionNo}",
                dispensedEvent.PrescriptionNumber);
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "[PrescriptionDispensedPublisher] Failed to publish PrescriptionDispensedEvent for Prescription {PrescriptionNo}. Event will remain in outbox or local database.",
                dispensedEvent.PrescriptionNumber);
            // Non-blocking in offline / disconnected mode
        }
    }
}
