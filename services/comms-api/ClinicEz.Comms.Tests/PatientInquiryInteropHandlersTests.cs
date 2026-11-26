using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Features.Conversations.Queries;
using ClinicEz.Comms.Application.Features.Messages.Commands;
using ClinicEz.Comms.Application.Features.Triage.Commands;
using ClinicEz.Comms.Application.Models;
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

public class PatientInquiryInteropHandlersTests
{
    private const string TenantId = "tenant-nextstep";
    private const string FacilityId = "11111111-1111-1111-1111-111111111111";

    private readonly Mock<ICommsRealtimeNotifier> _notifierMock = new();
    private readonly Mock<IInteropPublisher> _publisherMock = new();

    [Fact]
    public async Task CommsRequestSubmitHandler_WithActiveGrant_CreatesConversationAndAcksPatient()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var patientId = Guid.NewGuid();
        var requestId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            FacilityId = FacilityId,
            FacilityType = "Clinic",
            PatientId = patientId,
            ContextType = "Appointment",
            ContextId = Guid.NewGuid().ToString(),
            WindowStartUtc = now.AddMinutes(-5),
            WindowEndUtc = now.AddDays(7),
            IsActive = true,
            Version = 1
        });
        await db.SaveChangesAsync();

        var handler = new CommsRequestSubmitHandler(
            db,
            _notifierMock.Object,
            _publisherMock.Object,
            NullLogger<CommsRequestSubmitHandler>.Instance);

        var payload = new CommsRequestSubmitPayload(
            RequestId: requestId,
            TenantId: TenantId,
            FacilityId: FacilityId,
            FacilityType: "Clinic",
            PatientId: patientId,
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.Scheduling,
            ContentText: "Checking in regarding my 5:00 PM appointment.",
            IsEmergencyConfirmed: false,
            Attachments: null,
            SubmittedAtUtc: now,
            PatientDisplayName: "Justine Mae Tabasan");

        var ctx = new InteropMessageContext(new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            Type = InteropTypes.CommsRequestSubmit,
            From = Party.ForPatient(patientId.ToString()),
            To = Party.ForFacility(TenantId, FacilityId, FacilityType.Clinic, InteropServices.Comms),
            CorrelationId = requestId
        });

        await handler.HandleAsync(payload, ctx, CancellationToken.None);
        // Duplicate redelivery must be idempotent
        await handler.HandleAsync(payload, ctx, CancellationToken.None);

        var conv = await db.Conversations
            .Include(c => c.Messages)
            .Include(c => c.Participants)
            .SingleAsync(c => c.Id == requestId);

        Assert.Equal(patientId, conv.PatientId);
        Assert.Equal(RequestStatus.WithTriage, conv.Status);
        Assert.Equal(ConversationScope.PatientFacility, conv.Scope);
        Assert.Equal("Justine Mae Tabasan", conv.Title);
        Assert.Single(conv.Participants);
        Assert.Equal("Justine Mae Tabasan", conv.Participants.First().DisplayName);
        Assert.Single(conv.Messages);
        Assert.Equal(DeliveryState.Received, conv.Messages.First().State);
        Assert.Equal("Justine Mae Tabasan", conv.Messages.First().SenderDisplayName);

        _notifierMock.Verify(n => n.NotifyConversationCreatedAsync(It.IsAny<ConversationDto>(), It.IsAny<CancellationToken>()), Times.Once);
        _publisherMock.Verify(p => p.Enqueue(
            InteropTypes.CommsMessageReceived,
            It.IsAny<Party>(),
            It.Is<Party>(to => to.Kind == PartyKind.Patient && to.PatientId == patientId.ToString()),
            requestId,
            It.IsAny<CommsMessageReceivedPayload>(),
            It.IsAny<int>(),
            It.IsAny<TimeSpan?>()), Times.Once);
        _publisherMock.Verify(p => p.Enqueue(
            InteropTypes.CommsThreadStateChanged,
            It.IsAny<Party>(),
            It.Is<Party>(to => to.Kind == PartyKind.Patient && to.PatientId == patientId.ToString()),
            requestId,
            It.Is<CommsThreadStateChangedPayload>(s => s.NewStatus == RequestStatus.WithTriage),
            It.IsAny<int>(),
            It.IsAny<TimeSpan?>()), Times.Once);
    }

    [Fact]
    public async Task CommsRequestSubmitHandler_WithoutActiveGrant_DeclinesTruthfullyWithoutThrowing()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var patientId = Guid.NewGuid();
        var requestId = Guid.NewGuid();

        var handler = new CommsRequestSubmitHandler(
            db,
            _notifierMock.Object,
            _publisherMock.Object,
            NullLogger<CommsRequestSubmitHandler>.Instance);

        var payload = new CommsRequestSubmitPayload(
            RequestId: requestId,
            TenantId: TenantId,
            FacilityId: FacilityId,
            FacilityType: "Clinic",
            PatientId: patientId,
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.Other,
            ContentText: "Unauthorized inquiry",
            IsEmergencyConfirmed: false,
            Attachments: null,
            SubmittedAtUtc: DateTime.UtcNow);

        var ctx = new InteropMessageContext(new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            Type = InteropTypes.CommsRequestSubmit,
            From = Party.ForPatient(patientId.ToString()),
            To = Party.ForFacility(TenantId, FacilityId, FacilityType.Clinic, InteropServices.Comms),
            CorrelationId = requestId
        });

        await handler.HandleAsync(payload, ctx, CancellationToken.None);

        Assert.Empty(db.Conversations);
        _publisherMock.Verify(p => p.Enqueue(
            InteropTypes.CommsThreadStateChanged,
            It.IsAny<Party>(),
            It.Is<Party>(to => to.Kind == PartyKind.Patient && to.PatientId == patientId.ToString()),
            requestId,
            It.Is<CommsThreadStateChangedPayload>(s => s.NewStatus == RequestStatus.Declined && s.DeclineReasonCode == "DECLINE-02"),
            It.IsAny<int>(),
            It.IsAny<TimeSpan?>()), Times.Once);
    }

    [Fact]
    public async Task CommsMessageSubmitReceivedAndAck_EndToEndPatientAndStaffSync()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var patientId = Guid.NewGuid();
        var convId = Guid.NewGuid();
        var staffMsgId = Guid.NewGuid();

        db.Conversations.Add(new Conversation
        {
            Id = convId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            Scope = ConversationScope.PatientFacility,
            Kind = ConversationKind.PatientTriage,
            PatientId = patientId,
            Status = RequestStatus.Routed,
            LastSeq = 1,
            MessageCount = 1
        });
        db.Messages.Add(new Message
        {
            Id = staffMsgId,
            ConversationId = convId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            Seq = 1,
            SenderType = "Staff",
            SenderDisplayName = "Nurse Joy",
            ContentText = "Please fast for 8 hours before arrival.",
            Visibility = MessageVisibility.Public,
            State = DeliveryState.Waiting,
            RequiresAcknowledgement = true,
            RetentionDeadlineUtc = DateTime.UtcNow.AddDays(7)
        });
        await db.SaveChangesAsync();

        var clientMsgId = Guid.NewGuid();
        var submitHandler = new CommsMessageSubmitHandler(
            db, _notifierMock.Object, _publisherMock.Object, NullLogger<CommsMessageSubmitHandler>.Instance);

        var submitPayload = new CommsMessageSubmitPayload(
            ClientMessageId: clientMsgId,
            ConversationId: convId,
            TenantId: TenantId,
            FacilityId: FacilityId,
            SenderType: "Patient",
            SenderId: patientId,
            SenderDisplayName: "Justine Mae",
            ContentText: "Thank you, noted!",
            Visibility: MessageVisibility.Internal, // Must be forced to Public for Patient
            RequiresAcknowledgement: false,
            Attachments: null,
            ClientSentAtUtc: DateTime.UtcNow,
            RetentionDeadlineUtc: DateTime.UtcNow.AddDays(7));

        var submitCtx = new InteropMessageContext(new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            Type = InteropTypes.CommsMessageSubmit,
            From = Party.ForPatient(patientId.ToString()),
            To = Party.ForFacility(TenantId, FacilityId, FacilityType.Clinic, InteropServices.Comms),
            CorrelationId = convId
        });

        await submitHandler.HandleAsync(submitPayload, submitCtx, CancellationToken.None);
        await submitHandler.HandleAsync(submitPayload, submitCtx, CancellationToken.None);

        var patientMsg = await db.Messages.SingleAsync(m => m.ClientMessageId == clientMsgId);
        Assert.Equal(2, patientMsg.Seq);
        Assert.Equal(MessageVisibility.Public, patientMsg.Visibility);

        var receivedHandler = new CommsMessageReceivedHandler(
            db, _notifierMock.Object, NullLogger<CommsMessageReceivedHandler>.Instance);
        await receivedHandler.HandleAsync(
            new CommsMessageReceivedPayload(staffMsgId, convId, $"patient:{patientId}", DateTime.UtcNow),
            submitCtx,
            CancellationToken.None);

        var ackHandler = new CommsMessageAcknowledgedHandler(
            db, _notifierMock.Object, NullLogger<CommsMessageAcknowledgedHandler>.Instance);
        await ackHandler.HandleAsync(
            new CommsMessageAcknowledgedPayload(staffMsgId, convId, patientId, "Justine Mae", DateTime.UtcNow),
            submitCtx,
            CancellationToken.None);

        var updatedStaffMsg = await db.Messages.FindAsync(staffMsgId);
        Assert.NotNull(updatedStaffMsg);
        Assert.Equal(DeliveryState.Received, updatedStaffMsg!.State);
        Assert.True(updatedStaffMsg.IsAcknowledged);
    }

    [Fact]
    public async Task SendMessage_AndDisposition_OnPatientFacility_ReplicatePublicOnlyToPatient()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var patientId = Guid.NewGuid();
        var convId = Guid.NewGuid();

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
            MessageCount = 1
        });
        await db.SaveChangesAsync();

        var serializerMock = new Mock<ITranscriptSerializer>();
        var dispHandler = new RecordTriageDispositionCommandHandler(
            db, _notifierMock.Object, serializerMock.Object, _publisherMock.Object);

        await dispHandler.Handle(
            new RecordTriageDispositionCommand(
                convId,
                TenantId,
                "staff-1",
                "Nurse Joy",
                new[] { "messaging:triage" },
                TriageDisposition.Routed,
                AssignedStaffId: "doc-1",
                AssignedStaffName: "Dr. Santos",
                Priority: "Routine",
                InternalNote: "Confidential internal triage note",
                PublicResponseText: "Routed to Dr. Santos."),
            CancellationToken.None);

        // Public response replicated to patient; internal note NEVER replicated
        _publisherMock.Verify(p => p.Enqueue(
            InteropTypes.CommsMessageReplicate,
            It.IsAny<Party>(),
            It.Is<Party>(to => to.Kind == PartyKind.Patient && to.PatientId == patientId.ToString()),
            convId,
            It.Is<CommsMessageReplicatePayload>(r => r.ContentText == "Routed to Dr. Santos." && r.Visibility == MessageVisibility.Public),
            It.IsAny<int>(),
            It.IsAny<TimeSpan?>()), Times.Once);

        _publisherMock.Verify(p => p.Enqueue(
            InteropTypes.CommsMessageReplicate,
            It.IsAny<Party>(),
            It.IsAny<Party>(),
            It.IsAny<Guid>(),
            It.Is<CommsMessageReplicatePayload>(r => r.Visibility == MessageVisibility.Internal),
            It.IsAny<int>(),
            It.IsAny<TimeSpan?>()), Times.Never);

        var sendHandler = new SendMessageCommandHandler(db, _notifierMock.Object, _publisherMock.Object);
        await sendHandler.Handle(
            new SendMessageCommand(convId, TenantId, FacilityId, "Staff", "doc-1", "Dr. Santos", "Secret internal chart note", MessageVisibility.Internal, false),
            CancellationToken.None);
        await sendHandler.Handle(
            new SendMessageCommand(convId, TenantId, FacilityId, "Staff", "doc-1", "Dr. Santos", "Please come at 5:00 PM.", MessageVisibility.Public, false),
            CancellationToken.None);

        _publisherMock.Verify(p => p.Enqueue(
            InteropTypes.CommsMessageReplicate,
            It.IsAny<Party>(),
            It.Is<Party>(to => to.Kind == PartyKind.Patient && to.PatientId == patientId.ToString()),
            convId,
            It.Is<CommsMessageReplicatePayload>(r => r.ContentText == "Please come at 5:00 PM."),
            It.IsAny<int>(),
            It.IsAny<TimeSpan?>()), Times.Once);
    }

    [Fact]
    public async Task CommsRequestSubmitHandler_WithoutPatientDisplayName_UsesFormattedCategoryFallback()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var patientId = Guid.NewGuid();
        var requestId = Guid.NewGuid();
        var now = DateTime.UtcNow;

        db.EligibilityGrants.Add(new EligibilityGrant
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            FacilityId = FacilityId,
            FacilityType = "Clinic",
            PatientId = patientId,
            ContextType = "Encounter",
            ContextId = Guid.NewGuid().ToString(),
            WindowStartUtc = now.AddMinutes(-5),
            WindowEndUtc = now.AddDays(7),
            IsActive = true,
            Version = 1
        });
        await db.SaveChangesAsync();

        var handler = new CommsRequestSubmitHandler(
            db, _notifierMock.Object, _publisherMock.Object, NullLogger<CommsRequestSubmitHandler>.Instance);

        var payload = new CommsRequestSubmitPayload(
            RequestId: requestId,
            TenantId: TenantId,
            FacilityId: FacilityId,
            FacilityType: "Clinic",
            PatientId: patientId,
            SubmittingAccountId: null,
            Relationship: null,
            Category: MessageCategory.PostVisitFollowUp,
            ContentText: "Follow up question",
            IsEmergencyConfirmed: false,
            Attachments: null,
            SubmittedAtUtc: now,
            PatientDisplayName: null);

        var ctx = new InteropMessageContext(new InteropEnvelope
        {
            MessageId = Guid.NewGuid(),
            Type = InteropTypes.CommsRequestSubmit,
            From = Party.ForPatient(patientId.ToString()),
            To = Party.ForFacility(TenantId, FacilityId, FacilityType.Clinic, InteropServices.Comms),
            CorrelationId = requestId
        });

        await handler.HandleAsync(payload, ctx, CancellationToken.None);

        var conv = await db.Conversations
            .Include(c => c.Messages)
            .Include(c => c.Participants)
            .SingleAsync(c => c.Id == requestId);

        Assert.Equal("Post-Visit Follow-Up Inquiry", conv.Title);
        Assert.Equal("Patient", conv.Participants.First().DisplayName);
        Assert.Equal("Patient", conv.Messages.First().SenderDisplayName);
    }

    [Fact]
    public void GetConversations_ResolveDisplayTitle_UpgradesLegacyRawCategoryInquiryTitle()
    {
        var patientId = Guid.NewGuid();
        var legacyWithNamedParticipant = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            FacilityId = FacilityId,
            Scope = ConversationScope.PatientFacility,
            Kind = ConversationKind.PatientTriage,
            Category = MessageCategory.PostVisitFollowUp,
            Title = "PostVisitFollowUp Inquiry",
            Participants =
            [
                new Participant
                {
                    ParticipantType = "Patient",
                    ParticipantId = patientId.ToString(),
                    DisplayName = "Justine Mae Tabasan",
                    Role = "Patient"
                }
            ]
        };

        Assert.Equal("Justine Mae Tabasan", GetConversationsQueryHandler.ResolveDisplayTitle(legacyWithNamedParticipant, "staff-1"));

        var legacyWithoutNamedParticipant = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = TenantId,
            FacilityId = FacilityId,
            Scope = ConversationScope.PatientFacility,
            Kind = ConversationKind.PatientTriage,
            Category = MessageCategory.PostVisitFollowUp,
            Title = "PostVisitFollowUp Inquiry",
            Participants =
            [
                new Participant
                {
                    ParticipantType = "Patient",
                    ParticipantId = patientId.ToString(),
                    DisplayName = "Patient",
                    Role = "Patient"
                }
            ]
        };

        Assert.Equal("Post-Visit Follow-Up Inquiry", GetConversationsQueryHandler.ResolveDisplayTitle(legacyWithoutNamedParticipant, "staff-1"));
    }
}
