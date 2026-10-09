using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Services;

public sealed class ClinicRecordEventPublisher : IClinicRecordEventPublisher
{
    private readonly IInteropPublisher _publisher;
    private readonly ClinicPatientAddressResolver _addresses;
    private readonly ILogger<ClinicRecordEventPublisher> _logger;

    public ClinicRecordEventPublisher(
        IInteropPublisher publisher,
        ClinicPatientAddressResolver addresses,
        ILogger<ClinicRecordEventPublisher> logger)
    {
        _publisher = publisher;
        _addresses = addresses;
        _logger = logger;
    }

    public async Task<bool> PublishRecordVerifiedAsync(ClinicRecordVerifiedEvent recordEvent, CancellationToken cancellationToken = default)
    {
        var address = await _addresses.ResolveAsync(recordEvent.ClinicId, recordEvent.PatientId, cancellationToken);
        if (address == null)
        {
            _logger.LogInformation(
                "Record {AttachmentId} verified; patient {PatientId} has no patient-app account to notify.",
                recordEvent.AttachmentId, recordEvent.PatientId);
            return false;
        }

        _publisher.Enqueue(
            InteropTypes.ClinicRecordVerified,
            address.From,
            address.To,
            recordEvent.AttachmentId,
            recordEvent with { PatientId = address.SyncPatientId });
        return true;
    }
}
