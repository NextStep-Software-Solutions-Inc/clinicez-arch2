using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.Communications.Commands;
using ClinicEz.Patient.Application.Features.Communications.DTOs;
using ClinicEz.Patient.Application.Features.Communications.Queries;
using ClinicEz.Patient.Application.Tests.Interop;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Infrastructure.BackgroundServices;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Patient.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Metadata.Profiles.Exif;
using SixLabors.ImageSharp.PixelFormats;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Adversarial;

/// <summary>
/// Adversarial stress-test battery for Milestone M5:
/// - Truthful delivery lifecycle: Sending -> Waiting -> Received -> NotReceived
/// - Late confirmation: Late confirmation arriving after sweeper marked NotReceived flips state to Received with recipient's true ReceivedAtUtc
/// - One-tap resend: Resending reuses identical ClientMessageId and recipient deduplicates without creating double messages
/// - Image conversion & media security: Executables rejected by magic bytes, WebP/HEIC transcoded to JPEG, EXIF stripped, PDF active scripts quarantined
/// - "Hide My Copy" isolation: Local replica hidden with zero outbound hub envelopes and zero modification to facility master
/// </summary>
public class DeliveryTruthAndMediaSecurityAdversarialTests
{
    // =========================================================================
    // 1. Truthful Delivery Lifecycle (Sending -> Waiting -> Received -> NotReceived)
    // =========================================================================

