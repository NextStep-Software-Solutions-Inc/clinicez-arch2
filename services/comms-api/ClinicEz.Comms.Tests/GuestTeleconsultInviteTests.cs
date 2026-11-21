using System;
using System.Security.Cryptography;
using System.Text;
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

namespace ClinicEz.Comms.Tests;

public class GuestTeleconsultInviteTests
{
    private readonly Mock<IInteropPublisher> _publisherMock = new();

    [Fact]
    public void GuestInvite_HashingHelpers_AreDeterministic_AndSalted()
    {
        var inviteId = Guid.NewGuid();
        const string rawToken = "my-secret-token-123";
        const string dob = "1990-05-15";
        const string otp = "654321";

        var tokenHash1 = GuestInvite.ComputeTokenHash(rawToken);
        var tokenHash2 = GuestInvite.ComputeTokenHash(rawToken);
        Assert.Equal(tokenHash1, tokenHash2);
        Assert.Equal(64, tokenHash1.Length); // 256 bits = 64 hex chars

        var dobHash1 = GuestInvite.ComputeExpectedDobHash(inviteId, dob);
        var dobHash2 = GuestInvite.ComputeExpectedDobHash(inviteId, dob);
        Assert.Equal(dobHash1, dobHash2);

        // Different inviteId must yield different hash for same DOB (salted with InviteId)
        var differentInviteId = Guid.NewGuid();
        var dobHashDifferentInvite = GuestInvite.ComputeExpectedDobHash(differentInviteId, dob);
        Assert.NotEqual(dobHash1, dobHashDifferentInvite);

        var otpHash1 = GuestInvite.ComputeOtpHash(inviteId, otp);
        var otpHash2 = GuestInvite.ComputeOtpHash(inviteId, otp);
        Assert.Equal(otpHash1, otpHash2);

        var otpHashDifferentInvite = GuestInvite.ComputeOtpHash(differentInviteId, otp);
        Assert.NotEqual(otpHash1, otpHashDifferentInvite);
    }

    [Fact]
    public void GuestInvite_CanAttemptVerification_EnforcesExpirationAndLockout()
    {
        var invite = new GuestInvite
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            CallId = Guid.NewGuid(),
            InviteTokenHash = "abc",
            ExpectedDobHash = "def",
            OtpHash = "123",
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(30),
            Status = GuestInviteStatus.Pending,
            AttemptCount = 0,
            IsLockedOut = false
        };

        var now = DateTime.UtcNow;
        Assert.True(invite.CanAttemptVerification(now));

        // When locked out
        invite.IsLockedOut = true;
        Assert.False(invite.CanAttemptVerification(now));

        // Reset lockout, but max attempts reached
        invite.IsLockedOut = false;
        invite.AttemptCount = 5;
        Assert.False(invite.CanAttemptVerification(now));

