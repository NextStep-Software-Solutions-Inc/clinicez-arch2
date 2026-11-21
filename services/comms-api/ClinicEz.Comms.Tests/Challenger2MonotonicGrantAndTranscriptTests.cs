using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Domain.Enums;
using ClinicEz.Comms.Infrastructure.Messaging.Handlers;
using ClinicEz.Comms.Infrastructure.Services;
using ClinicEz.Comms.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace ClinicEz.Comms.Tests;

/// <summary>
/// Empirical Adversarial Verification Suite for Challenger 2 (Milestone M3):
/// 1. Monotonic Outbox Grants & Network Delivery Race Conditions (v1 arriving after v2, duplicate v2, tombstone resurrection defense).
/// 2. Transcript Archival Stripping & SHA-256 Integrity Verification (zero internal notes, zero unapproved attachments, bit-level integrity).
/// 3. CommsTicketValidator Cryptographic Guardrails (tampered signature, tampered payload, expired, future nbf/iat, tenant/facility mismatch).
/// </summary>
public class Challenger2MonotonicGrantAndTranscriptTests
{
    private readonly Mock<IInteropPublisher> _publisherMock = new();
    private readonly TranscriptSerializer _serializer = new();
    private const string TenantId = "tenant-stjude";
    private const string FacilityId = "clinic-main";

    // =========================================================================
    // SECTION 1: MONOTONIC GRANTS & RACE CONDITION ADVERSARIAL STRESS TESTS
    // =========================================================================