    [Fact]
    public async Task DeliveryTruthLifecycle_FullStateTransitions_SendingToWaitingToReceivedToNotReceived()
    {
        // ARRANGE
        using var harness = new PatientInteropHarness();
        var patientId = Guid.NewGuid();
        var convId = Guid.NewGuid();
        const string clerkUserId = "clerk_user_truth_lifecycle_001";
        const string facilityName = "St. Jude Clinic";

        await harness.WithDbAsync(async db =>
        {
            db.Patients.Add(new Domain.Entities.Patient
            {
                Id = patientId,
                ClerkUserId = clerkUserId,
                FirstName = "Juan",
                LastName = "Luna",
                ClinicEzId = "CE-JUAN-001"
            });

            db.PatientConversations.Add(new PatientConversation
            {
                Id = convId,
                PatientId = patientId,
                HomeTenantId = "tenant-stjude",
                HomeFacilityId = "fac-stjude-1",
                HomeFacilityType = "Clinic",
                FacilityName = facilityName,
                Category = MessageCategory.Scheduling,
                Subject = "Consultation Request",
                Status = RequestStatus.Answered,
                IsHiddenByPatient = false
            });

            // Register active device session for zero-PHI push alerts
            db.DeviceSessions.Add(new DeviceSession
            {
                Id = Guid.NewGuid(),
                PatientId = patientId,
                DeviceId = "dev-juan-ios",
                DeviceLabel = "iPhone 15 Pro",
                ClerkSessionId = "sess_juan_001",
                PushToken = "ExponentPushToken[juan-push-token-123]",
                LastActiveAt = DateTime.UtcNow,
                IsRevoked = false
            });

            await db.SaveChangesAsync();
        });

        // STEP 1: Lifecycle state "Sending" -> Client-side initiation
        // The message entity concept defines DeliveryState.Sending before outbox acceptance.
        var clientMessageId = Guid.NewGuid();

        // STEP 2: Submission moves state to "Waiting"
        var submitHandler = new SubmitPatientMessageCommandHandler(
            harness.Provider.GetRequiredService<IPatientRepository>(),
            harness.Provider.GetRequiredService<IPatientCommunicationsRepository>(),
            harness.Provider.GetRequiredService<IUnitOfWork>(),
            harness.Provider.GetRequiredService<IInteropPublisher>());

        var submitResult = await submitHandler.Handle(new SubmitPatientMessageCommand(
            ConversationId: convId,
            ClerkUserId: clerkUserId,
            ContentText: "Hello doctor, what time can I visit?",
            ClientMessageId: clientMessageId), CancellationToken.None);

        submitResult.DeliveryState.Should().Be(DeliveryState.Waiting, "Submission into outbox must transition message to Waiting state.");
        submitResult.ClientMessageId.Should().Be(clientMessageId);
        submitResult.RetentionDeadlineUtc.Should().BeAfter(DateTime.UtcNow.AddDays(6));

        // Verify outbox contains comms.message.submit
        await harness.WithDbAsync(async db =>
        {
            var outboxMsg = await db.InteropOutbox
                .Where(o => o.Type == InteropTypes.CommsMessageSubmit)
                .FirstOrDefaultAsync();
            outboxMsg.Should().NotBeNull("Submission must queue an outbox envelope to the facility home cell.");
        });

        // STEP 3: "Waiting" -> "Received" on arrival of receipt confirmation
        var facilityReceiptTimestamp = DateTime.UtcNow.AddSeconds(5);
        var ackPayload = new CommsMessageReceivedPayload(
            MessageId: submitResult.Id,
            ConversationId: convId,
            RecipientPartyAddress: "facility:tenant-stjude/fac-stjude-1#comms",
            ReceivedAtUtc: facilityReceiptTimestamp);

        var ackEnvelope = InteropEnvelope.Create(
            type: InteropTypes.CommsMessageReceived,
            from: Party.ForFacility("tenant-stjude", "fac-stjude-1", FacilityType.Clinic, InteropServices.Comms),
            to: Party.ForPatient(patientId.ToString()),
            correlationId: convId,
            payload: ackPayload);

        await harness.DeliverAsync(ackEnvelope);

        // Verify state is now Received with exact recipient timestamp
        await harness.WithDbAsync(async db =>
        {
            var msg = await db.PatientMessages.FindAsync(submitResult.Id);
            msg.Should().NotBeNull();
            msg!.DeliveryState.Should().Be(DeliveryState.Received, "Receipt confirmation must flip state to Received.");
            msg.ReceivedAtUtc.Should().Be(facilityReceiptTimestamp, "Truthful delivery must store the recipient's true receipt time.");
        });

        // STEP 4: "Waiting" -> "NotReceived" when retention deadline expires without ACK
        Guid unconfirmedMsgId = Guid.Empty;
        await harness.WithDbAsync(async db =>
        {
            var expiredMessage = new PatientMessage
            {
                Id = Guid.NewGuid(),
                ConversationId = convId,
                Seq = 99,
                ClientMessageId = Guid.NewGuid(),
                SenderType = "Patient",
                SenderId = patientId,
                SenderName = "Juan Luna",
                ContentText = "Unanswered question that times out.",
                DeliveryState = DeliveryState.Waiting,
                RetentionDeadlineUtc = DateTime.UtcNow.AddMinutes(-5), // Expired!
                HasExpiredBannerShown = false
            };
            db.PatientMessages.Add(expiredMessage);
            await db.SaveChangesAsync();
            unconfirmedMsgId = expiredMessage.Id;
        });

        // Execute background retention sweeper
        var sweeper = new DeliveryRetentionSweeper(
            harness.Provider,
            NullLogger<DeliveryRetentionSweeper>.Instance);

        await sweeper.SweepExpiredMessagesAsync();

        // Verify state transitioned to NotReceived
        await harness.WithDbAsync(async db =>
        {
            var msg = await db.PatientMessages.FindAsync(unconfirmedMsgId);
            msg.Should().NotBeNull();
            msg!.DeliveryState.Should().Be(DeliveryState.NotReceived, "Expired unconfirmed messages must transition to NotReceived.");
        });

        // Verify Zero-PHI push alert was dispatched
        var pushService = harness.Provider.GetRequiredService<IPushNotificationService>();
        await pushService.Received(1).SendPushNotificationAsync(
            "ExponentPushToken[juan-push-token-123]",
            "Message Delivery Notice",
            $"Your message to {facilityName} was not received. Tap to resend.",
            "messages",
            Arg.Any<CancellationToken>());
    }

    // =========================================================================
    // 2. Late Confirmation Overrides NotReceived (Late Truth Wins)
    // =========================================================================

