using System;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Infrastructure.Messaging.Handlers;
using ClinicEz.Comms.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace ClinicEz.Comms.Tests.Adversarial;

/// <summary>
/// Challenger Adversarial Test Suite for Milestone M5 Comms Guest Teleconsultation Relay:
/// Empirically stress-tests GuestInvite lockout state machine, attempt counter progression,
/// permanent lockout enforcement, expired invite guarding, and Zero-PHI LiveKit room and identity emission.
/// </summary>
public sealed class GuestTeleconsultCommsAdversarialTests
{
    private readonly Mock<IInteropPublisher> _publisherMock = new();

    [Fact]
    public async Task BruteForceLockout_FiveWrongAttempts_TransitionsStatusToLockedOut_AndSetsIsLockedOutTrue()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        const string correctDob = "1986-09-14";
        const string correctOtp = "123789";

        var invite = new GuestInvite
        {
            Id = inviteId,
            TenantId = "tenant-test",
            FacilityId = "fac-test",
            CallId = callId,
            InviteTokenHash = GuestInvite.ComputeTokenHash("token-brute-force"),
            ExpectedDobHash = GuestInvite.ComputeExpectedDobHash(inviteId, correctDob),
            OtpHash = GuestInvite.ComputeOtpHash(inviteId, correctOtp),
            ExpiresAtUtc = DateTime.UtcNow.AddHours(1),
            Status = GuestInviteStatus.Pending,
            AttemptCount = 0,
            IsLockedOut = false
        };

        db.GuestInvites.Add(invite);
        await db.SaveChangesAsync();

        var handler = new GuestCallJoinRequestedHandler(db, _publisherMock.Object, NullLogger<GuestCallJoinRequestedHandler>.Instance);

        for (int i = 1; i <= 5; i++)
        {
            var wrongPayload = new GuestCallJoinRequestedPayload(
                InviteId: inviteId,
                CallId: callId,
                DateOfBirth: correctDob,
                Otp: $"00000{i}",
                RequestedAtUtc: DateTime.UtcNow);

            var envelope = InteropEnvelope.Create(
                type: InteropTypes.GuestCallJoinRequested,
                from: Party.Portal,
                to: Party.ForFacility("tenant-test", "fac-test", FacilityType.Clinic, InteropServices.Comms),
                correlationId: callId,
                payload: wrongPayload);

            var context = new InteropMessageContext(envelope);
            await handler.HandleAsync(wrongPayload, context, CancellationToken.None);

            var current = await db.GuestInvites.FindAsync(inviteId);
            Assert.NotNull(current);
            Assert.Equal(i, current.AttemptCount);

            if (i < 5)
            {
                Assert.False(current.IsLockedOut, $"Attempt {i} must not trigger lockout yet.");
                Assert.Equal(GuestInviteStatus.Pending, current.Status);
            }
            else
            {
                // On 5th failure: verify IsLockedOut == true, status is LockedOut
                Assert.True(current.IsLockedOut, "Attempt 5 must trigger permanent lockout.");
                Assert.Equal(GuestInviteStatus.LockedOut, current.Status);
            }
        }

