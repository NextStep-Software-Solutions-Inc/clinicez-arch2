using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Domain.Enums;
using ClinicEz.Comms.Infrastructure.Persistence;
using ClinicEz.Comms.Infrastructure.Services;
using ClinicEz.Comms.Infrastructure.Storage;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace ClinicEz.Comms.MigrationTool.Tests.Helpers;

public class MigrationTestFixture : IDisposable
{
    public string TempDirectory { get; }
    public string SourceStorageDirectory { get; }
    public string TargetStorageDirectory { get; }
    public string BundlesDirectory { get; }

    public string SourceCellSecret { get; } = "source-cell-secret-key-32-bytes!!";
    public string TargetCellSecret { get; } = "target-cell-secret-key-32-bytes!!";
    public string MigrationPassphrase { get; } = "OperatorPassphrase123!";

    public ECDsa SignerKey { get; }
    public string SignerPrivateKeyPem { get; }
    public string SignerPublicKeyPem { get; }

    public MigrationTestFixture()
    {
        TempDirectory = Path.Combine(Path.GetTempPath(), "clinicez_m8_" + Guid.NewGuid().ToString("N"));
        SourceStorageDirectory = Path.Combine(TempDirectory, "source_storage");
        TargetStorageDirectory = Path.Combine(TempDirectory, "target_storage");
        BundlesDirectory = Path.Combine(TempDirectory, "bundles");

        Directory.CreateDirectory(SourceStorageDirectory);
        Directory.CreateDirectory(TargetStorageDirectory);
        Directory.CreateDirectory(BundlesDirectory);

        SignerKey = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        SignerPrivateKeyPem = SignerKey.ExportECPrivateKeyPem();
        SignerPublicKeyPem = SignerKey.ExportSubjectPublicKeyInfoPem();
    }

    public CommsDbContext CreateDbContext(string dbName)
    {
        var options = new DbContextOptionsBuilder<CommsDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;

        return new CommsDbContext(options);
    }