    [Fact]
    public async Task TruthfulDelivery_LateConfirmation_FlipsNotReceivedToReceived_WithTruthfulTimestamp()
    {
        // ARRANGE: An edge clinic was offline for days. The patient's message reached NotReceived locally.
        using var harness = new PatientInteropHarness();
        var patientId = Guid.NewGuid();
        var convId = Guid.NewGuid();
        var messageId = Guid.NewGuid();
        const string clerkUserId = "clerk_user_late_truth_002";

        await harness.WithDbAsync(async db =>
        {
            db.Patients.Add(new Domain.Entities.Patient
            {
                Id = patientId,
                ClerkUserId = clerkUserId,
                FirstName = "Corazon",
                LastName = "Aquino",
                ClinicEzId = "CE-CORY-001"
            });

            db.PatientConversations.Add(new PatientConversation
            {
                Id = convId,
                PatientId = patientId,
                HomeTenantId = "tenant-offline",
                HomeFacilityId = "fac-offline-1",
                HomeFacilityType = "Clinic",
                FacilityName = "Batanes Remote Clinic",
                Category = MessageCategory.MedicineQuestion,
                Subject = "Antibiotic dosage inquiry",
                Status = RequestStatus.Answered,
                IsHiddenByPatient = false
            });

            // Message already swept to NotReceived after 7-day retention expired
            db.PatientMessages.Add(new PatientMessage
            {
                Id = messageId,
                ConversationId = convId,
                Seq = 1,
                ClientMessageId = Guid.NewGuid(),
                SenderType = "Patient",
                SenderId = patientId,
                SenderName = "Corazon Aquino",
                ContentText = "Can I take amoxicillin with meals?",
                DeliveryState = DeliveryState.NotReceived,
                RetentionDeadlineUtc = DateTime.UtcNow.AddDays(-2),
                HasExpiredBannerShown = true
            });

            await db.SaveChangesAsync();
        });

        // ACT: Remote edge facility finally synchronizes and delivers late comms.message.received confirmation.
        // Recipient stored the message at recipientActualReceiptUtc (e.g. 3 days ago).
        var recipientActualReceiptUtc = DateTime.UtcNow.AddDays(-3);
        var ackPayload = new CommsMessageReceivedPayload(
            MessageId: messageId,
            ConversationId: convId,
            RecipientPartyAddress: "facility:tenant-offline/fac-offline-1#comms",
            ReceivedAtUtc: recipientActualReceiptUtc);

        var ackEnvelope = InteropEnvelope.Create(
            type: InteropTypes.CommsMessageReceived,
            from: Party.ForFacility("tenant-offline", "fac-offline-1", FacilityType.Clinic, InteropServices.Comms),
            to: Party.ForPatient(patientId.ToString()),
            correlationId: convId,
            payload: ackPayload);

        await harness.DeliverAsync(ackEnvelope);

        // ASSERT: Late truth wins!
        await harness.WithDbAsync(async db =>
        {
            var msg = await db.PatientMessages.FindAsync(messageId);
            msg.Should().NotBeNull();
            msg!.DeliveryState.Should().Be(DeliveryState.Received, "Late confirmation must override NotReceived to Received.");
            msg.ReceivedAtUtc.Should().Be(recipientActualReceiptUtc, "ReceivedAtUtc must reflect the recipient's true historical receipt timestamp.");
            msg.HasExpiredBannerShown.Should().BeFalse("Expired banner flag must be cleared when confirmation arrives.");
        });

        // Verify SignalR event was broadcast to active patient client
        var syncNotifier = harness.Provider.GetRequiredService<ISyncNotificationService>();
        await syncNotifier.Received().NotifyCommsEventAsync(
            patientId,
            "MessageDeliveryStateChanged",
            Arg.Is<object>(o => o.ToString()!.Contains("Received")),
            Arg.Any<CancellationToken>());
    }

    // =========================================================================
    // 3. One-Tap Resend & Recipient Deduplication
    // =========================================================================

