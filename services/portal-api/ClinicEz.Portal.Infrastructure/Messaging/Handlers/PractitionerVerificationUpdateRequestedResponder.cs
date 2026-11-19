using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.DirectoryVerification;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Infrastructure.Messaging.Handlers;

/// <summary>
/// Synchronous Interop responder for <c>practitioner.verification.update.requested</c>
/// (<c>InteropTypes.PractitionerVerificationUpdateRequested</c>).
/// Updates an active pending practitioner verification submission in place or returns a
/// <see cref="VerificationUpdateRespondedPayload"/> with <c>Conflict = true</c> if already reviewed/terminal.
/// Changes are left tracked on <c>ApplicationDbContext</c> so <c>InteropResponder</c> commits them atomically with the reply.
/// </summary>
public sealed class PractitionerVerificationUpdateRequestedResponder(
    IDirectoryVerificationPendingUpdater pendingUpdater,
    ILogger<PractitionerVerificationUpdateRequestedResponder> logger)
    : IInteropResponder<PractitionerVerificationUpdateRequestedPayload, VerificationUpdateRespondedPayload>
{
    public async Task<VerificationUpdateRespondedPayload> RespondAsync(
        PractitionerVerificationUpdateRequestedPayload payload,
        InteropMessageContext context,
        CancellationToken ct)
    {
        var sender = context.From;
        if (sender.Kind != PartyKind.Facility
            || !Guid.TryParse(sender.TenantId, out var senderTenantId)
            || !Guid.TryParse(sender.FacilityId, out var senderFacilityId)
            || !Guid.TryParse(payload.TenantId, out var payloadTenantId)
            || senderTenantId != payloadTenantId
            || senderFacilityId != payload.FacilityId)
        {
            logger.LogWarning(
                "Rejecting practitioner.verification.update.requested from {Sender}: sender does not match facility {FacilityId} / tenant {TenantId}.",
                sender.Address, payload.FacilityId, payload.TenantId);
            return new VerificationUpdateRespondedPayload
            {
                Succeeded = false,
                Conflict = false,
                ErrorCode = "unauthorized_sender",
                Message = "Sender identity does not match the target tenant or facility."
            };
        }

        return await pendingUpdater.ApplyPractitionerUpdateAsync(payload, sender.Address, ct);
    }
}
