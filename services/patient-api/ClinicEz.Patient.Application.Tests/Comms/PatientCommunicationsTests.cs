using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.Communications.Commands;
using ClinicEz.Patient.Application.Features.Communications.Queries;
using ClinicEz.Patient.Application.Tests.Interop;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
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
using SixLabors.ImageSharp.PixelFormats;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Comms;

public class PatientCommunicationsTests
{
    [Fact]
    public async Task UnifiedInbox_ReturnsConversationsFromMultipleTenants_ExcludingHidden()
    {
        using var harness = new PatientInteropHarness();
        var patientId = Guid.NewGuid();
        const string clerkUserId = "user_clerk_unified_123";

        await harness.WithDbAsync(async db =>
        {
            var patient = new Domain.Entities.Patient
            {
                Id = patientId,
                ClerkUserId = clerkUserId,
                FirstName = "Maria",
                LastName = "Santos",
                ClinicEzId = "CE-MARIA-001"
            };
            db.Patients.Add(patient);

            // Conversation from Clinic A (Tenant A)
            db.PatientConversations.Add(new PatientConversation
            {
                Id = Guid.NewGuid(),
                PatientId = patientId,
                HomeTenantId = "tenant-a",
                HomeFacilityId = "facility-a",
                HomeFacilityType = "Clinic",
                FacilityName = "Healthway Clinic A",
                Category = MessageCategory.PostVisitFollowUp,
                Subject = "Follow-up",
                Status = RequestStatus.Answered,
                LastMessagePreview = "Please take your meds.",
                LastMessageAtUtc = DateTime.UtcNow.AddHours(-2),
                IsHiddenByPatient = false
            });

            // Conversation from Lab B (Tenant B)
            db.PatientConversations.Add(new PatientConversation
            {
                Id = Guid.NewGuid(),
                PatientId = patientId,
                HomeTenantId = "tenant-b",
                HomeFacilityId = "facility-b",
                HomeFacilityType = "Laboratory",
                FacilityName = "Hi-Precision Lab B",
                Category = MessageCategory.LabResultQuestion,
                Subject = "CBC Results",
                Status = RequestStatus.Answered,
                LastMessagePreview = "Your CBC results are ready.",
                LastMessageAtUtc = DateTime.UtcNow.AddHours(-1),
                IsHiddenByPatient = false
            });

            // Hidden conversation (should be excluded)
            db.PatientConversations.Add(new PatientConversation
            {
                Id = Guid.NewGuid(),
                PatientId = patientId,
                HomeTenantId = "tenant-c",
                HomeFacilityId = "facility-c",
                HomeFacilityType = "Clinic",
                FacilityName = "Private Clinic C",
                Category = MessageCategory.Other,
                Subject = "Confidential Inquiry",
                Status = RequestStatus.Closed,
                LastMessagePreview = "Closed topic.",
                LastMessageAtUtc = DateTime.UtcNow.AddDays(-1),
                IsHiddenByPatient = true
            });

            await db.SaveChangesAsync();
        });

        var queryHandler = new GetPatientConversationsQueryHandler(
            harness.Provider.GetRequiredService<IPatientRepository>(),
            harness.Provider.GetRequiredService<IPatientCommunicationsRepository>());

        var result = await queryHandler.Handle(new GetPatientConversationsQuery(clerkUserId), CancellationToken.None);

        result.Should().HaveCount(2);
        result.Select(c => c.HomeTenantId).Should().Contain(["tenant-a", "tenant-b"]);
        result.Select(c => c.FacilityName).Should().Contain(["Healthway Clinic A", "Hi-Precision Lab B"]);
        result.Should().NotContain(c => c.IsHiddenByPatient);
    }

