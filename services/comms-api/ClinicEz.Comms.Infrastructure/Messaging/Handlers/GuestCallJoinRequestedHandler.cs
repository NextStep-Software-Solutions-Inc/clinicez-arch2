using System;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Comms.Infrastructure.Messaging.Handlers;

/// <summary>
/// Ingests <c>comms.guest.call.join.requested</c> events from portal-api.
/// Performs constant-time verification of OTP + DOB against salted hashes on <see cref="GuestInvite"/>.
/// Enforces 5-attempt lockout and zero-PHI LiveKit room & identity conventions.
/// </summary>
public sealed class GuestCallJoinRequestedHandler : IInteropHandler<GuestCallJoinRequestedPayload>
{
    private readonly CommsDbContext _db;
    private readonly IInteropPublisher _publisher;
    private readonly ILogger<GuestCallJoinRequestedHandler> _logger;

    public GuestCallJoinRequestedHandler(
        CommsDbContext db,
        IInteropPublisher publisher,
        ILogger<GuestCallJoinRequestedHandler> logger)
    {
        _db = db;
        _publisher = publisher;
        _logger = logger;
    }

    public async Task HandleAsync(GuestCallJoinRequestedPayload message, InteropMessageContext context, CancellationToken ct)
    {
        _logger.LogInformation(
            "[GuestCallJoinRequestedHandler] Processing guest join request for Call {CallId}, Invite {InviteId}",
            message.CallId, message.InviteId);

        var invite = await _db.GuestInvites
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(i => i.Id == message.InviteId, ct);

        if (invite == null)
        {
            _logger.LogWarning("[GuestCallJoinRequestedHandler] Guest invite {InviteId} not found.", message.InviteId);
            return;
        }

        var now = DateTime.UtcNow;

        if (!invite.CanAttemptVerification(now))
        {
            if (invite.AttemptCount >= GuestInvite.MaxAllowedAttempts)
            {
                invite.IsLockedOut = true;
                invite.Status = GuestInviteStatus.LockedOut;
                await _db.SaveChangesAsync(ct);
            }

            _logger.LogWarning(
                "[GuestCallJoinRequestedHandler] Verification refused for Invite {InviteId} (Status: {Status}, Locked: {Locked}, Expired: {Expired})",
                invite.Id, invite.Status, invite.IsLockedOut, now > invite.ExpiresAtUtc);
            return;
        }

        // Constant-time hash verification
        var computedDobHash = GuestInvite.ComputeExpectedDobHash(invite.Id, message.DateOfBirth);
        var computedOtpHash = GuestInvite.ComputeOtpHash(invite.Id, message.Otp);

        var dobMatches = CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(computedDobHash),
            Encoding.UTF8.GetBytes(invite.ExpectedDobHash));

        var otpMatches = CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(computedOtpHash),
            Encoding.UTF8.GetBytes(invite.OtpHash));

        if (!dobMatches || !otpMatches)
        {
            invite.AttemptCount++;
            if (invite.AttemptCount >= GuestInvite.MaxAllowedAttempts)
            {
                invite.IsLockedOut = true;
                invite.Status = GuestInviteStatus.LockedOut;
                _logger.LogWarning(
                    "[GuestCallJoinRequestedHandler] Invite {InviteId} permanently locked out after {Count} failed attempts.",
                    invite.Id, invite.AttemptCount);
            }
            else
            {
                _logger.LogWarning(
                    "[GuestCallJoinRequestedHandler] Verification failed for Invite {InviteId}. Attempt {Count}/{Max}.",
                    invite.Id, invite.AttemptCount, GuestInvite.MaxAllowedAttempts);
            }

            await _db.SaveChangesAsync(ct);
            return;
        }

        // Successful verification
        invite.Status = GuestInviteStatus.Verified;
        invite.VerifiedAtUtc = now;
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "[GuestCallJoinRequestedHandler] Invite {InviteId} successfully verified for Call {CallId}.",
            invite.Id, invite.CallId);

        // Enqueue media.room.requested with Zero-PHI Room and Participant identity
        var roomName = $"call-{invite.CallId:N}";
        var guestIdentity = $"guest:otp-{invite.Id:N}";

        var mediaRequest = new MediaRoomRequestedPayload(
            TenantId: invite.TenantId,
            CallId: invite.CallId,
            RoomName: roomName,
            ParticipantIdentities: [guestIdentity]
        );

        _publisher.Enqueue(
            InteropTypes.MediaRoomRequested,
            Party.ForFacility(invite.TenantId, invite.FacilityId, FacilityType.Clinic, InteropServices.Comms),
            Party.Media,
            invite.CallId,
            mediaRequest
        );

        await _db.SaveChangesAsync(ct);
    }
}
