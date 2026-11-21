using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Infrastructure.Messaging.Handlers;

/// <summary>
/// Handles <c>portal.teleconsult.guest_invite_revoked</c> (<c>InteropTypes.GuestTeleconsultInviteRevoked</c>) from facilities.
/// Immediately marks any matching active guest invites as revoked so preflight checks and join attempts return HTTP 410 Gone.
/// </summary>
public sealed class GuestTeleconsultInviteRevokedHandler(
    IGuestVerificationService verificationService,
    ILogger<GuestTeleconsultInviteRevokedHandler> logger) : IInteropHandler<GuestTeleconsultInviteRevokedPayload>
{
    public Task HandleAsync(GuestTeleconsultInviteRevokedPayload payload, InteropMessageContext context, CancellationToken ct)
    {
        if (payload is null)
        {
            logger.LogWarning("[GuestTeleconsultInviteRevokedHandler] Received null payload. Skipping.");
            return Task.CompletedTask;
        }

        logger.LogInformation(
            "[GuestTeleconsultInviteRevokedHandler] Revoking guest invite for CallId {CallId}, Reason: {Reason}.",
            payload.CallId, payload.Reason);

        verificationService.RevokeInviteByCall(payload.CallId, payload.Reason, payload.RevokedAtUtc);

        return Task.CompletedTask;
    }
}
