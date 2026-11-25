using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Api.Controllers;
using ClinicEz.Comms.Application.Common.Helpers;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Features.Attachments.Commands;
using ClinicEz.Comms.Application.Features.Messages.Commands;
using ClinicEz.Comms.Application.Models;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Domain.Enums;
using ClinicEz.Comms.Infrastructure.Hubs;
using ClinicEz.Comms.Infrastructure.Messaging.Handlers;
using ClinicEz.Comms.Infrastructure.Realtime;
using ClinicEz.Comms.Infrastructure.Security;
using ClinicEz.Comms.Infrastructure.Services;
using ClinicEz.Comms.Infrastructure.Storage;
using ClinicEz.Comms.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace ClinicEz.Comms.Tests;

public class Issue278MessagingFixesTests : IDisposable
{
    private const string TenantId = "tenant-nextstep";
    private const string FacilityId = "11111111-1111-1111-1111-111111111111";
    private readonly string _tempDir;

    public Issue278MessagingFixesTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), $"clinicez-comms-278-{Guid.NewGuid():N}");
        Directory.CreateDirectory(_tempDir);
    }

    public void Dispose()
    {
        try
        {
            if (Directory.Exists(_tempDir))
            {
                Directory.Delete(_tempDir, recursive: true);
            }
        }
        catch
        {
            // best-effort temp cleanup
        }
    }

    private LocalCommsStorageService CreateStorage()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Storage:BasePath"] = _tempDir })
            .Build();
        return new LocalCommsStorageService(config);
    }

    [Fact]
    public async Task CommsMessageSubmitHandler_AcceptsPatientFollowUp_DuringWithTriage_PassesAssignedSeq_AndUpdatesConversation()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var notifier = new Mock<ICommsRealtimeNotifier>();
        var publisher = new Mock<IInteropPublisher>();
        var convId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var clientMsgId = Guid.NewGuid();

        db.Conversations.Add(new Conversation
        {
            Id = convId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            Scope = ConversationScope.PatientFacility,
            Kind = ConversationKind.PatientTriage,
            PatientId = patientId,
            Status = RequestStatus.WithTriage,
            LastSeq = 1,
            MessageCount = 1,
        });
        await db.SaveChangesAsync();

        var handler = new CommsMessageSubmitHandler(
            db,
            notifier.Object,
            publisher.Object,
            NullLogger<CommsMessageSubmitHandler>.Instance);

        var payload = new CommsMessageSubmitPayload(
            ClientMessageId: clientMsgId,
            ConversationId: convId,
            TenantId: TenantId,
            FacilityId: FacilityId,
            SenderType: "Patient",
            SenderId: patientId,
            SenderDisplayName: "Justine Mae Tabasan",
            ContentText: "Hello? Are you still there?",
            Visibility: MessageVisibility.Public,
            RequiresAcknowledgement: false,
            Attachments: null,
            ClientSentAtUtc: DateTime.UtcNow.AddSeconds(-5),
            RetentionDeadlineUtc: DateTime.UtcNow.AddDays(7));

        var ctx = new InteropMessageContext(new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            Type = InteropTypes.CommsMessageSubmit,
            From = Party.ForPatient(patientId.ToString()),
            To = Party.ForFacility(TenantId, FacilityId, FacilityType.Clinic, InteropServices.Comms),
            CorrelationId = convId,
        });

        await handler.HandleAsync(payload, ctx, CancellationToken.None);

        var persisted = await db.Messages.FirstOrDefaultAsync(m => m.ClientMessageId == clientMsgId);
        Assert.NotNull(persisted);
        Assert.Equal(2, persisted!.Seq);
        Assert.Equal("Hello? Are you still there?", persisted.ContentText);

        publisher.Verify(p => p.Enqueue(
            InteropTypes.CommsMessageReceived,
            It.IsAny<Party>(),
            It.Is<Party>(to => to.PatientId == patientId.ToString()),
            convId,
            It.Is<CommsMessageReceivedPayload>(ack => ack.MessageId == clientMsgId && ack.AssignedSeq == 2L),
            It.IsAny<int>(),
            It.IsAny<TimeSpan?>()), Times.Once);

        notifier.Verify(n => n.NotifyMessageReceivedAsync(convId, It.Is<MessageDto>(m => m.MessageId == persisted.Id && m.Seq == 2), It.IsAny<CancellationToken>()), Times.Once);
        notifier.Verify(n => n.NotifyConversationUpdatedAsync(It.Is<ConversationDto>(c => c.Id == convId && c.LastSeq == 2), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task CommsRealtimeNotifier_TargetsCompositeTenantAndFacilityGroup()
    {
        var hubContext = new Mock<IHubContext<CommsHub, ICommsClient>>();
        var clients = new Mock<IHubClients<ICommsClient>>();
        var facilityGroupClient = new Mock<ICommsClient>();
        var convGroupClient = new Mock<ICommsClient>();

        hubContext.Setup(h => h.Clients).Returns(clients.Object);
        clients.Setup(c => c.Group($"facility:{TenantId}:{FacilityId}")).Returns(facilityGroupClient.Object);
        var convId = Guid.NewGuid();
        clients.Setup(c => c.Group($"conv:{convId}")).Returns(convGroupClient.Object);

        var notifier = new CommsRealtimeNotifier(hubContext.Object);
        var dto = CommsAttachmentTransferHelper.MapConversationDto(new Conversation
        {
            Id = convId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            Scope = ConversationScope.PatientFacility,
            Kind = ConversationKind.PatientTriage,
            Title = "Subject",
            PatientId = Guid.NewGuid(),
            Status = RequestStatus.WithTriage,
            MessageCount = 2,
            LastSeq = 2,
            CreatedAtUtc = DateTime.UtcNow,
            CreatedBy = "patient",
            LastMessageAtUtc = DateTime.UtcNow,
            LastMessageSnippet = "Hello?",
        });

        await notifier.NotifyConversationCreatedAsync(dto);
        await notifier.NotifyConversationUpdatedAsync(dto);

        facilityGroupClient.Verify(c => c.OnConversationCreated(dto), Times.Once);
        facilityGroupClient.Verify(c => c.OnConversationUpdated(dto), Times.Once);
        convGroupClient.Verify(c => c.OnConversationCreated(dto), Times.Once);
        convGroupClient.Verify(c => c.OnConversationUpdated(dto), Times.Once);
    }

    [Fact]
    public async Task UploadAttachmentCommand_And_DownloadController_DecryptRoundtripAndPreserveContentType()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var pipeline = new AttachmentPipeline();
        var storage = CreateStorage();
        var crypto = new AttachmentCryptoService("issue-278-test-master-secret-32chars!");

        var cleanPdfBytes = Encoding.ASCII.GetBytes("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF");
        using var stream = new MemoryStream(cleanPdfBytes);

        var uploadHandler = new UploadAttachmentCommandHandler(db, pipeline, storage, crypto);
        var uploaded = await uploadHandler.Handle(
            new UploadAttachmentCommand(stream, "EKAS.pdf", "application/pdf", cleanPdfBytes.Length, TenantId, FacilityId),
            CancellationToken.None);

        var entity = await db.MessageAttachments.FindAsync(uploaded.AttachmentId);
        Assert.NotNull(entity);
        Assert.False(string.IsNullOrWhiteSpace(entity!.WrappedKeyJson));

        var controller = new AttachmentsController(
            new Mock<IMediator>().Object,
            db,
            storage,
            crypto);
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(
                    [new Claim("tenant_id", TenantId)],
                    "TestAuth"))
            }
        };

        var actionResult = await controller.Download(uploaded.AttachmentId, CancellationToken.None);
        var fileResult = Assert.IsType<FileContentResult>(actionResult);
        Assert.Equal("application/pdf", fileResult.ContentType);
        Assert.Equal("EKAS.pdf", fileResult.FileDownloadName);
        Assert.Equal(cleanPdfBytes, fileResult.FileContents);
    }

    [Fact]
    public async Task CommsAttachmentChunkHandler_HandlesMultiChunkBeforeAndAfterMessageArrival_AndRejectsShaMismatch()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var storage = CreateStorage();
        var crypto = new AttachmentCryptoService("issue-278-test-master-secret-32chars!");
        var notifier = new Mock<ICommsRealtimeNotifier>();
        var publisher = new Mock<IInteropPublisher>();

        var convId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        db.Conversations.Add(new Conversation
        {
            Id = convId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            Scope = ConversationScope.PatientFacility,
            Kind = ConversationKind.PatientTriage,
            PatientId = patientId,
            Status = RequestStatus.WithTriage,
            LastSeq = 1,
            MessageCount = 1,
        });
        await db.SaveChangesAsync();

        var chunkHandler = new CommsAttachmentChunkHandler(db, storage, crypto, NullLogger<CommsAttachmentChunkHandler>.Instance);
        var submitHandler = new CommsMessageSubmitHandler(db, notifier.Object, publisher.Object, NullLogger<CommsMessageSubmitHandler>.Instance, storage, crypto);

        var plaintext = Encoding.UTF8.GetBytes("Chunk0-Patient-PDF-Payload--Chunk1-Second-Half!");
        var sha = Convert.ToHexString(SHA256.HashData(plaintext)).ToLowerInvariant();
        var part0 = plaintext[..24];
        var part1 = plaintext[24..];
        const string fileKey = "comms/attachments/patient/pre-arrived/lab.pdf";

        var ctx = new InteropMessageContext(new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            Type = InteropTypes.CommsAttachmentChunk,
            From = Party.ForPatient(patientId.ToString()),
            To = Party.ForFacility(TenantId, FacilityId, FacilityType.Clinic, InteropServices.Comms),
            CorrelationId = convId,
        });

        // Case A: Chunks arrive BEFORE comms.message.submit
        await chunkHandler.HandleAsync(new CommsAttachmentChunkPayload(
            fileKey, convId, null, TenantId, FacilityId, "Clinic", patientId,
            "lab.pdf", "application/pdf", plaintext.Length, sha, 0, 2, Convert.ToBase64String(part0)), ctx, CancellationToken.None);
        await chunkHandler.HandleAsync(new CommsAttachmentChunkPayload(
            fileKey, convId, null, TenantId, FacilityId, "Clinic", patientId,
            "lab.pdf", "application/pdf", plaintext.Length, sha, 1, 2, Convert.ToBase64String(part1)), ctx, CancellationToken.None);

        var clientMsgId = Guid.NewGuid();
        await submitHandler.HandleAsync(new CommsMessageSubmitPayload(
            clientMsgId, convId, TenantId, FacilityId, "Patient", patientId,
            "Justine", "See lab PDF", MessageVisibility.Public, false,
            [new CommsAttachmentReference(fileKey, "lab.pdf", "application/pdf", plaintext.Length, sha)],
            DateTime.UtcNow, DateTime.UtcNow.AddDays(7)), ctx, CancellationToken.None);

        var savedPreArrived = await db.MessageAttachments.FirstAsync(a => a.OriginalFileName == "lab.pdf");
        Assert.False(string.IsNullOrWhiteSpace(savedPreArrived.WrappedKeyJson));
        var storedCipherPre = await storage.ReadEncryptedAttachmentAsync(savedPreArrived.StoragePath);
        Assert.NotNull(storedCipherPre);
        var decryptedPre = await crypto.DecryptAsync(storedCipherPre!, new AttachmentCryptoMetadata(
            savedPreArrived.EncryptionAlgorithm, savedPreArrived.EncryptionKeyId, savedPreArrived.EncryptionIvBase64,
            savedPreArrived.EncryptionTagBase64, savedPreArrived.WrappedKeyJson), TenantId, FacilityId);
        Assert.Equal(plaintext, decryptedPre);

        // Case B: Chunks arrive AFTER comms.message.submit, plus Case C: SHA mismatch ignored
        var afterKey = "comms/attachments/patient/post-arrived/photo.jpg";
        var msgAfterId = Guid.NewGuid();
        await submitHandler.HandleAsync(new CommsMessageSubmitPayload(
            msgAfterId, convId, TenantId, FacilityId, "Patient", patientId,
            "Justine", "See photo", MessageVisibility.Public, false,
            [new CommsAttachmentReference(afterKey, "photo.jpg", "image/jpeg", plaintext.Length, sha)],
            DateTime.UtcNow, DateTime.UtcNow.AddDays(7)), ctx, CancellationToken.None);

        // Bad SHA first -> must NOT encrypt or overwrite
        await chunkHandler.HandleAsync(new CommsAttachmentChunkPayload(
            afterKey, convId, null, TenantId, FacilityId, "Clinic", patientId,
            "photo.jpg", "image/jpeg", plaintext.Length, "0000000000000000", 0, 1, Convert.ToBase64String(plaintext)), ctx, CancellationToken.None);
        var postBeforeGood = await db.MessageAttachments.FirstAsync(a => a.OriginalFileName == "photo.jpg");
        Assert.True(string.IsNullOrWhiteSpace(postBeforeGood.WrappedKeyJson));

        // Valid SHA -> encrypts and saves
        await chunkHandler.HandleAsync(new CommsAttachmentChunkPayload(
            afterKey, convId, null, TenantId, FacilityId, "Clinic", patientId,
            "photo.jpg", "image/jpeg", plaintext.Length, sha, 0, 1, Convert.ToBase64String(plaintext)), ctx, CancellationToken.None);
        var postAfterGood = await db.MessageAttachments.FirstAsync(a => a.OriginalFileName == "photo.jpg");
        Assert.False(string.IsNullOrWhiteSpace(postAfterGood.WrappedKeyJson));
    }

    [Fact]
    public async Task SendMessageCommand_PatientFacilityPublicAttachment_EnqueuesAttachmentChunksToPatient()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var storage = CreateStorage();
        var crypto = new AttachmentCryptoService("issue-278-test-master-secret-32chars!");
        var notifier = new Mock<ICommsRealtimeNotifier>();
        var publisher = new Mock<IInteropPublisher>();

        var convId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        db.Conversations.Add(new Conversation
        {
            Id = convId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            Scope = ConversationScope.PatientFacility,
            Kind = ConversationKind.PatientTriage,
            PatientId = patientId,
            Status = RequestStatus.Answered,
            LastSeq = 1,
            MessageCount = 1,
        });

        var attachmentId = Guid.NewGuid();
        var plaintext = Encoding.UTF8.GetBytes("Clinic prescription instruction sheet bytes.");
        var sha = Convert.ToHexString(SHA256.HashData(plaintext)).ToLowerInvariant();
        var encrypted = await crypto.EncryptAsync(plaintext, TenantId, FacilityId);
        var storagePath = await storage.SaveEncryptedAttachmentAsync(TenantId, FacilityId, attachmentId, encrypted.Ciphertext);

        db.MessageAttachments.Add(new MessageAttachment
        {
            Id = attachmentId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            OriginalFileName = "rx.pdf",
            SafeFileName = "rx.pdf",
            ContentType = "application/pdf",
            OriginalSizeBytes = plaintext.Length,
            SanitizedSizeBytes = plaintext.Length,
            StoragePath = storagePath,
            SHA256Checksum = sha,
            EncryptionAlgorithm = encrypted.Metadata.Algorithm,
            EncryptionKeyId = encrypted.Metadata.KeyId,
            EncryptionIvBase64 = encrypted.Metadata.IvBase64,
            EncryptionTagBase64 = encrypted.Metadata.TagBase64,
            WrappedKeyJson = encrypted.Metadata.WrappedKeyJson,
            Status = AttachmentStatus.Clean,
            ScannedAtUtc = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();

        var handler = new SendMessageCommandHandler(db, notifier.Object, publisher.Object, storage, crypto);
        var result = await handler.Handle(new SendMessageCommand(
            convId,
            TenantId,
            FacilityId,
            "Staff",
            "doc-1",
            "Dr. Santos",
            "Attached your instructions.",
            MessageVisibility.Public,
            false,
            [new CommsAttachmentReference(storagePath, "rx.pdf", "application/pdf", plaintext.Length, sha, attachmentId)]),
            CancellationToken.None);

        Assert.Single(result.Attachments);
        publisher.Verify(p => p.Enqueue(
            InteropTypes.CommsAttachmentChunk,
            It.IsAny<Party>(),
            It.Is<Party>(to => to.PatientId == patientId.ToString()),
            convId,
            It.Is<CommsAttachmentChunkPayload>(chunk =>
                chunk.AttachmentKey == storagePath &&
                Convert.FromBase64String(chunk.ContentBase64).SequenceEqual(plaintext)),
            It.IsAny<int>(),
            It.IsAny<TimeSpan?>()), Times.Once);
    }
}