    [Fact]
    public async Task OneTapResend_ReusesIdenticalClientMessageId_AndRecipientDeduplicatesWithoutDoubleMessages()
    {
        // ARRANGE
        using var harness = new PatientInteropHarness();
        var patientId = Guid.NewGuid();
        var convId = Guid.NewGuid();
        var messageId = Guid.NewGuid();
        var originalClientMessageId = Guid.NewGuid();
        const string clerkUserId = "clerk_user_resend_dedup_003";

        await harness.WithDbAsync(async db =>
        {
            db.Patients.Add(new Domain.Entities.Patient
            {
                Id = patientId,
                ClerkUserId = clerkUserId,
                FirstName = "Marcelo",
                LastName = "Del Pilar",
                ClinicEzId = "CE-MARCELO-001"
            });

            db.PatientConversations.Add(new PatientConversation
            {
                Id = convId,
                PatientId = patientId,
                HomeTenantId = "tenant-manila",
                HomeFacilityId = "fac-manila-1",
                HomeFacilityType = "Clinic",
                FacilityName = "Manila Central Clinic",
                Category = MessageCategory.PrescriptionRefill,
                Subject = "Insulin prescription renewal",
                Status = RequestStatus.Answered,
                IsHiddenByPatient = false
            });

            db.PatientMessages.Add(new PatientMessage
            {
                Id = messageId,
                ConversationId = convId,
                Seq = 1,
                ClientMessageId = originalClientMessageId,
                SenderType = "Patient",
                SenderId = patientId,
                SenderName = "Marcelo Del Pilar",
                ContentText = "Need renewal for Lantus insulin.",
                DeliveryState = DeliveryState.NotReceived,
                RetentionDeadlineUtc = DateTime.UtcNow.AddMinutes(-10),
                HasExpiredBannerShown = true
            });

            await db.SaveChangesAsync();
        });

        // ACT 1: Patient taps "Resend"
        PatientMessageDto resendResult;
        using (var scope = harness.Provider.CreateScope())
        {
            var resendHandler = new ResendPatientMessageCommandHandler(
                scope.ServiceProvider.GetRequiredService<IPatientRepository>(),
                scope.ServiceProvider.GetRequiredService<IPatientCommunicationsRepository>(),
                scope.ServiceProvider.GetRequiredService<IUnitOfWork>(),
                scope.ServiceProvider.GetRequiredService<IInteropPublisher>());

            resendResult = await resendHandler.Handle(
                new ResendPatientMessageCommand(convId, messageId, clerkUserId), CancellationToken.None);
        }

        // ASSERT 1: State reset to Waiting, retention renewed, ClientMessageId preserved
        resendResult.DeliveryState.Should().Be(DeliveryState.Waiting);
        resendResult.ClientMessageId.Should().Be(originalClientMessageId, "One-tap resend MUST preserve the identical ClientMessageId.");
        resendResult.RetentionDeadlineUtc.Should().BeAfter(DateTime.UtcNow.AddDays(6));

        // Verify outbox envelope contains the exact same ClientMessageId
        await harness.WithDbAsync(async db =>
        {
            var outboxMsg = await db.InteropOutbox
                .Where(o => o.Type == InteropTypes.CommsMessageSubmit)
                .OrderByDescending(o => o.CreatedAtUtc)
                .FirstOrDefaultAsync();

            outboxMsg.Should().NotBeNull();
            outboxMsg!.EnvelopeJson.Should().Contain(originalClientMessageId.ToString(),
                "Outbox envelope must carry the identical ClientMessageId to allow recipient deduplication.");
        });

        // ACT 2: Simulate Recipient Plane receiving replication of resent message
        // Recipient plane delivers comms.message.replicate back or handles deduplication
        var replicatePayload = new CommsMessageReplicatePayload(
            MessageId: messageId,
            ConversationId: convId,
            Seq: 1,
            TenantId: "tenant-manila",
            FacilityId: "fac-manila-1",
            SenderType: "Patient",
            SenderId: patientId,
            SenderDisplayName: "Marcelo Del Pilar",
            ContentText: "Need renewal for Lantus insulin.",
            Visibility: MessageVisibility.Public,
            RequiresAcknowledgement: false,
            Attachments: null,
            SentAtUtc: DateTime.UtcNow,
            RetentionDeadlineUtc: DateTime.UtcNow.AddDays(7),
            State: DeliveryState.Waiting);

        var replicateEnvelope = InteropEnvelope.Create(
            type: InteropTypes.CommsMessageReplicate,
            from: Party.ForFacility("tenant-manila", "fac-manila-1", FacilityType.Clinic, InteropServices.Comms),
            to: Party.ForPatient(patientId.ToString()),
            correlationId: convId,
            payload: replicatePayload);

        // Deliver twice to simulate duplicate network delivery
        await harness.DeliverAsync(replicateEnvelope);
        await harness.DeliverAsync(replicateEnvelope);

        // Deliver receipt confirmation to canonically transition delivery state to Received
        var ackPayload = new CommsMessageReceivedPayload(
            MessageId: messageId,
            ConversationId: convId,
            RecipientPartyAddress: "facility:tenant-manila/fac-manila-1#comms",
            ReceivedAtUtc: DateTime.UtcNow);

        var ackEnvelope = InteropEnvelope.Create(
            type: InteropTypes.CommsMessageReceived,
            from: Party.ForFacility("tenant-manila", "fac-manila-1", FacilityType.Clinic, InteropServices.Comms),
            to: Party.ForPatient(patientId.ToString()),
            correlationId: convId,
            payload: ackPayload);

        await harness.DeliverAsync(ackEnvelope);

        // ASSERT 2: Recipient deduplicates! Total message count remains exactly 1, zero double messages!
        await harness.WithDbAsync(async db =>
        {
            var messageCount = await db.PatientMessages
                .Where(m => m.ConversationId == convId && m.ClientMessageId == originalClientMessageId)
                .CountAsync();

            messageCount.Should().Be(1, "Recipient deduplication must ensure ZERO duplicate messages are created.");

            var msg = await db.PatientMessages.FindAsync(messageId);
            msg!.DeliveryState.Should().Be(DeliveryState.Received, "Receipt confirmation sets state to Received.");
        });

        // ACT 3: Verify resend rejected if message is already Received
        using (var scope = harness.Provider.CreateScope())
        {
            var resendHandler = new ResendPatientMessageCommandHandler(
                scope.ServiceProvider.GetRequiredService<IPatientRepository>(),
                scope.ServiceProvider.GetRequiredService<IPatientCommunicationsRepository>(),
                scope.ServiceProvider.GetRequiredService<IUnitOfWork>(),
                scope.ServiceProvider.GetRequiredService<IInteropPublisher>());

            var actAlreadyDelivered = async () =>
            {
                await resendHandler.Handle(
                    new ResendPatientMessageCommand(convId, messageId, clerkUserId), CancellationToken.None);
            };
            await actAlreadyDelivered.Should().ThrowAsync<ValidationException>()
                .WithMessage("*already been delivered*");
        }
    }

