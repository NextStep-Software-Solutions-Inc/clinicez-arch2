using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Guest;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Infrastructure.Messaging.Handlers;

/// <summary>
/// Handles <c>portal.teleconsult.guest_invite_issued</c> (<c>InteropTypes.GuestTeleconsultInviteIssued</c>).
/// Registers pre-hashed guest credentials into the in-memory verification store.
/// </summary>
public sealed class GuestTeleconsultInviteIssuedHandler(
    IGuestVerificationService verificationService,
    ILogger<GuestTeleconsultInviteIssuedHandler> logger) : IInteropHandler<GuestTeleconsultInviteIssuedPayload>
{
    public Task HandleAsync(GuestTeleconsultInviteIssuedPayload payload, InteropMessageContext context, CancellationToken ct)
    {
        if (payload is null)
        {
            logger.LogWarning("[GuestTeleconsultInviteIssuedHandler] Received null payload. Skipping.");
            return Task.CompletedTask;
        }

        logger.LogInformation(
            "[GuestTeleconsultInviteIssuedHandler] Registering pre-hashed guest invite for Appointment {AppointmentId}, Call {CallId}, Facility {FacilityId}.",
            payload.AppointmentId, payload.CallId, payload.FacilityId);

        verificationService.RegisterPreHashedInvite(
            inviteId: payload.AppointmentId,
            tenantId: payload.TenantId,
            facilityId: payload.FacilityId,
            callId: payload.CallId,
            inviteTokenHash: payload.InviteTokenHash,
            expectedDobHash: payload.ExpectedDobHash,
            otpHash: payload.OtpHash,
            expiresAtUtc: payload.ExpiresAtUtc);

        return Task.CompletedTask;
    }
}