    [Fact]
    public async Task DependentProxy_GuardianCanViewDependentInbox_StrangerForbidden()
    {
        using var harness = new PatientInteropHarness();
        var parentId = Guid.NewGuid();
        var childId = Guid.NewGuid();
        const string parentClerkId = "user_parent_777";
        const string strangerClerkId = "user_stranger_999";

        await harness.WithDbAsync(async db =>
        {
            var parent = new Domain.Entities.Patient
            {
                Id = parentId,
                ClerkUserId = parentClerkId,
                FirstName = "Rosa",
                LastName = "Reyes",
                ClinicEzId = "CE-ROSA-001"
            };
            var child = new Domain.Entities.Patient
            {
                Id = childId,
                ClerkUserId = null,
                ManagedByPatientId = parentId,
                RelationshipToManager = "Mother",
                FirstName = "Leo",
                LastName = "Reyes",
                ClinicEzId = "CE-LEO-002"
            };
            var stranger = new Domain.Entities.Patient
            {
                Id = Guid.NewGuid(),
                ClerkUserId = strangerClerkId,
                FirstName = "Juan",
                LastName = "Dela Cruz",
                ClinicEzId = "CE-JUAN-003"
            };

            db.Patients.AddRange(parent, child, stranger);

            db.PatientConversations.Add(new PatientConversation
            {
                Id = Guid.NewGuid(),
                PatientId = childId,
                HomeTenantId = "tenant-a",
                HomeFacilityId = "facility-a",
                HomeFacilityType = "Clinic",
                FacilityName = "Pediatric Clinic",
                Category = MessageCategory.Scheduling,
                Subject = "Vaccination Checkup",
                Status = RequestStatus.Submitted,
                LastMessagePreview = "Appointment scheduled.",
                LastMessageAtUtc = DateTime.UtcNow,
                IsHiddenByPatient = false
            });

            await db.SaveChangesAsync();
        });

        var queryHandler = new GetPatientConversationsQueryHandler(
            harness.Provider.GetRequiredService<IPatientRepository>(),
            harness.Provider.GetRequiredService<IPatientCommunicationsRepository>());

        // 1. Parent can query child's inbox using ?dependentId=childId
        var parentResult = await queryHandler.Handle(
            new GetPatientConversationsQuery(parentClerkId, DependentId: childId), CancellationToken.None);
        parentResult.Should().HaveCount(1);
        parentResult[0].Subject.Should().Be("Vaccination Checkup");

        // 2. Stranger querying child's inbox gets ForbiddenException
        var actStranger = async () => await queryHandler.Handle(
            new GetPatientConversationsQuery(strangerClerkId, DependentId: childId), CancellationToken.None);
        await actStranger.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task HideMyCopy_SetsFlagLocally_EmitsZeroHubMessages()
    {
        using var harness = new PatientInteropHarness();
        var patientId = Guid.NewGuid();
        var conversationId = Guid.NewGuid();
        const string clerkUserId = "user_hide_copy_123";

        await harness.WithDbAsync(async db =>
        {
            var patient = new Domain.Entities.Patient
            {
                Id = patientId,
                ClerkUserId = clerkUserId,
                FirstName = "Ana",
                LastName = "Luna",
                ClinicEzId = "CE-ANA-001"
            };
            db.Patients.Add(patient);

            db.PatientConversations.Add(new PatientConversation
            {
                Id = conversationId,
                PatientId = patientId,
                HomeTenantId = "tenant-a",
                HomeFacilityId = "facility-a",
                HomeFacilityType = "Clinic",
                FacilityName = "Clinic A",
                Category = MessageCategory.Other,
                Subject = "Private Chat",
                Status = RequestStatus.Answered,
                IsHiddenByPatient = false
            });

            await db.SaveChangesAsync();
        });

        var handler = new HidePatientConversationCopyCommandHandler(
            harness.Provider.GetRequiredService<IPatientRepository>(),
            harness.Provider.GetRequiredService<IPatientCommunicationsRepository>(),
            harness.Provider.GetRequiredService<IUnitOfWork>());

        var success = await handler.Handle(
            new HidePatientConversationCopyCommand(conversationId, clerkUserId), CancellationToken.None);
        success.Should().BeTrue();

        // Verify DB updated
        await harness.WithDbAsync(async db =>
        {
            var conv = await db.PatientConversations.FindAsync(conversationId);
            conv.Should().NotBeNull();
            conv!.IsHiddenByPatient.Should().BeTrue();
            conv.HiddenAtUtc.Should().NotBeNull();

            // Zero outbound envelopes generated by this command
            var outboxCount = await db.InteropOutbox.CountAsync();
            outboxCount.Should().Be(0, "Hide My Copy must emit strictly 0 Interop Hub envelopes.");
        });
    }

    [Fact]
    public async Task CommsMessageReplicate_WhenInternalNote_IsStrictlyDropped_NeverReplicated()
    {
        using var harness = new PatientInteropHarness();
        var patientId = Guid.NewGuid();
        var conversationId = Guid.NewGuid();
        var internalMessageId = Guid.NewGuid();

        await harness.WithDbAsync(async db =>
        {
            db.Patients.Add(new Domain.Entities.Patient
            {
                Id = patientId,
                ClerkUserId = "user_p_1",
                FirstName = "Test",
                LastName = "Patient",
                ClinicEzId = "CE-TEST-001"
            });
            await db.SaveChangesAsync();
        });

        // Deliver an internal note to the patient mailbox
        var payload = new CommsMessageReplicatePayload(
            MessageId: internalMessageId,
            ConversationId: conversationId,
            Seq: 1,
            TenantId: "tenant-a",
            FacilityId: "fac-1",
            SenderType: "Staff",
            SenderId: Guid.NewGuid(),
            SenderDisplayName: "Dr. Clinician",
            ContentText: "INTERNAL NOTE: Patient exhibits erratic symptoms.",
            Visibility: MessageVisibility.Internal, // STRICT PRIVACY INVARIANT
            RequiresAcknowledgement: false,
            Attachments: null,
            SentAtUtc: DateTime.UtcNow,
            RetentionDeadlineUtc: DateTime.UtcNow.AddDays(7),
            State: DeliveryState.Waiting
        );

        var envelope = InteropEnvelope.Create(
            type: InteropTypes.CommsMessageReplicate,
            from: Party.ForFacility("tenant-a", "fac-1", FacilityType.Clinic, InteropServices.Comms),
            to: Party.ForPatient(patientId.ToString()),
            correlationId: conversationId,
            payload: payload
        );

        await harness.DeliverAsync(envelope);

        // Verify the internal message was completely rejected and dropped
        await harness.WithDbAsync(async db =>
        {
            var storedMsg = await db.PatientMessages.FindAsync(internalMessageId);
            storedMsg.Should().BeNull("Internal notes must NEVER be stored in the patient plane!");

            var outboxAck = await db.InteropOutbox
                .Where(o => o.Type == InteropTypes.CommsMessageReceived)
                .FirstOrDefaultAsync();
            outboxAck.Should().BeNull("No delivery confirmation must ever be emitted for internal notes.");
        });
    }

    [Fact]
    public async Task CommsMessageReplicate_WhenPublic_PersistsMessage_AndSendsReceivedConfirmation()
    {
        using var harness = new PatientInteropHarness();
        var patientId = Guid.NewGuid();
        var conversationId = Guid.NewGuid();
        var messageId = Guid.NewGuid();

        await harness.WithDbAsync(async db =>
        {
            db.Patients.Add(new Domain.Entities.Patient
            {
                Id = patientId,
                ClerkUserId = "user_p_2",
                FirstName = "Clara",
                LastName = "Oswald",
                ClinicEzId = "CE-CLARA-002"
            });
            await db.SaveChangesAsync();
        });

        var payload = new CommsMessageReplicatePayload(
            MessageId: messageId,
            ConversationId: conversationId,
            Seq: 1,
            TenantId: "tenant-a",
            FacilityId: "fac-1",
            SenderType: "Staff",
            SenderId: Guid.NewGuid(),
            SenderDisplayName: "Nurse Joy",
            ContentText: "Your lab results are ready for pickup.",
            Visibility: MessageVisibility.Public,
            RequiresAcknowledgement: false,
            Attachments: null,
            SentAtUtc: DateTime.UtcNow,
            RetentionDeadlineUtc: DateTime.UtcNow.AddDays(7),
            State: DeliveryState.Waiting
        );

        var envelope = InteropEnvelope.Create(
            type: InteropTypes.CommsMessageReplicate,
            from: Party.ForFacility("tenant-a", "fac-1", FacilityType.Clinic, InteropServices.Comms),
            to: Party.ForPatient(patientId.ToString()),
            correlationId: conversationId,
            payload: payload
        );

        await harness.DeliverAsync(envelope);

        await harness.WithDbAsync(async db =>
        {
            var msg = await db.PatientMessages.FindAsync(messageId);
            msg.Should().NotBeNull();
            msg!.DeliveryState.Should().Be(DeliveryState.Received);
            msg.ContentText.Should().Be("Your lab results are ready for pickup.");

            // Confirmed that comms.message.received was enqueued back to facility
            var ack = await db.InteropOutbox
                .Where(o => o.Type == InteropTypes.CommsMessageReceived)
                .FirstOrDefaultAsync();
            ack.Should().NotBeNull();
            ack!.EnvelopeJson.Should().Contain("facility:tenant-a/fac-1#comms");
        });
    }

    [Fact]
    public async Task TruthfulDelivery_LateConfirmation_FlipsNotReceivedToReceived()
    {
        using var harness = new PatientInteropHarness();
        var patientId = Guid.NewGuid();
        var conversationId = Guid.NewGuid();
        var messageId = Guid.NewGuid();

        await harness.WithDbAsync(async db =>
        {
            var patient = new Domain.Entities.Patient
            {
                Id = patientId,
                ClerkUserId = "user_truth_1",
                FirstName = "Grace",
                LastName = "Hopper",
                ClinicEzId = "CE-GRACE-001"
            };
            db.Patients.Add(patient);

            var conv = new PatientConversation
            {
                Id = conversationId,
                PatientId = patientId,
                HomeTenantId = "tenant-a",
                HomeFacilityId = "fac-1",
                HomeFacilityType = "Clinic",
                FacilityName = "Clinic A",
                Category = MessageCategory.Other,
                Subject = "Inquiry",
                Status = RequestStatus.Answered
            };
            db.PatientConversations.Add(conv);

            // Message was previously expired by the retention sweeper -> NotReceived
            var msg = new PatientMessage
            {
                Id = messageId,
                ConversationId = conversationId,
                Seq = 1,
                ClientMessageId = Guid.NewGuid(),
                SenderType = "Patient",
                SenderId = patientId,
                SenderName = "Grace Hopper",
                ContentText = "Is the clinic open today?",
                DeliveryState = DeliveryState.NotReceived,
                RetentionDeadlineUtc = DateTime.UtcNow.AddMinutes(-10),
                HasExpiredBannerShown = true
            };
            db.PatientMessages.Add(msg);

            await db.SaveChangesAsync();
        });

        // Late confirmation arrives from facility
        var receivedTime = DateTime.UtcNow;
        var ackPayload = new CommsMessageReceivedPayload(
            MessageId: messageId,
            ConversationId: conversationId,
            RecipientPartyAddress: "facility:tenant-a/fac-1#comms",
            ReceivedAtUtc: receivedTime
        );

        var ackEnvelope = InteropEnvelope.Create(
            type: InteropTypes.CommsMessageReceived,
            from: Party.ForFacility("tenant-a", "fac-1", FacilityType.Clinic, InteropServices.Comms),
            to: Party.ForPatient(patientId.ToString()),
            correlationId: conversationId,
            payload: ackPayload
        );

        await harness.DeliverAsync(ackEnvelope);

        // Verify Late Truth Won: state transitions NotReceived -> Received with true ReceivedAtUtc
        await harness.WithDbAsync(async db =>
        {
            var msg = await db.PatientMessages.FindAsync(messageId);
            msg.Should().NotBeNull();
            msg!.DeliveryState.Should().Be(DeliveryState.Received);
            msg.ReceivedAtUtc.Should().BeCloseTo(receivedTime, TimeSpan.FromSeconds(2));
            msg.HasExpiredBannerShown.Should().BeFalse();
        });
    }

    [Fact]
    public async Task Resend_ReusesIdenticalClientMessageId_AndResetsToWaiting()
    {
        using var harness = new PatientInteropHarness();
        var patientId = Guid.NewGuid();
        var conversationId = Guid.NewGuid();
        var messageId = Guid.NewGuid();
        var originalClientMessageId = Guid.NewGuid();
        const string clerkUserId = "user_resend_123";

        await harness.WithDbAsync(async db =>
        {
            var patient = new Domain.Entities.Patient
            {
                Id = patientId,
                ClerkUserId = clerkUserId,
                FirstName = "Alan",
                LastName = "Turing",
                ClinicEzId = "CE-ALAN-001"
            };
            db.Patients.Add(patient);

            var conv = new PatientConversation
            {
                Id = conversationId,
                PatientId = patientId,
                HomeTenantId = "tenant-a",
                HomeFacilityId = "fac-1",
                HomeFacilityType = "Clinic",
                FacilityName = "Bletchley Health",
                Category = MessageCategory.PrescriptionRefill,
                Subject = "Medication Refill",
                Status = RequestStatus.Answered
            };
            db.PatientConversations.Add(conv);

            var msg = new PatientMessage
            {
                Id = messageId,
                ConversationId = conversationId,
                Seq = 1,
                ClientMessageId = originalClientMessageId,
                SenderType = "Patient",
                SenderId = patientId,
                SenderName = "Alan Turing",
                ContentText = "Need refill for asthma inhaler.",
                DeliveryState = DeliveryState.NotReceived,
                RetentionDeadlineUtc = DateTime.UtcNow.AddMinutes(-5),
                HasExpiredBannerShown = true
            };
            db.PatientMessages.Add(msg);

            await db.SaveChangesAsync();
        });

        var resendHandler = new ResendPatientMessageCommandHandler(
            harness.Provider.GetRequiredService<IPatientRepository>(),
            harness.Provider.GetRequiredService<IPatientCommunicationsRepository>(),
            harness.Provider.GetRequiredService<IUnitOfWork>(),
            harness.Provider.GetRequiredService<IInteropPublisher>());

        var result = await resendHandler.Handle(
            new ResendPatientMessageCommand(conversationId, messageId, clerkUserId), CancellationToken.None);

        result.DeliveryState.Should().Be(DeliveryState.Waiting);
        result.ClientMessageId.Should().Be(originalClientMessageId, "Resend must preserve identical ClientMessageId.");

        // Verify outbox re-queued with same ClientMessageId
        await harness.WithDbAsync(async db =>
        {
            var outboxMsg = await db.InteropOutbox
                .Where(o => o.Type == InteropTypes.CommsMessageSubmit)
                .OrderByDescending(o => o.CreatedAtUtc)
                .FirstOrDefaultAsync();
            outboxMsg.Should().NotBeNull();
            outboxMsg!.EnvelopeJson.Should().Contain(originalClientMessageId.ToString());
        });
    }

    [Fact]
    public async Task Understood_SingleTapAcknowledgement_FlipsIsAcknowledged_AndEnqueuesAck()
    {
        using var harness = new PatientInteropHarness();
        var patientId = Guid.NewGuid();
        var conversationId = Guid.NewGuid();
        var messageId = Guid.NewGuid();
        const string clerkUserId = "user_ack_123";

        await harness.WithDbAsync(async db =>
        {
            var patient = new Domain.Entities.Patient
            {
                Id = patientId,
                ClerkUserId = clerkUserId,
                FirstName = "Ada",
                LastName = "Lovelace",
                ClinicEzId = "CE-ADA-001"
            };
            db.Patients.Add(patient);

            var conv = new PatientConversation
            {
                Id = conversationId,
                PatientId = patientId,
                HomeTenantId = "tenant-a",
                HomeFacilityId = "fac-1",
                HomeFacilityType = "Clinic",
                FacilityName = "Lovelace Health",
                Category = MessageCategory.PostVisitFollowUp,
                Subject = "Post-Visit",
                Status = RequestStatus.Answered
            };
            db.PatientConversations.Add(conv);

            var msg = new PatientMessage
            {
                Id = messageId,
                ConversationId = conversationId,
                Seq = 1,
                ClientMessageId = Guid.NewGuid(),
                SenderType = "Staff",
                SenderName = "Dr. Babbage",
                ContentText = "Do not eat or drink after midnight before blood draw.",
                RequiresAcknowledgement = true,
                IsAcknowledged = false,
                DeliveryState = DeliveryState.Received
            };
            db.PatientMessages.Add(msg);

            await db.SaveChangesAsync();
        });

        var ackHandler = new AcknowledgePatientMessageCommandHandler(
            harness.Provider.GetRequiredService<IPatientRepository>(),
            harness.Provider.GetRequiredService<IPatientCommunicationsRepository>(),
            harness.Provider.GetRequiredService<IUnitOfWork>(),
            harness.Provider.GetRequiredService<IInteropPublisher>());

        var success = await ackHandler.Handle(
            new AcknowledgePatientMessageCommand(conversationId, messageId, clerkUserId), CancellationToken.None);
        success.Should().BeTrue();

        await harness.WithDbAsync(async db =>
        {
            var msg = await db.PatientMessages.FindAsync(messageId);
            msg.Should().NotBeNull();
            msg!.IsAcknowledged.Should().BeTrue();
            msg.AcknowledgedAtUtc.Should().NotBeNull();
            msg.AcknowledgedByName.Should().Be("Ada Lovelace");

            var outboxAck = await db.InteropOutbox
                .Where(o => o.Type == InteropTypes.CommsMessageAcknowledged)
                .FirstOrDefaultAsync();
            outboxAck.Should().NotBeNull();
            outboxAck!.EnvelopeJson.Should().Contain(messageId.ToString());
        });
    }

    [Fact]
    public async Task ImageConversionService_RejectsExecutableFiles_AndDangerousExtensions()
    {
        var service = new ImageConversionService(NullLogger<ImageConversionService>.Instance);

        // 1. MZ Executable header disguised as image
        var mzBytes = new byte[] { 0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00 };
        using var mzStream = new MemoryStream(mzBytes);
        var resultMz = await service.ProcessAndSanitizeImageAsync(mzStream, "report.jpg", "image/jpeg");
        resultMz.IsClean.Should().BeFalse();
        resultMz.ErrorReason.Should().Contain("Windows executable (MZ)");

        // 2. Dangerous extension (.bat) disguised with jpeg MIME
        var dummyBytes = new byte[32];
        using var batStream = new MemoryStream(dummyBytes);
        var resultBat = await service.ProcessAndSanitizeImageAsync(batStream, "script.bat", "image/jpeg");
        resultBat.IsClean.Should().BeFalse();
        resultBat.ErrorReason.Should().Contain("dangerous file extension");

        // 3. Dangerous PDF containing /JavaScript active token
        var pdfWithJs = Encoding.UTF8.GetBytes("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R /OpenAction << /S /JavaScript /JS (app.alert('PWNED');) >> >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF");
        using var pdfStream = new MemoryStream(pdfWithJs);
        var resultPdf = await service.ProcessAndSanitizeImageAsync(pdfStream, "exploit.pdf", "application/pdf");
        resultPdf.IsClean.Should().BeFalse();
        resultPdf.ErrorReason.Should().Contain("active token '/JavaScript'");
    }

    [Fact]
    public async Task ImageConversionService_SanitizesImage_AndTranscodesToJpeg()
    {
        var service = new ImageConversionService(NullLogger<ImageConversionService>.Instance);

        // Create a genuine 100x100 RGB image using ImageSharp saved as WebP
        using var image = new Image<Rgba32>(100, 100, Color.Teal);
        using var ms = new MemoryStream();
        await image.SaveAsWebpAsync(ms);
        ms.Position = 0;

        var result = await service.ProcessAndSanitizeImageAsync(ms, "photo.webp", "image/webp");
        result.IsClean.Should().BeTrue();
        result.ContentType.Should().Be("image/jpeg");
        result.FileName.Should().EndWith(".jpg");
        result.Data.Should().NotBeEmpty();
        result.HashSha256.Should().NotBeNullOrWhiteSpace();
        result.WasExifStripped.Should().BeTrue();
    }
}
