using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.Communications;
using ClinicEz.Patient.Application.Features.Communications.Commands;
using ClinicEz.Patient.Application.Features.Communications.Queries;
using ClinicEz.Patient.Application.Tests.Interop;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Infrastructure.Interop;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Comms;

public class Issue278PatientMessagingTests
{
    private const string TenantId = "tenant-nextstep";
    private const string FacilityId = "11111111-1111-1111-1111-111111111111";

    private static ConcurrentDictionary<string, byte[]> WireInMemoryStorage(IStorageService storage)
    {
        var store = new ConcurrentDictionary<string, byte[]>(StringComparer.Ordinal);
        storage.SaveEncryptedAsync(Arg.Any<string>(), Arg.Any<byte[]>(), Arg.Any<CancellationToken>())
            .Returns(call =>
            {
                var key = call.ArgAt<string>(0);
                var data = call.ArgAt<byte[]>(1);
                store[key] = data;
                return Task.FromResult(key);
            });
        storage.DownloadAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(call =>
            {
                var key = call.ArgAt<string>(0);
                if (!store.TryGetValue(key, out var data))
                    throw new KeyNotFoundException($"Missing key {key}");
                return Task.FromResult(data);
            });
        storage.ObjectExistsAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(call => Task.FromResult(store.ContainsKey(call.ArgAt<string>(0))));
        storage.DeleteAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(call =>
            {
                store.TryRemove(call.ArgAt<string>(0), out _);
                return Task.FromResult(true);
            });
        return store;
    }