    // =========================================================================
    // 4. Image Conversion & Security Pipeline
    // =========================================================================

    [Fact]
    public async Task ImageSecurity_ExecutableMagicBytesSpoofing_RejectedWithExplicitReason()
    {
        var service = new ImageConversionService(NullLogger<ImageConversionService>.Instance);

        // 1. Windows MZ Executable header disguised as JPEG
        var mzBytes = new byte[] { 0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00 };
        using var mzStream = new MemoryStream(mzBytes);
        var resultMz = await service.ProcessAndSanitizeImageAsync(mzStream, "xray_scan.jpg", "image/jpeg");
        resultMz.IsClean.Should().BeFalse();
        resultMz.ErrorReason.Should().Contain("Windows executable (MZ)");

        // 2. Linux ELF Binary header disguised as JPEG
        var elfBytes = new byte[] { 0x7F, 0x45, 0x4C, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00 };
        using var elfStream = new MemoryStream(elfBytes);
        var resultElf = await service.ProcessAndSanitizeImageAsync(elfStream, "prescription.jpg", "image/jpeg");
        resultElf.IsClean.Should().BeFalse();
        resultElf.ErrorReason.Should().Contain("Linux ELF binary");

        // 3. Dangerous executable extensions rejected (.exe, .ps1, .sh, .bat)
        foreach (var dangerousExt in new[] { "exploit.exe", "script.bat", "run.ps1", "payload.sh", "install.msi" })
        {
            using var s = new MemoryStream(new byte[32]);
            var res = await service.ProcessAndSanitizeImageAsync(s, dangerousExt, "image/jpeg");
            res.IsClean.Should().BeFalse();
            res.ErrorReason.Should().Contain("dangerous file extension");
        }

        // 4. Extension spoofing: Genuine PDF bytes disguised with .jpg extension
        var pdfBytes = Encoding.ASCII.GetBytes("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF");
        using var pdfFakeJpgStream = new MemoryStream(pdfBytes);
        var resMismatch = await service.ProcessAndSanitizeImageAsync(pdfFakeJpgStream, "document.jpg", "image/jpeg");
        resMismatch.IsClean.Should().BeFalse();
        resMismatch.ErrorReason.Should().Contain("Magic bytes mismatch");

        // 5. Zero-byte empty stream rejected
        using var emptyStream = new MemoryStream();
        var resEmpty = await service.ProcessAndSanitizeImageAsync(emptyStream, "empty.jpg", "image/jpeg");
        resEmpty.IsClean.Should().BeFalse();
        resEmpty.ErrorReason.Should().Contain("Empty file provided");
    }