        // Reset attempts, but expired
        invite.AttemptCount = 0;
        invite.ExpiresAtUtc = now.AddMinutes(-1);
        Assert.False(invite.CanAttemptVerification(now));
    }

    [Fact]
    public async Task GuestCallJoinRequestedHandler_WrongDobOrOtp_IncrementsAttemptCount_NoMediaRequested()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        const string correctDob = "1985-07-20";
        const string correctOtp = "123456";

        var invite = new GuestInvite
        {
            Id = inviteId,
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            CallId = callId,
            InviteTokenHash = GuestInvite.ComputeTokenHash("token-123"),
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

        // Submit wrong OTP
        var payload = new GuestCallJoinRequestedPayload(
            InviteId: inviteId,
            CallId: callId,
            DateOfBirth: correctDob,
            Otp: "999999",
            RequestedAtUtc: DateTime.UtcNow
        );

        var envelope = InteropEnvelope.Create(
            type: InteropTypes.GuestCallJoinRequested,
            from: Party.Portal,
            to: Party.ForFacility("tenant-1", "fac-1", FacilityType.Clinic, InteropServices.Comms),
            correlationId: callId,
            payload: payload);

        var context = new InteropMessageContext(envelope);

        await handler.HandleAsync(payload, context, CancellationToken.None);

        var updated = await db.GuestInvites.FindAsync(inviteId);
        Assert.NotNull(updated);
        Assert.Equal(1, updated.AttemptCount);
        Assert.False(updated.IsLockedOut);
        Assert.Equal(GuestInviteStatus.Pending, updated.Status);

        // Verify media.room.requested was NOT emitted
        _publisherMock.Verify(p => p.Enqueue(
            InteropTypes.MediaRoomRequested,
            It.IsAny<Party>(),
            It.IsAny<Party>(),
            It.IsAny<Guid>(),
            It.IsAny<MediaRoomRequestedPayload>()), Times.Never);
    }

    [Fact]
    public async Task GuestCallJoinRequestedHandler_FiveFailedAttempts_PermanentlyLocksOut()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        const string correctDob = "1990-12-05";
        const string correctOtp = "654321";

        var invite = new GuestInvite
        {
            Id = inviteId,
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            CallId = callId,
            InviteTokenHash = GuestInvite.ComputeTokenHash("token-lockout"),
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

        var wrongPayload = new GuestCallJoinRequestedPayload(
            InviteId: inviteId,
            CallId: callId,
            DateOfBirth: correctDob,
            Otp: "000000",
            RequestedAtUtc: DateTime.UtcNow
        );

        var envelope = InteropEnvelope.Create(
            type: InteropTypes.GuestCallJoinRequested,
            from: Party.Portal,
            to: Party.ForFacility("tenant-1", "fac-1", FacilityType.Clinic, InteropServices.Comms),
            correlationId: callId,
            payload: wrongPayload);

        var context = new InteropMessageContext(envelope);

        for (int i = 0; i < 5; i++)
        {
            await handler.HandleAsync(wrongPayload, context, CancellationToken.None);
        }

        var updated = await db.GuestInvites.FindAsync(inviteId);
        Assert.NotNull(updated);
        Assert.Equal(5, updated.AttemptCount);
        Assert.True(updated.IsLockedOut);
        Assert.Equal(GuestInviteStatus.LockedOut, updated.Status);

        // Even with correct credentials now, verification is refused
        var correctPayload = new GuestCallJoinRequestedPayload(
            InviteId: inviteId,
            CallId: callId,
            DateOfBirth: correctDob,
            Otp: correctOtp,
            RequestedAtUtc: DateTime.UtcNow
        );

        await handler.HandleAsync(correctPayload, context, CancellationToken.None);

        _publisherMock.Verify(p => p.Enqueue(
            InteropTypes.MediaRoomRequested,
            It.IsAny<Party>(),
            It.IsAny<Party>(),
            It.IsAny<Guid>(),
            It.IsAny<MediaRoomRequestedPayload>()), Times.Never);
    }

    [Fact]
    public async Task GuestCallJoinRequestedHandler_SuccessfulVerification_EnqueuesZeroPhiMediaRoomRequested()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var inviteId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        const string correctDob = "1975-03-30";
        const string correctOtp = "789123";

        var invite = new GuestInvite
        {
            Id = inviteId,
            TenantId = "tenant-metro",
            FacilityId = "fac-clinic",
            CallId = callId,
            InviteTokenHash = GuestInvite.ComputeTokenHash("valid-join-token"),
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

        var payload = new GuestCallJoinRequestedPayload(
            InviteId: inviteId,
            CallId: callId,
            DateOfBirth: correctDob,
            Otp: correctOtp,
            RequestedAtUtc: DateTime.UtcNow
        );

        var envelope = InteropEnvelope.Create(
            type: InteropTypes.GuestCallJoinRequested,
            from: Party.Portal,
            to: Party.ForFacility("tenant-metro", "fac-clinic", FacilityType.Clinic, InteropServices.Comms),
            correlationId: callId,
            payload: payload);

        var context = new InteropMessageContext(envelope);

        await handler.HandleAsync(payload, context, CancellationToken.None);

        var updated = await db.GuestInvites.FindAsync(inviteId);
        Assert.NotNull(updated);
        Assert.Equal(GuestInviteStatus.Verified, updated.Status);
        Assert.NotNull(updated.VerifiedAtUtc);
        Assert.False(updated.IsLockedOut);

        // Verify media.room.requested was enqueued with Zero-PHI Room and Participant identity
        _publisherMock.Verify(p => p.Enqueue(
            InteropTypes.MediaRoomRequested,
            It.Is<Party>(party => party.TenantId == "tenant-metro" && party.FacilityId == "fac-clinic"),
            Party.Media,
            callId,
            It.Is<MediaRoomRequestedPayload>(media =>
                media.RoomName == $"call-{callId:N}" &&
                media.ParticipantIdentities.Count == 1 &&
                media.ParticipantIdentities[0] == $"guest:otp-{inviteId:N}"
            )), Times.Once);
    }
}