    [Fact]
    public async Task SubmitPatientInquiryAndMessage_LinkStagedCryptoAttachments_AndEnqueuePlaintextChunks()
    {
        using var harness = new PatientInteropHarness();
        var blobStore = WireInMemoryStorage(harness.Storage);

        var patientId = Guid.NewGuid();
        const string clerkUserId = "user_justine_278";
        var plaintextInquiry = Encoding.UTF8.GetBytes("%PDF-1.7\nEKAS Dependent PDF content for Issue 278\n%%EOF");
        var shaInquiry = Convert.ToHexString(SHA256.HashData(plaintextInquiry)).ToLowerInvariant();
        var plaintextReply = Encoding.UTF8.GetBytes("Follow-up screenshot JPEG bytes");
        var shaReply = Convert.ToHexString(SHA256.HashData(plaintextReply)).ToLowerInvariant();

        using var scope = harness.Provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var patientRepo = scope.ServiceProvider.GetRequiredService<IPatientRepository>();
        var commsRepo = scope.ServiceProvider.GetRequiredService<IPatientCommunicationsRepository>();
        var uow = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var enc = scope.ServiceProvider.GetRequiredService<IPatientEncryptionService>();

        db.Patients.Add(new Domain.Entities.Patient
        {
            Id = patientId,
            ClerkUserId = clerkUserId,
            FirstName = "Justine Mae",
            LastName = "Tabasan",
            ClinicEzId = "CE-JMT-278"
        });
        db.PatientEligibilityGrants.Add(new PatientEligibilityGrant
        {
            Id = Guid.NewGuid(),
            PatientId = patientId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            FacilityType = "Clinic",
            FacilityName = "Nextstep OPD",
            ContextType = "Appointment",
            ContextId = Guid.NewGuid().ToString(),
            WindowStartUtc = DateTime.UtcNow.AddDays(-1),
            WindowEndUtc = DateTime.UtcNow.AddDays(7),
            IsActive = true
        });

        var attId1 = Guid.NewGuid();
        var key1 = $"comms/attachments/{patientId}/{attId1:N}/EKAS.pdf";
        var enc1 = await enc.EncryptAsync(plaintextInquiry, patientId);
        await harness.Storage.SaveEncryptedAsync(key1, enc1.Ciphertext);
        db.PatientMessageAttachments.Add(new PatientMessageAttachment
        {
            Id = attId1,
            MessageId = null,
            PatientId = patientId,
            FileName = "EKAS.pdf",
            ContentType = "application/pdf",
            FileSizeBytes = plaintextInquiry.Length,
            StorageKey = key1,
            IsClean = true,
            ScanStatus = "Clean",
            HashSha256 = shaInquiry,
            EncryptionAlgorithm = enc1.EncryptionAlgorithm,
            EncryptionIvBase64 = enc1.IvBase64,
            EncryptionTagBase64 = enc1.TagBase64,
            WrappedKeyJson = enc1.WrappedKeyJson
        });

        var attId2 = Guid.NewGuid();
        var key2 = $"comms/attachments/{patientId}/{attId2:N}/followup.jpg";
        var enc2 = await enc.EncryptAsync(plaintextReply, patientId);
        await harness.Storage.SaveEncryptedAsync(key2, enc2.Ciphertext);
        db.PatientMessageAttachments.Add(new PatientMessageAttachment
        {
            Id = attId2,
            MessageId = null,
            PatientId = patientId,
            FileName = "followup.jpg",
            ContentType = "image/jpeg",
            FileSizeBytes = plaintextReply.Length,
            StorageKey = key2,
            IsClean = true,
            ScanStatus = "Clean",
            HashSha256 = shaReply,
            EncryptionAlgorithm = enc2.EncryptionAlgorithm,
            EncryptionIvBase64 = enc2.IvBase64,
            EncryptionTagBase64 = enc2.TagBase64,
            WrappedKeyJson = enc2.WrappedKeyJson
        });
        await db.SaveChangesAsync();

        var publisher = Substitute.For<IInteropPublisher>();
        var inquiryHandler = new SubmitPatientInquiryCommandHandler(
            patientRepo, commsRepo, uow, publisher, harness.Storage, enc);

        var inquiryResponse = await inquiryHandler.Handle(new SubmitPatientInquiryCommand(
            clerkUserId,
            patientId,
            TenantId,
            FacilityId,
            "Clinic",
            "Nextstep OPD",
            MessageCategory.LabResultQuestion,
            "Initial inquiry with PDF",
            IsEmergencyConfirmed: false,
            Attachments: [new CommsAttachmentReference(key1, "EKAS.pdf", "application/pdf", plaintextInquiry.Length, shaInquiry, attId1)]),
            CancellationToken.None);

        inquiryResponse.ConversationId.Should().NotBeNull();
        var convId = inquiryResponse.ConversationId!.Value;

        var linkedAtt1 = await db.PatientMessageAttachments.FirstAsync(a => a.Id == attId1);
        linkedAtt1.MessageId.Should().NotBeNull();
        linkedAtt1.PatientId.Should().Be(patientId);

        publisher.Received().Enqueue(
            InteropTypes.CommsAttachmentChunk,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            convId,
            Arg.Is<CommsAttachmentChunkPayload>(p =>
                p.AttachmentKey == key1 &&
                Convert.FromBase64String(p.ContentBase64).SequenceEqual(plaintextInquiry)));

        publisher.ClearReceivedCalls();

        var msgHandler = new SubmitPatientMessageCommandHandler(
            patientRepo, commsRepo, uow, publisher, harness.Storage, enc);

        var msgDto = await msgHandler.Handle(new SubmitPatientMessageCommand(
            convId,
            clerkUserId,
            "Follow-up with JPG",
            Attachments: [new CommsAttachmentReference(key2, "followup.jpg", "image/jpeg", plaintextReply.Length, shaReply, attId2)]),
            CancellationToken.None);

        msgDto.Attachments.Should().HaveCount(1);
        msgDto.Attachments[0].Id.Should().Be(attId2);

        var linkedAtt2 = await db.PatientMessageAttachments.FirstAsync(a => a.Id == attId2);
        linkedAtt2.MessageId.Should().Be(msgDto.Id);
        linkedAtt2.PatientId.Should().Be(patientId);

        publisher.Received().Enqueue(
            InteropTypes.CommsAttachmentChunk,
            Arg.Any<Party>(),
            Arg.Any<Party>(),
            convId,
            Arg.Is<CommsAttachmentChunkPayload>(p =>
                p.AttachmentKey == key2 &&
                p.MessageId == msgDto.Id &&
                Convert.FromBase64String(p.ContentBase64).SequenceEqual(plaintextReply)));

        blobStore.Should().ContainKey(key1);
        blobStore.Should().ContainKey(key2);
    }