    [Fact]
    public async Task ImageSecurity_Transcoding_WebPAndHeic_ConvertedToStandardJpeg()
    {
        var service = new ImageConversionService(NullLogger<ImageConversionService>.Instance);

        // 1. Transcode genuine WebP image to standard JPEG
        using var webpImage = new Image<Rgba32>(150, 150, Color.DeepSkyBlue);
        using var webpMs = new MemoryStream();
        await webpImage.SaveAsWebpAsync(webpMs);
        webpMs.Position = 0;

        var webpResult = await service.ProcessAndSanitizeImageAsync(webpMs, "clinical_photo.webp", "image/webp");
        webpResult.IsClean.Should().BeTrue();
        webpResult.ContentType.Should().Be("image/jpeg");
        webpResult.FileName.Should().Be("clinical_photo.jpg");
        webpResult.WasConverted.Should().BeTrue();
        webpResult.WasExifStripped.Should().BeTrue();
        webpResult.Data.Should().NotBeEmpty();

        // Verify that the resulting byte array is decodable as a valid JPEG image
        using (var decMs = new MemoryStream(webpResult.Data))
        {
            using var decoded = await Image.LoadAsync(decMs);
            decoded.Width.Should().Be(150);
            decoded.Height.Should().Be(150);
        }

        // 2. Transcode HEIC container format to JPEG
        // Construct standard ISO-BMFF box header with 'ftypheic' brand
        var heicBytes = new byte[64];
        // Length 64 big-endian
        heicBytes[3] = 0x40;
        // 'ftyp' box type
        heicBytes[4] = 0x66; heicBytes[5] = 0x74; heicBytes[6] = 0x79; heicBytes[7] = 0x70;
        // 'heic' major brand
        heicBytes[8] = 0x68; heicBytes[9] = 0x65; heicBytes[10] = 0x69; heicBytes[11] = 0x63;

        using var heicStream = new MemoryStream(heicBytes);
        var heicResult = await service.ProcessAndSanitizeImageAsync(heicStream, "ios_capture.heic", "image/heic");
        heicResult.IsClean.Should().BeTrue();
        heicResult.ContentType.Should().Be("image/jpeg");
        heicResult.FileName.Should().Be("ios_capture.jpg");
        heicResult.WasConverted.Should().BeTrue();
        heicResult.WasExifStripped.Should().BeTrue();
    }

    [Fact]
    public async Task ImageSecurity_ExifMetadata_CompletelyStrippedFromJpegs()
    {
        var service = new ImageConversionService(NullLogger<ImageConversionService>.Instance);

        // Generate JPEG with rich EXIF metadata (camera model, software, GPS)
        using var imageWithExif = new Image<Rgba32>(120, 120, Color.ForestGreen);
        var exifProfile = new ExifProfile();
        exifProfile.SetValue(ExifTag.Software, "ClinicEZ Mobile Camera v2.1");
        exifProfile.SetValue(ExifTag.Make, "Apple");
        exifProfile.SetValue(ExifTag.Model, "iPhone 15 Pro Max");
        imageWithExif.Metadata.ExifProfile = exifProfile;

        using var inMs = new MemoryStream();
        await imageWithExif.SaveAsJpegAsync(inMs, new JpegEncoder());
        inMs.Position = 0;

        // Process image through sanitization pipeline
        var result = await service.ProcessAndSanitizeImageAsync(inMs, "sensitive_patient_wound.jpg", "image/jpeg");
        result.IsClean.Should().BeTrue();
        result.WasExifStripped.Should().BeTrue();

        // Inspect output image metadata to verify complete stripping of EXIF tags
        using var outMs = new MemoryStream(result.Data);
        using var sanitized = await Image.LoadAsync(outMs);
        sanitized.Metadata.ExifProfile.Should().BeNull("All EXIF tags (software, make, model, GPS) must be completely stripped.");
        sanitized.Metadata.IptcProfile.Should().BeNull();
        sanitized.Metadata.XmpProfile.Should().BeNull();
    }