        // Verify media.room.requested was NEVER enqueued
        _publisherMock.Verify(p => p.Enqueue(
            InteropTypes.MediaRoomRequested,
            It.IsAny<Party>(),
            It.IsAny<Party>(),
            It.IsAny<Guid>(),
            It.IsAny<MediaRoomRequestedPayload>()), Times.Never);
    }

    [Fact]
    public async Task PermanentLockout_SixthAttemptWithCorrectCredentials_IsRefused_AndEmitsNoMediaRoom()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        const string correctDob = "1994-03-21";
        const string correctOtp = "654987";

        var invite = new GuestInvite
        {
            Id = inviteId,
            TenantId = "tenant-perm",
            FacilityId = "fac-perm",
            CallId = callId,
            InviteTokenHash = GuestInvite.ComputeTokenHash("token-perm"),
            ExpectedDobHash = GuestInvite.ComputeExpectedDobHash(inviteId, correctDob),
            OtpHash = GuestInvite.ComputeOtpHash(inviteId, correctOtp),
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(30),
            Status = GuestInviteStatus.Pending,
            AttemptCount = 0,
            IsLockedOut = false
        };

        db.GuestInvites.Add(invite);
        await db.SaveChangesAsync();

        var handler = new GuestCallJoinRequestedHandler(db, _publisherMock.Object, NullLogger<GuestCallJoinRequestedHandler>.Instance);

        // Exhaust 5 attempts
        for (int i = 0; i < 5; i++)
        {
            var wrongPayload = new GuestCallJoinRequestedPayload(
                InviteId: inviteId, CallId: callId, DateOfBirth: "1990-01-01", Otp: "000000", RequestedAtUtc: DateTime.UtcNow);

            var env = InteropEnvelope.Create(
                InteropTypes.GuestCallJoinRequested,
                Party.Portal,
                Party.ForFacility("tenant-perm", "fac-perm", FacilityType.Clinic, InteropServices.Comms),
                callId,
                wrongPayload);

            await handler.HandleAsync(wrongPayload, new InteropMessageContext(env), CancellationToken.None);
        }

        var lockedInvite = await db.GuestInvites.FindAsync(inviteId);
        Assert.NotNull(lockedInvite);
        Assert.True(lockedInvite.IsLockedOut);
        Assert.Equal(GuestInviteStatus.LockedOut, lockedInvite.Status);

        // 6th attempt with 100% CORRECT credentials
        var correctPayload = new GuestCallJoinRequestedPayload(
            InviteId: inviteId,
            CallId: callId,
            DateOfBirth: correctDob,
            Otp: correctOtp,
            RequestedAtUtc: DateTime.UtcNow);

        var correctEnv = InteropEnvelope.Create(
            InteropTypes.GuestCallJoinRequested,
            Party.Portal,
            Party.ForFacility("tenant-perm", "fac-perm", FacilityType.Clinic, InteropServices.Comms),
            callId,
            correctPayload);

        await handler.HandleAsync(correctPayload, new InteropMessageContext(correctEnv), CancellationToken.None);

        // Verify still locked out and no media room requested
        var postCheck = await db.GuestInvites.FindAsync(inviteId);
        Assert.NotNull(postCheck);
        Assert.True(postCheck.IsLockedOut);
        Assert.Equal(GuestInviteStatus.LockedOut, postCheck.Status);
        Assert.Null(postCheck.VerifiedAtUtc);

        _publisherMock.Verify(p => p.Enqueue(
            InteropTypes.MediaRoomRequested,
            It.IsAny<Party>(),
            It.IsAny<Party>(),
            It.IsAny<Guid>(),
            It.IsAny<MediaRoomRequestedPayload>()), Times.Never);
    }

    [Fact]
    public async Task ExpiredInvite_VerificationIsRefused_AndEmitsNoMediaRoom()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        const string correctDob = "1980-11-11";
        const string correctOtp = "111222";

        var invite = new GuestInvite
        {
            Id = inviteId,
            TenantId = "tenant-exp",
            FacilityId = "fac-exp",
            CallId = callId,
            InviteTokenHash = GuestInvite.ComputeTokenHash("token-exp"),
            ExpectedDobHash = GuestInvite.ComputeExpectedDobHash(inviteId, correctDob),
            OtpHash = GuestInvite.ComputeOtpHash(inviteId, correctOtp),
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(-5), // Expired 5 minutes ago
            Status = GuestInviteStatus.Expired,
            AttemptCount = 0,
            IsLockedOut = false
        };

        db.GuestInvites.Add(invite);
        await db.SaveChangesAsync();

        var handler = new GuestCallJoinRequestedHandler(db, _publisherMock.Object, NullLogger<GuestCallJoinRequestedHandler>.Instance);

        var payload = new GuestCallJoinRequestedPayload(
            InviteId: inviteId,
            CallId: callId,
            DateOfBirth: correctDob,
            Otp: correctOtp,
            RequestedAtUtc: DateTime.UtcNow);

        var env = InteropEnvelope.Create(
            InteropTypes.GuestCallJoinRequested,
            Party.Portal,
            Party.ForFacility("tenant-exp", "fac-exp", FacilityType.Clinic, InteropServices.Comms),
            callId,
            payload);

        await handler.HandleAsync(payload, new InteropMessageContext(env), CancellationToken.None);

        var updated = await db.GuestInvites.FindAsync(inviteId);
        Assert.NotNull(updated);
        Assert.Null(updated.VerifiedAtUtc);

        _publisherMock.Verify(p => p.Enqueue(
            InteropTypes.MediaRoomRequested,
            It.IsAny<Party>(),
            It.IsAny<Party>(),
            It.IsAny<Guid>(),
            It.IsAny<MediaRoomRequestedPayload>()), Times.Never);
    }

    [Fact]
    public async Task LiveKitTokenOpacity_EmittedMediaRoomRequested_HasOpaqueZeroPhiIdentifiers()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        const string correctDob = "1972-06-30";
        const string correctOtp = "776655";

        var invite = new GuestInvite
        {
            Id = inviteId,
            TenantId = "tenant-zero-phi",
            FacilityId = "fac-zero-phi",
            CallId = callId,
            InviteTokenHash = GuestInvite.ComputeTokenHash("token-phi"),
            ExpectedDobHash = GuestInvite.ComputeExpectedDobHash(inviteId, correctDob),
            OtpHash = GuestInvite.ComputeOtpHash(inviteId, correctOtp),
            ExpiresAtUtc = DateTime.UtcNow.AddHours(2),
            Status = GuestInviteStatus.Pending,
            AttemptCount = 0,
            IsLockedOut = false
        };

        db.GuestInvites.Add(invite);
        await db.SaveChangesAsync();

        var handler = new GuestCallJoinRequestedHandler(db, _publisherMock.Object, NullLogger<GuestCallJoinRequestedHandler>.Instance);

        var payload = new GuestCallJoinRequestedPayload(
            InviteId: inviteId,
            CallId: callId,
            DateOfBirth: correctDob,
            Otp: correctOtp,
            RequestedAtUtc: DateTime.UtcNow);

        var env = InteropEnvelope.Create(
            InteropTypes.GuestCallJoinRequested,
            Party.Portal,
            Party.ForFacility("tenant-zero-phi", "fac-zero-phi", FacilityType.Clinic, InteropServices.Comms),
            callId,
            payload);

        await handler.HandleAsync(payload, new InteropMessageContext(env), CancellationToken.None);

        // Verify media.room.requested was enqueued with strictly opaque identifiers
        _publisherMock.Verify(p => p.Enqueue(
            InteropTypes.MediaRoomRequested,
            It.IsAny<Party>(),
            Party.Media,
            callId,
            It.Is<MediaRoomRequestedPayload>(media =>
                // Room name must match ^call-[0-9a-fA-F\-]{32,36}$
                Regex.IsMatch(media.RoomName, @"^call-[0-9a-fA-F\-]{32,36}$") &&
                media.RoomName == $"call-{callId:N}" &&
                // Participant identity must match ^guest:otp-[0-9a-zA-Z\-_]{1,64}$
                media.ParticipantIdentities.Count == 1 &&
                Regex.IsMatch(media.ParticipantIdentities[0], @"^guest:otp-[0-9a-zA-Z\-_]{1,64}$") &&
                media.ParticipantIdentities[0] == $"guest:otp-{inviteId:N}" &&
                // Strictly no patient names, MRNs, or clinical text
                !media.ParticipantIdentities[0].Contains("patient", StringComparison.OrdinalIgnoreCase) &&
                !media.ParticipantIdentities[0].Contains("mrn", StringComparison.OrdinalIgnoreCase) &&
                !media.RoomName.Contains("patient", StringComparison.OrdinalIgnoreCase)
            )), Times.Once);
    }
}