    [Fact]
    public async Task GetPatientConversationDetail_SortsChronologicallyWhenSeqCollides_AndSanitizesStaffSenderNames()
    {
        using var harness = new PatientInteropHarness();
        var patientId = Guid.NewGuid();
        var convId = Guid.NewGuid();
        const string clerkUserId = "user_order_sender_278";
        var t0 = new DateTime(2026, 11, 25, 6, 41, 0, DateTimeKind.Utc);

        using var scope = harness.Provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var patientRepo = scope.ServiceProvider.GetRequiredService<IPatientRepository>();
        var commsRepo = scope.ServiceProvider.GetRequiredService<IPatientCommunicationsRepository>();
        var uow = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

        db.Patients.Add(new Domain.Entities.Patient
        {
            Id = patientId,
            ClerkUserId = clerkUserId,
            FirstName = "Justine Mae",
            LastName = "Tabasan",
            ClinicEzId = "CE-JMT-278B"
        });
        db.PatientConversations.Add(new PatientConversation
        {
            Id = convId,
            PatientId = patientId,
            HomeTenantId = TenantId,
            HomeFacilityId = FacilityId,
            HomeFacilityType = "Clinic",
            FacilityName = "Nextstep OPD",
            Category = MessageCategory.Scheduling,
            Subject = "Checkup",
            Status = RequestStatus.Answered,
            LastMessageAtUtc = t0.AddMinutes(16),
            LastMessagePreview = "I hope you're doing just fine",
            OpenedAtUtc = t0
        });

        // Scrambled seq collisions mimicking Issue #278
        db.PatientMessages.AddRange(
            new PatientMessage
            {
                Id = Guid.NewGuid(),
                ConversationId = convId,
                Seq = 1,
                ClientMessageId = Guid.NewGuid(),
                SenderType = "Patient",
                SenderName = "Justine Mae Tabasan",
                ContentText = "02:41 initial",
                DeliveryState = DeliveryState.Received,
                CreatedAtUtc = t0,
                RetentionDeadlineUtc = t0.AddDays(7)
            },
            new PatientMessage
            {
                Id = Guid.NewGuid(),
                ConversationId = convId,
                Seq = 2,
                ClientMessageId = Guid.NewGuid(),
                SenderType = "Staff",
                SenderName = "Justine Mae Tabasan", // poisoned sender name
                ContentText = "02:48 clinic reply 1",
                DeliveryState = DeliveryState.Received,
                CreatedAtUtc = t0.AddMinutes(7),
                RetentionDeadlineUtc = t0.AddDays(7)
            },
            new PatientMessage
            {
                Id = Guid.NewGuid(),
                ConversationId = convId,
                Seq = 2,
                ClientMessageId = Guid.NewGuid(),
                SenderType = "Patient",
                SenderName = "Justine Mae Tabasan",
                ContentText = "02:42 Hello?",
                DeliveryState = DeliveryState.Received,
                CreatedAtUtc = t0.AddMinutes(1),
                RetentionDeadlineUtc = t0.AddDays(7)
            },
            new PatientMessage
            {
                Id = Guid.NewGuid(),
                ConversationId = convId,
                Seq = 3,
                ClientMessageId = Guid.NewGuid(),
                SenderType = "Staff",
                SenderName = "Staff Member", // generic placeholder
                ContentText = "02:57 clinic reply 2",
                DeliveryState = DeliveryState.Received,
                CreatedAtUtc = t0.AddMinutes(16),
                RetentionDeadlineUtc = t0.AddDays(7)
            },
            new PatientMessage
            {
                Id = Guid.NewGuid(),
                ConversationId = convId,
                Seq = 3,
                ClientMessageId = Guid.NewGuid(),
                SenderType = "Patient",
                SenderName = "Justine Mae Tabasan",
                ContentText = "02:42 Are you still there?",
                DeliveryState = DeliveryState.Received,
                CreatedAtUtc = t0.AddMinutes(1).AddSeconds(20),
                RetentionDeadlineUtc = t0.AddDays(7)
            },
            new PatientMessage
            {
                Id = Guid.NewGuid(),
                ConversationId = convId,
                Seq = 4,
                ClientMessageId = Guid.NewGuid(),
                SenderType = "Staff",
                SenderName = "Dr. Elena Cruz", // genuine clinician name
                ContentText = "03:00 genuine clinician reply",
                DeliveryState = DeliveryState.Received,
                CreatedAtUtc = t0.AddMinutes(19),
                RetentionDeadlineUtc = t0.AddDays(7)
            });
        await db.SaveChangesAsync();

        var handler = new GetPatientConversationDetailQueryHandler(patientRepo, commsRepo, uow);
        var detail = await handler.Handle(new GetPatientConversationDetailQuery(convId, clerkUserId), CancellationToken.None);

        detail.Messages.Select(m => m.ContentText).Should().Equal(
            "02:41 initial",
            "02:42 Hello?",
            "02:42 Are you still there?",
            "02:48 clinic reply 1",
            "02:57 clinic reply 2",
            "03:00 genuine clinician reply");

        detail.Messages[0].SenderName.Should().Be("Justine Mae Tabasan");
        detail.Messages[3].SenderName.Should().Be("Nextstep OPD");
        detail.Messages[4].SenderName.Should().Be("Nextstep OPD");
        detail.Messages[5].SenderName.Should().Be("Dr. Elena Cruz");
    }