    [Fact]
    public async Task ImageSecurity_PdfActiveScriptQuarantine_ActiveTokensAndDangerousElementsRejected()
    {
        var service = new ImageConversionService(NullLogger<ImageConversionService>.Instance);

        // 1. PDF containing /JavaScript active scripting
        var pdfJs = Encoding.UTF8.GetBytes("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R /OpenAction << /S /JavaScript /JS (app.alert('XSS');) >> >>\nendobj\n%%EOF");
        using var s1 = new MemoryStream(pdfJs);
        var res1 = await service.ProcessAndSanitizeImageAsync(s1, "lab_report.pdf", "application/pdf");
        res1.IsClean.Should().BeFalse();
        res1.ErrorReason.Should().Contain("active token '/JavaScript'");

        // 2. PDF containing /Launch token (executable launcher)
        var pdfLaunch = Encoding.UTF8.GetBytes("%PDF-1.4\n1 0 obj\n<< /Type /Action /S /Launch /F (calc.exe) >>\nendobj\n%%EOF");
        using var s2 = new MemoryStream(pdfLaunch);
        var res2 = await service.ProcessAndSanitizeImageAsync(s2, "invoice.pdf", "application/pdf");
        res2.IsClean.Should().BeFalse();
        res2.ErrorReason.Should().Contain("active token '/Launch'");

        // 3. PDF containing /EmbeddedFiles token
        var pdfEmbedded = Encoding.UTF8.GetBytes("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Names << /EmbeddedFiles 2 0 R >> >>\nendobj\n%%EOF");
        using var s3 = new MemoryStream(pdfEmbedded);
        var res3 = await service.ProcessAndSanitizeImageAsync(s3, "records.pdf", "application/pdf");
        res3.IsClean.Should().BeFalse();
        res3.ErrorReason.Should().Contain("active token '/EmbeddedFiles'");

        // 4. Clean genuine PDF passes security scan
        var cleanPdf = Encoding.UTF8.GetBytes("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF");
        using var s4 = new MemoryStream(cleanPdf);
        var res4 = await service.ProcessAndSanitizeImageAsync(s4, "official_immunization.pdf", "application/pdf");
        res4.IsClean.Should().BeTrue();
        res4.ContentType.Should().Be("application/pdf");
        res4.Data.Should().NotBeEmpty();
    }

    // =========================================================================
    // 5. "Hide My Copy" Isolation & Zero Hub Envelopes
    // =========================================================================

    [Fact]
    public async Task HideMyCopy_SetsFlagLocally_EmitsZeroHubMessages_AndLeavesFacilityMasterUntouched()
    {
        // ARRANGE
        using var harness = new PatientInteropHarness();
        var patientId = Guid.NewGuid();
        var conversationId = Guid.NewGuid();
        const string clerkUserId = "clerk_user_hide_copy_005";

        await harness.WithDbAsync(async db =>
        {
            db.Patients.Add(new Domain.Entities.Patient
            {
                Id = patientId,
                ClerkUserId = clerkUserId,
                FirstName = "Apolinario",
                LastName = "Mabini",
                ClinicEzId = "CE-MABINI-001"
            });

            db.PatientConversations.Add(new PatientConversation
            {
                Id = conversationId,
                PatientId = patientId,
                HomeTenantId = "tenant-batangas",
                HomeFacilityId = "fac-batangas-1",
                HomeFacilityType = "Clinic",
                FacilityName = "Batangas Health Care",
                Category = MessageCategory.Other,
                Subject = "Confidential Inquiry",
                Status = RequestStatus.Answered,
                LastMessagePreview = "Your prescription is ready.",
                LastMessageAtUtc = DateTime.UtcNow,
                IsHiddenByPatient = false
            });

            await db.SaveChangesAsync();
        });

        // ACT: Patient calls Hide My Copy
        var hideHandler = new HidePatientConversationCopyCommandHandler(
            harness.Provider.GetRequiredService<IPatientRepository>(),
            harness.Provider.GetRequiredService<IPatientCommunicationsRepository>(),
            harness.Provider.GetRequiredService<IUnitOfWork>());

        var success = await hideHandler.Handle(
            new HidePatientConversationCopyCommand(conversationId, clerkUserId), CancellationToken.None);

        success.Should().BeTrue();

        // ASSERT 1: Patient replica updated locally
        await harness.WithDbAsync(async db =>
        {
            var conv = await db.PatientConversations.FindAsync(conversationId);
            conv.Should().NotBeNull();
            conv!.IsHiddenByPatient.Should().BeTrue("IsHiddenByPatient must be set to true on the patient replica.");
            conv.HiddenAtUtc.Should().NotBeNull("HiddenAtUtc timestamp must be captured.");

            // ASSERT 2: STRICT PRIVACY INVARIANT - ZERO outbound Interop Hub envelopes
            var outboxCount = await db.InteropOutbox.CountAsync();
            outboxCount.Should().Be(0, "Hide My Copy MUST emit strictly ZERO Interop Hub messages. Facility master is untouched.");
        });

        // ASSERT 3: Querying the unified inbox hides the conversation from patient view
        var queryHandler = new GetPatientConversationsQueryHandler(
            harness.Provider.GetRequiredService<IPatientRepository>(),
            harness.Provider.GetRequiredService<IPatientCommunicationsRepository>());

        var inboxList = await queryHandler.Handle(
            new GetPatientConversationsQuery(clerkUserId), CancellationToken.None);

        inboxList.Should().BeEmpty("Hidden conversation must NOT appear in the patient's active unified inbox.");

        // ASSERT 4: Unauthorized user cannot hide another patient's conversation
        var actStranger = async () =>
        {
            await hideHandler.Handle(
                new HidePatientConversationCopyCommand(conversationId, "stranger_clerk_user_999"), CancellationToken.None);
        };
        await actStranger.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*access*");
    }