    [Fact]
    public async Task Grant_OutOfOrderDelivery_V1ArrivingAfterV2_IsSafelyDroppedWithoutRegressingState()
    {
        // ARRANGE: Database starts with active Grant at Version 2 (e.g. rescheduled appointment)
        var db = TestDbContextFactory.CreateInMemory();
        var grantId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        var v2Start = now.AddDays(5);
        var v2End = now.AddDays(12);

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = grantId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            FacilityType = "Clinic",
            PatientId = patientId,
            ContextType = "Appointment",
            ContextId = "appt-v2",
            WindowStartUtc = v2Start,
            WindowEndUtc = v2End,
            IsActive = true,
            Version = 2,
            CreatedAtUtc = now.AddHours(-1)
        });
        await db.SaveChangesAsync();

        var logger = new Mock<ILogger<CommsEligibilityGrantedHandler>>();
        var handler = new CommsEligibilityGrantedHandler(db, _publisherMock.Object, logger.Object);

        // ACT: Stale network delivery arrives with Version 1 (earlier original booking)
        var staleV1Payload = new CommsEligibilityGrantedPayload(
            GrantId: grantId,
            TenantId: TenantId,
            FacilityId: FacilityId,
            FacilityType: "Clinic",
            PatientId: patientId,
            ContextType: "Appointment",
            ContextId: "appt-v1-stale",
            WindowStartUtc: now.AddDays(1),
            WindowEndUtc: now.AddDays(8),
            Version: 1);

        var ctx = new InteropMessageContext(new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            Type = InteropTypes.CommsEligibilityGranted,
            From = Party.ForFacility(TenantId, FacilityId, FacilityType.Clinic),
            To = Party.ForFacility(TenantId, FacilityId, FacilityType.Clinic, service: InteropServices.Comms),
            CorrelationId = grantId
        });

        await handler.HandleAsync(staleV1Payload, ctx, CancellationToken.None);

        // ASSERT: Version remains 2, Context remains appt-v2, Window dates NOT regressed
        var grant = await db.EligibilityGrants.FindAsync(grantId);
        Assert.NotNull(grant);
        Assert.Equal(2, grant.Version);
        Assert.Equal("appt-v2", grant.ContextId);
        Assert.Equal(v2Start, grant.WindowStartUtc);
        Assert.Equal(v2End, grant.WindowEndUtc);
        Assert.True(grant.IsActive);

        // Zero sync notifications forwarded to patient on dropped stale delivery
        _publisherMock.Verify(p => p.Enqueue(
            It.IsAny<string>(),
            It.IsAny<Party>(),
            It.IsAny<Party>(),
            It.IsAny<Guid>(),
            It.IsAny<object>(),
            It.IsAny<int>(),
            It.IsAny<TimeSpan?>()), Times.Never);
    }

    [Fact]
    public async Task Grant_DuplicateDelivery_SameVersion_IsIdempotentlyDropped()
    {
        // ARRANGE: Database has grant at Version 3
        var db = TestDbContextFactory.CreateInMemory();
        var grantId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = grantId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            FacilityType = "Clinic",
            PatientId = patientId,
            ContextType = "Encounter",
            ContextId = "enc-101",
            WindowStartUtc = now,
            WindowEndUtc = now.AddDays(14),
            IsActive = true,
            Version = 3,
            CreatedAtUtc = now
        });
        await db.SaveChangesAsync();

        var logger = new Mock<ILogger<CommsEligibilityGrantedHandler>>();
        var handler = new CommsEligibilityGrantedHandler(db, _publisherMock.Object, logger.Object);

        // ACT: Re-delivery of identical Version 3
        var duplicatePayload = new CommsEligibilityGrantedPayload(
            GrantId: grantId,
            TenantId: TenantId,
            FacilityId: FacilityId,
            FacilityType: "Clinic",
            PatientId: patientId,
            ContextType: "Encounter",
            ContextId: "enc-101",
            WindowStartUtc: now,
            WindowEndUtc: now.AddDays(14),
            Version: 3);

        var ctx = new InteropMessageContext(new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            Type = InteropTypes.CommsEligibilityGranted,
            From = Party.ForFacility(TenantId, FacilityId, FacilityType.Clinic),
            To = Party.ForFacility(TenantId, FacilityId, FacilityType.Clinic, service: InteropServices.Comms),
            CorrelationId = grantId
        });

        await handler.HandleAsync(duplicatePayload, ctx, CancellationToken.None);

        // ASSERT: Grant remains unchanged, no duplicate sync notification
        var grant = await db.EligibilityGrants.FindAsync(grantId);
        Assert.NotNull(grant);
        Assert.Equal(3, grant.Version);
        _publisherMock.Verify(p => p.Enqueue(
            It.IsAny<string>(),
            It.IsAny<Party>(),
            It.IsAny<Party>(),
            It.IsAny<Guid>(),
            It.IsAny<object>(),
            It.IsAny<int>(),
            It.IsAny<TimeSpan?>()), Times.Never);
    }

    [Fact]
    public async Task Grant_TombstoneResurrectionDefense_RevocationV2ArrivingBeforeGrantV1_BlocksV1Creation()
    {
        // ARRANGE: Appointment was created (v1) and cancelled immediately (v2), but network delivers v2 FIRST!
        var db = TestDbContextFactory.CreateInMemory();
        var grantId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        var revokeLogger = new Mock<ILogger<CommsEligibilityRevokedHandler>>();
        var revokeHandler = new CommsEligibilityRevokedHandler(db, _publisherMock.Object, revokeLogger.Object);

        var v2RevokePayload = new CommsEligibilityRevokedPayload(
            GrantId: grantId,
            TenantId: TenantId,
            FacilityId: FacilityId,
            PatientId: patientId,
            Reason: "Patient cancelled immediately",
            RevokedAtUtc: now,
            Version: 2);

        var ctxRevoke = new InteropMessageContext(new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            Type = InteropTypes.CommsEligibilityRevoked,
            From = Party.ForFacility(TenantId, FacilityId, FacilityType.Clinic),
            To = Party.ForFacility(TenantId, FacilityId, FacilityType.Clinic, service: InteropServices.Comms),
            CorrelationId = grantId
        });

        // 1. Process v2 Revocation first
        await revokeHandler.HandleAsync(v2RevokePayload, ctxRevoke, CancellationToken.None);

        // Verify tombstone created
        var tombstone = await db.EligibilityGrants.FindAsync(grantId);
        Assert.NotNull(tombstone);
        Assert.False(tombstone.IsActive);
        Assert.Equal(2, tombstone.Version);

        // 2. Delayed original v1 Grant now arrives
        var grantLogger = new Mock<ILogger<CommsEligibilityGrantedHandler>>();
        var grantHandler = new CommsEligibilityGrantedHandler(db, _publisherMock.Object, grantLogger.Object);

        var delayedV1Payload = new CommsEligibilityGrantedPayload(
            GrantId: grantId,
            TenantId: TenantId,
            FacilityId: FacilityId,
            FacilityType: "Clinic",
            PatientId: patientId,
            ContextType: "Appointment",
            ContextId: "appt-old",
            WindowStartUtc: now,
            WindowEndUtc: now.AddDays(7),
            Version: 1);

        var ctxGrant = new InteropMessageContext(new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            Type = InteropTypes.CommsEligibilityGranted,
            From = Party.ForFacility(TenantId, FacilityId, FacilityType.Clinic),
            To = Party.ForFacility(TenantId, FacilityId, FacilityType.Clinic, service: InteropServices.Comms),
            CorrelationId = grantId
        });

        await grantHandler.HandleAsync(delayedV1Payload, ctxGrant, CancellationToken.None);

        // ASSERT: Tombstone prevented delayed grant from resurrecting an inactive appointment!
        var finalGrant = await db.EligibilityGrants.FindAsync(grantId);
        Assert.NotNull(finalGrant);
        Assert.False(finalGrant.IsActive, "stale v1 grant must NEVER resurrect a v2-revoked tombstone");
        Assert.Equal(2, finalGrant.Version);
        Assert.Equal("Patient cancelled immediately", finalGrant.RevokeReason);
    }

    [Fact]
    public async Task Grant_ReGrantAfterRevocation_V3GrantOverwritesV2Revocation()
    {
        // ARRANGE: Inactive grant at Version 2 (cancelled)
        var db = TestDbContextFactory.CreateInMemory();
        var grantId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = grantId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            FacilityType = "Clinic",
            PatientId = patientId,
            ContextType = "Appointment",
            ContextId = "appt-orig",
            WindowStartUtc = now.AddDays(-5),
            WindowEndUtc = now.AddDays(2),
            IsActive = false,
            RevokedAtUtc = now.AddDays(-1),
            RevokeReason = "Cancelled by staff",
            Version = 2,
            CreatedAtUtc = now.AddDays(-5)
        });
        await db.SaveChangesAsync();

        var logger = new Mock<ILogger<CommsEligibilityGrantedHandler>>();
        var handler = new CommsEligibilityGrantedHandler(db, _publisherMock.Object, logger.Object);

        // ACT: Patient re-books appointment with new date (Version 3)
        var v3Start = now.AddDays(3);
        var v3End = now.AddDays(10);
        var v3Payload = new CommsEligibilityGrantedPayload(
            GrantId: grantId,
            TenantId: TenantId,
            FacilityId: FacilityId,
            FacilityType: "Clinic",
            PatientId: patientId,
            ContextType: "Appointment",
            ContextId: "appt-rebooked",
            WindowStartUtc: v3Start,
            WindowEndUtc: v3End,
            Version: 3);

        var ctx = new InteropMessageContext(new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            Type = InteropTypes.CommsEligibilityGranted,
            From = Party.ForFacility(TenantId, FacilityId, FacilityType.Clinic),
            To = Party.ForFacility(TenantId, FacilityId, FacilityType.Clinic, service: InteropServices.Comms),
            CorrelationId = grantId
        });

        await handler.HandleAsync(v3Payload, ctx, CancellationToken.None);

        // ASSERT: Successfully reactivated
        var updated = await db.EligibilityGrants.FindAsync(grantId);
        Assert.NotNull(updated);
        Assert.True(updated.IsActive, "v3 grant successfully reactivates v2-revoked grant");
        Assert.Equal(3, updated.Version);
        Assert.Null(updated.RevokedAtUtc);
        Assert.Null(updated.RevokeReason);
        Assert.Equal("appt-rebooked", updated.ContextId);
        Assert.Equal(v3Start, updated.WindowStartUtc);
        Assert.Equal(v3End, updated.WindowEndUtc);

        // Verification: sync notification sent
        _publisherMock.Verify(p => p.Enqueue(
            InteropTypes.CommsEligibilitySynced,
            It.IsAny<Party>(),
            It.IsAny<Party>(),
            grantId,
            It.Is<CommsEligibilitySyncedPayload>(s => s.IsActive && s.Version == 3),
            It.IsAny<int>(),
            It.IsAny<TimeSpan?>()), Times.Once);
    }

    // =========================================================================
    // SECTION 2: TRANSCRIPT ARCHIVAL STRIPPING & SHA-256 INTEGRITY ADVERSARIAL TESTS
    // =========================================================================

    [Fact]
    public void TranscriptSerializer_MixedVisibilityAndDirtyAttachments_CompletelyStripsInternalNotesAndDirtyFiles()
    {
        var convId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        var conv = new Conversation
        {
            Id = convId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            PatientId = patientId,
            Title = "Followup on Lab Results",
            Category = MessageCategory.LabResultQuestion,
            Status = RequestStatus.Closed,
            TriageDisposition = TriageDisposition.Answered,
            CreatedAtUtc = now.AddHours(-3),
            ClosedAtUtc = now,
            ClosedBy = "Dr. Santos"
        };

        var participants = new List<Participant>
        {
            new() { Id = Guid.NewGuid(), ConversationId = convId, TenantId = TenantId, ParticipantId = patientId.ToString(), DisplayName = "John Doe", Role = "Patient" },
            new() { Id = Guid.NewGuid(), ConversationId = convId, TenantId = TenantId, ParticipantId = "nurse-1", DisplayName = "Nurse Kelly", Role = "Staff" },
            new() { Id = Guid.NewGuid(), ConversationId = convId, TenantId = TenantId, ParticipantId = "doc-1", DisplayName = "Dr. Santos", Role = "Staff" }
        };

        var cleanAtt = new MessageAttachment
        {
            Id = Guid.NewGuid(),
            SafeFileName = "lab_report.pdf",
            ContentType = "application/pdf",
            OriginalSizeBytes = 1024,
            SanitizedSizeBytes = 1000,
            Status = AttachmentStatus.Clean,
            SHA256Checksum = "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0"
        };

        var infectedAtt = new MessageAttachment
        {
            Id = Guid.NewGuid(),
            SafeFileName = "malware_exploit.exe",
            ContentType = "application/x-msdownload",
            OriginalSizeBytes = 2048,
            Status = AttachmentStatus.Quarantined, // DIRTY / QUARANTINED
            SHA256Checksum = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
        };

        var messages = new List<Message>
        {
            new()
            {
                Id = Guid.NewGuid(),
                ConversationId = convId,
                Seq = 1,
                SenderDisplayName = "John Doe",
                SenderType = "Patient",
                ContentText = "Are my CBC results normal?",
                Visibility = MessageVisibility.Public,
                ServerReceivedAtUtc = now.AddHours(-3)
            },
            new()
            {
                Id = Guid.NewGuid(),
                ConversationId = convId,
                Seq = 2,
                SenderDisplayName = "Nurse Kelly",
                SenderType = "Staff",
                ContentText = "CRITICAL INTERNAL NOTE: Patient owes 1,500 PHP from previous visit. Keep answers brief.",
                Visibility = MessageVisibility.Internal, // STRICTLY INTERNAL NOTE
                ServerReceivedAtUtc = now.AddHours(-2)
            },
            new()
            {
                Id = Guid.NewGuid(),
                ConversationId = convId,
                Seq = 3,
                SenderDisplayName = "Dr. Santos",
                SenderType = "Staff",
                ContentText = "Yes, your white blood cell count and hemoglobin are within normal limits. See attached report.",
                Visibility = MessageVisibility.Public,
                ServerReceivedAtUtc = now.AddHours(-1),
                Attachments = [cleanAtt, infectedAtt]
            },
            new()
            {
                Id = Guid.NewGuid(),
                ConversationId = convId,
                Seq = 4,
                SenderDisplayName = "Dr. Santos",
                SenderType = "Staff",
                ContentText = "INTERNAL CLINICIAN OBSERVATION: Suspected early signs of non-compliance, flag for in-person review.",
                Visibility = MessageVisibility.Internal, // ANOTHER INTERNAL NOTE
                ServerReceivedAtUtc = now.AddMinutes(-30)
            }
        };

        // ACT: Serialize transcript
        var serialized = _serializer.Serialize(conv, participants, messages);

        // ASSERT 1: Exactly 2 public messages exported, zero internal notes
        Assert.Equal(2, serialized.Document.Messages.Count);
        Assert.Equal(new[] { 1L, 3L }, serialized.Document.Messages.Select(m => m.Seq));

        // ASSERT 2: Internal notes are completely absent from JSON and Markdown
        Assert.DoesNotContain("CRITICAL INTERNAL NOTE", serialized.Json);
        Assert.DoesNotContain("INTERNAL CLINICIAN OBSERVATION", serialized.Json);
        Assert.DoesNotContain("Patient owes 1,500 PHP", serialized.Json);
        Assert.DoesNotContain("CRITICAL INTERNAL NOTE", serialized.Markdown);
        Assert.DoesNotContain("INTERNAL CLINICIAN OBSERVATION", serialized.Markdown);
        Assert.DoesNotContain("Patient owes 1,500 PHP", serialized.Markdown);

        // Public content must be present
        Assert.Contains("Are my CBC results normal?", serialized.Markdown);
        Assert.Contains("within normal limits", serialized.Markdown);

        // ASSERT 3: Infected / Quarantined attachment is stripped; clean attachment is included
        var publicMsgWithAtt = serialized.Document.Messages.Single(m => m.Seq == 3);
        Assert.Single(publicMsgWithAtt.Attachments);
        Assert.Equal("lab_report.pdf", publicMsgWithAtt.Attachments[0].SafeFileName);
        Assert.DoesNotContain("malware_exploit.exe", serialized.Json);
        Assert.DoesNotContain("malware_exploit.exe", serialized.Markdown);

        // ASSERT 4: SHA-256 integrity verification
        Assert.Equal(64, serialized.Sha256.Length);
        Assert.Matches("^[0-9a-f]{64}$", serialized.Sha256);
        Assert.Equal(serialized.Sha256, serialized.Document.TranscriptSha256);

        // Oracle verification: Modifying even one byte of the document invalidates the SHA-256 hash
        var tamperedJson = serialized.Json.Replace("normal limits", "ABNORMAL LIMITS");
        var tamperedHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(tamperedJson))).ToLowerInvariant();
        Assert.NotEqual(serialized.Sha256, tamperedHash);
    }

    // =========================================================================
    // SECTION 3: COMMS TICKET VALIDATOR CRYPTOGRAPHIC ADVERSARIAL STRESS TESTS
    // =========================================================================

    [Fact]
    public void CommsTicketValidator_TamperedSignature_IsRejected()
    {
        using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var privKey = ecdsa.ExportECPrivateKeyPem();
        var pubKey = ecdsa.ExportSubjectPublicKeyInfoPem();

        var (ticket, _) = CommsTicketSigner.IssueTicket(
            clientId: "clinic-test-client",
            privateKeyPem: privKey,
            staffId: "staff-101",
            displayName: "Dr. Gregory House",
            tenantId: TenantId,
            facilityId: FacilityId,
            branchId: null,
            permissions: [CommsPermissions.MessagingRead, CommsPermissions.MessagingWrite]);

        // Tamper with the signature portion
        var parts = ticket.Split('.');
        var sigBytes = Base64UrlHelper.Decode(parts[1]);
        sigBytes[0] ^= 0xFF; // Flip bits in signature
        var tamperedSig = Base64UrlHelper.Encode(sigBytes);
        var tamperedTicket = $"{parts[0]}.{tamperedSig}";

        var result = CommsTicketValidator.Validate(tamperedTicket, pubKey, TenantId, FacilityId);

        Assert.False(result.IsValid);
        Assert.Contains("Invalid ticket signature", result.ErrorMessage);
    }

    [Fact]
    public void CommsTicketValidator_PrivilegeEscalation_TamperedPayload_IsRejected()
    {
        using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var privKey = ecdsa.ExportECPrivateKeyPem();
        var pubKey = ecdsa.ExportSubjectPublicKeyInfoPem();

        // Issue low-privilege ticket
        var (ticket, _) = CommsTicketSigner.IssueTicket(
            clientId: "pharmacy-test-client",
            privateKeyPem: privKey,
            staffId: "pharm-01",
            displayName: "Pharmacist Bob",
            tenantId: TenantId,
            facilityId: FacilityId,
            branchId: null,
            permissions: [CommsPermissions.MessagingRead]);

        // Attacker tampers payload to inject teleconsult:record
        var parts = ticket.Split('.');
        var payloadBytes = Base64UrlHelper.Decode(parts[0]);
        var json = Encoding.UTF8.GetString(payloadBytes);
        var tamperedJson = json.Replace("messaging:read", "messaging:read\", \"teleconsult:record");
        var tamperedPayload = Base64UrlHelper.Encode(Encoding.UTF8.GetBytes(tamperedJson));
        var tamperedTicket = $"{tamperedPayload}.{parts[1]}";

        var result = CommsTicketValidator.Validate(tamperedTicket, pubKey, TenantId, FacilityId);

        Assert.False(result.IsValid);
        Assert.Contains("Invalid ticket signature", result.ErrorMessage);
    }

    [Fact]
    public void CommsTicketValidator_ExpiredTicket_Past5MinutesPlusSkew_IsRejected()
    {
        using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var privKey = ecdsa.ExportECPrivateKeyPem();
        var pubKey = ecdsa.ExportSubjectPublicKeyInfoPem();

        var (ticket, _) = CommsTicketSigner.IssueTicket(
            clientId: "clinic-test-client",
            privateKeyPem: privKey,
            staffId: "staff-101",
            displayName: "Dr. Gregory House",
            tenantId: TenantId,
            facilityId: FacilityId,
            branchId: null,
            permissions: [CommsPermissions.MessagingRead]);

        // Evaluate at 5 minutes 35 seconds in the future (> 5m lifetime + 30s allowed clock skew)
        var futureTime = DateTimeOffset.UtcNow.AddMinutes(5).AddSeconds(35);
        var result = CommsTicketValidator.Validate(ticket, pubKey, TenantId, FacilityId, now: futureTime);

        Assert.False(result.IsValid);
        Assert.Contains("expired", result.ErrorMessage);
    }

    [Fact]
    public void CommsTicketValidator_InvertedValidityWindow_IsRejected()
    {
        using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var privKey = ecdsa.ExportECPrivateKeyPem();
        var pubKey = ecdsa.ExportSubjectPublicKeyInfoPem();
        var now = DateTimeOffset.UtcNow;

        var malformedPayload = new CommsTicketPayload
        {
            Sub = "staff-bad",
            Name = "Attacker",
            TenantId = TenantId,
            FacilityId = FacilityId,
            Permissions = [CommsPermissions.MessagingRead],
            Iss = "clinic-test-client",
            Iat = now.ToUnixTimeSeconds(),
            Nbf = now.AddMinutes(10).ToUnixTimeSeconds(), // nbf is 10 mins in future
            Exp = now.AddMinutes(2).ToUnixTimeSeconds(),  // exp is 2 mins in future (nbf > exp)
            Jti = Guid.NewGuid().ToString("N")
        };

        var ticket = CommsTicketSigner.Sign(malformedPayload, privKey);
        var result = CommsTicketValidator.Validate(ticket, pubKey, TenantId, FacilityId, now: now);

        Assert.False(result.IsValid);
        Assert.Contains("inverted (nbf > exp)", result.ErrorMessage);
    }

    [Fact]
    public void CommsTicketValidator_FutureIatTimestamp_IsRejected()
    {
        using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var privKey = ecdsa.ExportECPrivateKeyPem();
        var pubKey = ecdsa.ExportSubjectPublicKeyInfoPem();
        var now = DateTimeOffset.UtcNow;

        var futureIatPayload = new CommsTicketPayload
        {
            Sub = "staff-bad",
            Name = "Attacker",
            TenantId = TenantId,
            FacilityId = FacilityId,
            Permissions = [CommsPermissions.MessagingRead],
            Iss = "clinic-test-client",
            Iat = now.AddMinutes(2).ToUnixTimeSeconds(), // iat > now + 30s skew
            Nbf = now.ToUnixTimeSeconds(),
            Exp = now.AddMinutes(5).ToUnixTimeSeconds(),
            Jti = Guid.NewGuid().ToString("N")
        };

        var ticket = CommsTicketSigner.Sign(futureIatPayload, privKey);
        var result = CommsTicketValidator.Validate(ticket, pubKey, TenantId, FacilityId, now: now);

        Assert.False(result.IsValid);
        Assert.Contains("in the future", result.ErrorMessage);
    }

    [Fact]
    public void CommsTicketValidator_TenantAndFacilityMismatches_AreRejected()
    {
        using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var privKey = ecdsa.ExportECPrivateKeyPem();
        var pubKey = ecdsa.ExportSubjectPublicKeyInfoPem();

        var (ticket, _) = CommsTicketSigner.IssueTicket(
            clientId: "clinic-test-client",
            privateKeyPem: privKey,
            staffId: "staff-101",
            displayName: "Dr. Gregory House",
            tenantId: "tenant-correct",
            facilityId: "facility-correct",
            branchId: null,
            permissions: [CommsPermissions.MessagingRead]);

        // 1. Wrong tenant
        var wrongTenantResult = CommsTicketValidator.Validate(ticket, pubKey, expectedTenantId: "tenant-wrong", expectedFacilityId: "facility-correct");
        Assert.False(wrongTenantResult.IsValid);
        Assert.Contains("does not match expected 'tenant-wrong'", wrongTenantResult.ErrorMessage);

        // 2. Wrong facility
        var wrongFacilityResult = CommsTicketValidator.Validate(ticket, pubKey, expectedTenantId: "tenant-correct", expectedFacilityId: "facility-wrong");
        Assert.False(wrongFacilityResult.IsValid);
        Assert.Contains("does not match expected 'facility-wrong'", wrongFacilityResult.ErrorMessage);
    }
}