    public LocalCommsStorageService CreateStorageService(string basePath)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Storage:BasePath"] = basePath
            })
            .Build();

        return new LocalCommsStorageService(config);
    }

    public AttachmentCryptoService CreateCryptoService(string cellSecret)
    {
        return new AttachmentCryptoService(cellSecret);
    }

    public async Task SeedTenantDataAsync(
        CommsDbContext db,
        ICommsStorageService storage,
        IAttachmentCryptoService crypto,
        string tenantId,
        string facilityId = "fac-01")
    {
        // 1. Conversations
        var conv1 = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            FacilityId = facilityId,
            Scope = ConversationScope.Facility,
            Kind = ConversationKind.General,
            Title = "General Facility Chat",
            LastSeq = 5,
            MessageCount = 5,
            CreatedBy = "staff-01"
        };

        var conv2 = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            FacilityId = facilityId,
            Scope = ConversationScope.PatientFacility,
            Kind = ConversationKind.PatientTriage,
            Title = "Patient Ingestion Triage",
            PatientId = Guid.NewGuid(),
            Status = RequestStatus.WithTriage,
            TriageDisposition = TriageDisposition.Routed,
            LastSeq = 2,
            MessageCount = 2,
            CreatedBy = "patient-01"
        };

        db.Conversations.AddRange(conv1, conv2);

        // 2. Participants
        var part1 = new Participant
        {
            Id = Guid.NewGuid(),
            ConversationId = conv1.Id,
            TenantId = tenantId,
            ParticipantType = "Staff",
            ParticipantId = "staff-01",
            DisplayName = "Dr. Santos",
            Role = "Admin"
        };
        var part2 = new Participant
        {
            Id = Guid.NewGuid(),
            ConversationId = conv1.Id,
            TenantId = tenantId,
            ParticipantType = "Staff",
            ParticipantId = "staff-02",
            DisplayName = "Nurse Reyes",
            Role = "Member"
        };
        var part3 = new Participant
        {
            Id = Guid.NewGuid(),
            ConversationId = conv2.Id,
            TenantId = tenantId,
            ParticipantType = "Patient",
            ParticipantId = "pat-100",
            DisplayName = "Juan Dela Cruz",
            Role = "Patient"
        };

        db.Participants.AddRange(part1, part2, part3);

        // 3. Messages
        var msg1 = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conv1.Id,
            TenantId = tenantId,
            FacilityId = facilityId,
            Seq = 1,
            SenderType = "Staff",
            SenderId = "staff-01",
            SenderDisplayName = "Dr. Santos",
            ContentText = "Morning clinical huddle at 9am.",
            Visibility = MessageVisibility.Public,
            State = DeliveryState.Received,
            ClientMessageId = Guid.NewGuid()
        };

        var msg2 = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conv1.Id,
            TenantId = tenantId,
            FacilityId = facilityId,
            Seq = 2,
            SenderType = "Staff",
            SenderId = "staff-02",
            SenderDisplayName = "Nurse Reyes",
            ContentText = "Noted Doc, charts are ready.",
            Visibility = MessageVisibility.Public,
            State = DeliveryState.Received,
            ClientMessageId = Guid.NewGuid()
        };

        db.Messages.AddRange(msg1, msg2);

        // 4. Reactions
        var reaction1 = new MessageReaction
        {
            MessageId = msg1.Id,
            UserId = "staff-02",
            UserDisplayName = "Nurse Reyes",
            Reaction = "thumbs_up"
        };
        db.MessageReactions.Add(reaction1);

        // 5. Attachments
        var sampleFileBytes = Encoding.UTF8.GetBytes("CONFIDENTIAL_CLINICAL_ATTACHMENT_DATA_FOR_MIGRATION_VERIFICATION");
        var encResult = await crypto.EncryptAsync(sampleFileBytes, tenantId, facilityId);

        var attachmentId = Guid.NewGuid();
        var storagePath = await storage.SaveEncryptedAttachmentAsync(tenantId, facilityId, attachmentId, encResult.Ciphertext);

        var attachment = new MessageAttachment
        {
            Id = attachmentId,
            TenantId = tenantId,
            FacilityId = facilityId,
            MessageId = msg1.Id,
            OriginalFileName = "lab_report.pdf",
            SafeFileName = "lab_report.pdf",
            ContentType = "application/pdf",
            OriginalSizeBytes = sampleFileBytes.Length,
            SanitizedSizeBytes = sampleFileBytes.Length,
            StoragePath = storagePath,
            SHA256Checksum = encResult.PlainSha256Checksum,
            Status = AttachmentStatus.Clean,
            EncryptionAlgorithm = encResult.Metadata.Algorithm,
            EncryptionKeyId = encResult.Metadata.KeyId,
            EncryptionIvBase64 = encResult.Metadata.IvBase64,
            EncryptionTagBase64 = encResult.Metadata.TagBase64,
            WrappedKeyJson = encResult.Metadata.WrappedKeyJson
        };
        db.MessageAttachments.Add(attachment);

        // 6. Eligibility Grants
        var grant = new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            FacilityId = facilityId,
            FacilityType = "Clinic",
            PatientId = Guid.NewGuid(),
            ContextType = "Encounter",
            ContextId = "enc-123",
            WindowStartUtc = DateTime.UtcNow.AddHours(-1),
            WindowEndUtc = DateTime.UtcNow.AddDays(7),
            IsActive = true
        };
        db.EligibilityGrants.Add(grant);

        // 7. Guest Invites
        var guestInvite = new GuestInvite
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            FacilityId = facilityId,
            CallId = Guid.NewGuid(),
            InviteTokenHash = GuestInvite.ComputeTokenHash("TEST_TOKEN_12345"),
            ExpectedDobHash = GuestInvite.ComputeExpectedDobHash(Guid.NewGuid(), "1990-01-01"),
            OtpHash = GuestInvite.ComputeOtpHash(Guid.NewGuid(), "123456"),
            AttemptCount = 0,
            Status = GuestInviteStatus.Pending,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(1)
        };
        db.GuestInvites.Add(guestInvite);

        // 8. Interop Outbox (Pending before drain)
        var outboxMsg = new InteropOutboxMessage
        {
            MessageId = Guid.NewGuid(),
            CorrelationId = conv1.Id,
            Type = "comms.message.replicate",
            EnvelopeJson = $"{{\"TenantId\":\"{tenantId}\",\"FacilityId\":\"{facilityId}\",\"Content\":\"Test outbox\"}}",
            CreatedAtUtc = DateTime.UtcNow,
            AttemptCount = 0,
            NextAttemptAtUtc = DateTime.UtcNow
        };
        db.InteropOutbox.Add(outboxMsg);

        await db.SaveChangesAsync();
    }

    public void Dispose()
    {
        SignerKey.Dispose();
        try
        {
            if (Directory.Exists(TempDirectory))
            {
                Directory.Delete(TempDirectory, true);
            }
        }
        catch { /* ignore cleanup errors */ }
    }
}