    [Fact]
    public async Task InboundClinicReplicateAndChunkHandlers_SanitizeSender_AssembleBeforeOrAfter_AndEncrypt()
    {
        using var harness = new PatientInteropHarness();
        WireInMemoryStorage(harness.Storage);
        var patientId = Guid.NewGuid();
        var convId = Guid.NewGuid();

        using var scope = harness.Provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var enc = scope.ServiceProvider.GetRequiredService<IPatientEncryptionService>();
        var deviceRepo = scope.ServiceProvider.GetRequiredService<IDeviceSessionRepository>();
        var push = scope.ServiceProvider.GetRequiredService<IPushNotificationService>();
        var sync = scope.ServiceProvider.GetRequiredService<ISyncNotificationService>();

        db.Patients.Add(new Domain.Entities.Patient
        {
            Id = patientId,
            ClerkUserId = "user_inbound_278",
            FirstName = "Justine Mae",
            LastName = "Tabasan",
            ClinicEzId = "CE-JMT-278C"
        });
        db.PatientConversations.Add(new PatientConversation
        {
            Id = convId,
            PatientId = patientId,
            HomeTenantId = TenantId,
            HomeFacilityId = FacilityId,
            HomeFacilityType = "Clinic",
            FacilityName = "Nextstep OPD",
            Category = MessageCategory.Scheduling,
            Subject = "Inquiry",
            Status = RequestStatus.Answered,
            OpenedAtUtc = DateTime.UtcNow.AddMinutes(-10),
            LastMessageAtUtc = DateTime.UtcNow.AddMinutes(-10),
            LastMessagePreview = "Initial"
        });
        await db.SaveChangesAsync();

        var replicateHandler = new CommsMessageReplicateInteropHandler(
            db, Substitute.For<IInteropPublisher>(), deviceRepo, push, sync, NullLogger<CommsMessageReplicateInteropHandler>.Instance);
        var chunkHandler = new CommsAttachmentChunkInteropHandler(
            db, harness.Storage, enc, NullLogger<CommsAttachmentChunkInteropHandler>.Instance);

        var plaintextA = Encoding.UTF8.GetBytes("Chunk0-Clinic-PDF--Chunk1-Remainder");
        var shaA = Convert.ToHexString(SHA256.HashData(plaintextA)).ToLowerInvariant();
        const string keyA = "tenant-nextstep/1111/rx-a.pdf";

        var chunkCtx = new InteropMessageContext(new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            Type = InteropTypes.CommsAttachmentChunk,
            From = Party.ForFacility(TenantId, FacilityId, FacilityType.Clinic, InteropServices.Comms),
            To = Party.ForPatient(patientId.ToString()),
            CorrelationId = convId,
        });
        var repCtx = new InteropMessageContext(new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            Type = InteropTypes.CommsMessageReplicate,
            From = Party.ForFacility(TenantId, FacilityId, FacilityType.Clinic, InteropServices.Comms),
            To = Party.ForPatient(patientId.ToString()),
            CorrelationId = convId,
        });

        // 1. Multi-chunk arrives BEFORE comms.message.replicate
        await chunkHandler.HandleAsync(new CommsAttachmentChunkPayload(
            keyA, convId, null, TenantId, FacilityId, "Clinic", patientId,
            "rx-a.pdf", "application/pdf", plaintextA.Length, shaA, 0, 2, Convert.ToBase64String(plaintextA[..18])),
            chunkCtx, CancellationToken.None);
        await chunkHandler.HandleAsync(new CommsAttachmentChunkPayload(
            keyA, convId, null, TenantId, FacilityId, "Clinic", patientId,
            "rx-a.pdf", "application/pdf", plaintextA.Length, shaA, 1, 2, Convert.ToBase64String(plaintextA[18..])),
            chunkCtx, CancellationToken.None);

        var staffMsgId = Guid.NewGuid();
        await replicateHandler.HandleAsync(new CommsMessageReplicatePayload(
            staffMsgId, convId, 2, TenantId, FacilityId, "Staff", Guid.NewGuid(),
            "Justine Mae Tabasan", // poisoned clinic reply sender name
            "Here is your Rx", MessageVisibility.Public, false,
            [new CommsAttachmentReference(keyA, "rx-a.pdf", "application/pdf", plaintextA.Length, shaA)],
            DateTime.UtcNow, DateTime.UtcNow.AddDays(7), DeliveryState.Received),
            repCtx, CancellationToken.None);

        var replicatedMsg = await db.PatientMessages
            .Include(m => m.Attachments)
            .FirstAsync(m => m.Id == staffMsgId);
        replicatedMsg.SenderName.Should().Be("Nextstep OPD");
        replicatedMsg.Attachments.Should().HaveCount(1);

        var attA = replicatedMsg.Attachments.Single();
        attA.WrappedKeyJson.Should().NotBeNullOrWhiteSpace();
        var cipherA = await harness.Storage.DownloadAsync(attA.StorageKey);
        var decryptedA = await enc.DecryptAsync(patientId, cipherA, attA.EncryptionIvBase64!, attA.EncryptionTagBase64!, attA.WrappedKeyJson!);
        decryptedA.Should().Equal(plaintextA);

        // 2. Single chunk arrives AFTER comms.message.replicate
        var plaintextB = Encoding.UTF8.GetBytes("Second attachment after replicate");
        var shaB = Convert.ToHexString(SHA256.HashData(plaintextB)).ToLowerInvariant();
        const string keyB = "tenant-nextstep/1111/photo-b.jpg";
        var staffMsgId2 = Guid.NewGuid();

        await replicateHandler.HandleAsync(new CommsMessageReplicatePayload(
            staffMsgId2, convId, 3, TenantId, FacilityId, "Staff", Guid.NewGuid(),
            "Dr. Reyes", "See photo B", MessageVisibility.Public, false,
            [new CommsAttachmentReference(keyB, "photo-b.jpg", "image/jpeg", plaintextB.Length, shaB)],
            DateTime.UtcNow.AddSeconds(5), DateTime.UtcNow.AddDays(7), DeliveryState.Received),
            repCtx, CancellationToken.None);

        await chunkHandler.HandleAsync(new CommsAttachmentChunkPayload(
            keyB, convId, staffMsgId2, TenantId, FacilityId, "Clinic", patientId,
            "photo-b.jpg", "image/jpeg", plaintextB.Length, shaB, 0, 1, Convert.ToBase64String(plaintextB)),
            chunkCtx, CancellationToken.None);

        var attB = await db.PatientMessageAttachments.FirstAsync(a => a.MessageId == staffMsgId2);
        attB.WrappedKeyJson.Should().NotBeNullOrWhiteSpace();
        var cipherB = await harness.Storage.DownloadAsync(attB.StorageKey);
        var decryptedB = await enc.DecryptAsync(patientId, cipherB, attB.EncryptionIvBase64!, attB.EncryptionTagBase64!, attB.WrappedKeyJson!);
        decryptedB.Should().Equal(plaintextB);
    }
}
