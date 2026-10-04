using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Shared.Common;
using MassTransit;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Services;

public sealed class ClinicRecordEventPublisher : IClinicRecordEventPublisher
{
    private readonly IPublishEndpoint _publishEndpoint;
    private readonly ILogger<ClinicRecordEventPublisher> _logger;

    public ClinicRecordEventPublisher(IPublishEndpoint publishEndpoint, ILogger<ClinicRecordEventPublisher> logger)
    {
        _publishEndpoint = publishEndpoint;
        _logger = logger;
    }

    public async Task PublishRecordVerifiedAsync(ClinicRecordVerifiedEvent recordEvent, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation(
            "Publishing ClinicRecordVerifiedEvent for Attachment {AttachmentId}, Patient {PatientId}, Status {Status}",
            recordEvent.AttachmentId, recordEvent.PatientId, recordEvent.VerificationStatus);

        await _publishEndpoint.Publish(recordEvent, cancellationToken);
    }
}