    // =========================================================================
    // 6. Adversarial Attack Surface & Boundary Hardening
    // =========================================================================

    [Fact]
    public async Task Adversarial_SecurityHardening_InternalNotesAndUnauthorizedActionsBlocked()
    {
        using var harness = new PatientInteropHarness();
        var patientId = Guid.NewGuid();
        var convId = Guid.NewGuid();
        var internalMsgId = Guid.NewGuid();
        const string clerkUserId = "clerk_user_security_006";

        await harness.WithDbAsync(async db =>
        {
            db.Patients.Add(new Domain.Entities.Patient
            {
                Id = patientId,
                ClerkUserId = clerkUserId,
                FirstName = "Emilio",
                LastName = "Aguinaldo",
                ClinicEzId = "CE-EMILIO-001"
            });

            db.PatientConversations.Add(new PatientConversation
            {
                Id = convId,
                PatientId = patientId,
                HomeTenantId = "tenant-cavite",
                HomeFacilityId = "fac-cavite-1",
                HomeFacilityType = "Clinic",
                FacilityName = "Cavite Medical",
                Category = MessageCategory.Other,
                Subject = "Medical Inquiry",
                Status = RequestStatus.Closed, // Conversation is CLOSED
                IsHiddenByPatient = false
            });

            await db.SaveChangesAsync();
        });

        // ATTACK 1: Malicious or leaked internal staff note delivered via replication
        var internalPayload = new CommsMessageReplicatePayload(
            MessageId: internalMsgId,
            ConversationId: convId,
            Seq: 1,
            TenantId: "tenant-cavite",
            FacilityId: "fac-cavite-1",
            SenderType: "Staff",
            SenderId: Guid.NewGuid(),
            SenderDisplayName: "Dr. Clinician",
            ContentText: "INTERNAL TRIAGE NOTE: Patient has non-compliance history.",
            Visibility: MessageVisibility.Internal, // STRICT PRIVACY INVARIANT
            RequiresAcknowledgement: false,
            Attachments: null,
            SentAtUtc: DateTime.UtcNow,
            RetentionDeadlineUtc: DateTime.UtcNow.AddDays(7),
            State: DeliveryState.Waiting);

        var internalEnvelope = InteropEnvelope.Create(
            type: InteropTypes.CommsMessageReplicate,
            from: Party.ForFacility("tenant-cavite", "fac-cavite-1", FacilityType.Clinic, InteropServices.Comms),
            to: Party.ForPatient(patientId.ToString()),
            correlationId: convId,
            payload: internalPayload);

        await harness.DeliverAsync(internalEnvelope);

        // Verify the internal message was completely rejected and dropped
        await harness.WithDbAsync(async db =>
        {
            var storedMsg = await db.PatientMessages.FindAsync(internalMsgId);
            storedMsg.Should().BeNull("Internal clinical notes must NEVER be stored in the patient's database replica!");

            var outboxAck = await db.InteropOutbox
                .Where(o => o.Type == InteropTypes.CommsMessageReceived)
                .FirstOrDefaultAsync();
            outboxAck.Should().BeNull("No delivery confirmation must ever be emitted for internal notes.");
        });

        // ATTACK 2: Submitting a message to a closed thread
        var submitHandler = new SubmitPatientMessageCommandHandler(
            harness.Provider.GetRequiredService<IPatientRepository>(),
            harness.Provider.GetRequiredService<IPatientCommunicationsRepository>(),
            harness.Provider.GetRequiredService<IUnitOfWork>(),
            harness.Provider.GetRequiredService<IInteropPublisher>());

        var actClosed = async () =>
        {
            await submitHandler.Handle(new SubmitPatientMessageCommand(
                ConversationId: convId,
                ClerkUserId: clerkUserId,
                ContentText: "Can I still reply to this closed ticket?"), CancellationToken.None);
        };
        await actClosed.Should().ThrowAsync<ValidationException>()
            .WithMessage("*closed*");

        // ATTACK 3: Filename path traversal sanitization in image conversion
        var sanitizedName = ImageConversionService.SanitizeFileName("../../../../etc/passwd.jpg");
        sanitizedName.Should().NotContain("..");
        sanitizedName.Should().Be("passwd.jpg");
    }
}
