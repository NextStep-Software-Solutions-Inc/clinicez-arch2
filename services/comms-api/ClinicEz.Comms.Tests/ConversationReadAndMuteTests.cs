using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Api.Controllers;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Features.Conversations.Commands;
using ClinicEz.Comms.Application.Features.Conversations.Queries;
using ClinicEz.Comms.Application.Features.Messages.Commands;
using ClinicEz.Comms.Application.Models;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Tests.Support;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace ClinicEz.Comms.Tests;

public class ConversationReadAndMuteTests
{
    private const string TenantId = "tenant-comms-test";
    private const string FacilityId = "fac-comms-test";

    private readonly Mock<ICommsRealtimeNotifier> _notifierMock = new();

    [Fact]
    public async Task GetConversations_ComputesPerStaffUnreadCount_ExcludesSelfAndClosedThreads()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var createHandler = new CreateConversationCommandHandler(db);
        var sendHandler = new SendMessageCommandHandler(db, _notifierMock.Object);
        var queryHandler = new GetConversationsQueryHandler(db);
        var byIdHandler = new GetConversationByIdQueryHandler(db);

        // 1. Direct conversation between Alice and Bob
        var directConv = await createHandler.Handle(new CreateConversationCommand(
            TenantId: TenantId,
            FacilityId: FacilityId,
            BranchId: null,
            Scope: ConversationScope.Direct,
            Kind: ConversationKind.Direct,
            Title: null,
            ContextType: null,
            ContextId: null,
            Category: null,
            IsEmergencyConfirmed: false,
            IsLocalOnly: false,
            CreatedBy: "staff-alice",
            Participants: new List<ParticipantInput>
            {
                new("Staff", "staff-bob", "Nurse Bob", "Member")
            },
            CreatedByDisplayName: "Dr. Alice"), CancellationToken.None);

        // Alice sends 1 message (should NOT count toward Alice's unread, SHOULD count toward Bob's unread)
        await sendHandler.Handle(new SendMessageCommand(
            directConv.Id, TenantId, FacilityId, "Staff", "staff-alice", "Dr. Alice",
            "Hi Bob", MessageVisibility.Public, false), CancellationToken.None);

        // Bob sends 2 messages (SHOULD count toward Alice's unread)
        var bobMsg1 = await sendHandler.Handle(new SendMessageCommand(
            directConv.Id, TenantId, FacilityId, "Staff", "staff-bob", "Nurse Bob",
            "Hi Alice #1", MessageVisibility.Public, false), CancellationToken.None);

        await sendHandler.Handle(new SendMessageCommand(
            directConv.Id, TenantId, FacilityId, "Staff", "staff-bob", "Nurse Bob",
            "Hi Alice #2", MessageVisibility.Public, false), CancellationToken.None);

        // 2. Facility conversation created by Bob (Alice has no explicit Participant row yet)
        var facilityConv = await createHandler.Handle(new CreateConversationCommand(
            TenantId: TenantId,
            FacilityId: FacilityId,
            BranchId: null,
            Scope: ConversationScope.Facility,
            Kind: ConversationKind.General,
            Title: "Nursing Station",
            ContextType: "Department",
            ContextId: "Nursing",
            Category: null,
            IsEmergencyConfirmed: false,
            IsLocalOnly: false,
            CreatedBy: "staff-bob",
            Participants: null,
            CreatedByDisplayName: "Nurse Bob"), CancellationToken.None);

        await sendHandler.Handle(new SendMessageCommand(
            facilityConv.Id, TenantId, FacilityId, "Staff", "staff-bob", "Nurse Bob",
            "Shift handoff ready", MessageVisibility.Public, false), CancellationToken.None);
        await sendHandler.Handle(new SendMessageCommand(
            facilityConv.Id, TenantId, FacilityId, "Staff", "staff-alice", "Dr. Alice",
            "Thanks Bob!", MessageVisibility.Public, false), CancellationToken.None);

        // 3. Closed conversation with unread messages -> UnreadCount MUST be 0
        var closedConv = await createHandler.Handle(new CreateConversationCommand(
            TenantId: TenantId,
            FacilityId: FacilityId,
            BranchId: null,
            Scope: ConversationScope.Facility,
            Kind: ConversationKind.General,
            Title: "Archived Channel",
            ContextType: null,
            ContextId: null,
            Category: null,
            IsEmergencyConfirmed: false,
            IsLocalOnly: false,
            CreatedBy: "staff-bob",
            Participants: null,
            CreatedByDisplayName: "Nurse Bob"), CancellationToken.None);

        await sendHandler.Handle(new SendMessageCommand(
            closedConv.Id, TenantId, FacilityId, "Staff", "staff-bob", "Nurse Bob",
            "Closing out", MessageVisibility.Public, false), CancellationToken.None);

        var closedEntity = await db.Conversations.FindAsync(closedConv.Id);
        Assert.NotNull(closedEntity);
        closedEntity.Status = RequestStatus.Closed;
        closedEntity.ClosedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync();

        // Query for Alice
        var aliceList = await queryHandler.Handle(new GetConversationsQuery(TenantId, FacilityId, StaffId: "staff-alice"), CancellationToken.None);
        Assert.Equal(2, aliceList.First(c => c.Id == directConv.Id).UnreadCount);
        Assert.Equal(1, aliceList.First(c => c.Id == facilityConv.Id).UnreadCount);
        Assert.Equal(0, aliceList.First(c => c.Id == closedConv.Id).UnreadCount);

        // Query for Bob
        var bobList = await queryHandler.Handle(new GetConversationsQuery(TenantId, FacilityId, StaffId: "staff-bob"), CancellationToken.None);
        Assert.Equal(1, bobList.First(c => c.Id == directConv.Id).UnreadCount);
        Assert.Equal(1, bobList.First(c => c.Id == facilityConv.Id).UnreadCount);
        Assert.Equal(0, bobList.First(c => c.Id == closedConv.Id).UnreadCount);

        // GetConversationByIdQuery parity
        var directByIdForAlice = await byIdHandler.Handle(new GetConversationByIdQuery(directConv.Id, TenantId, "staff-alice"), CancellationToken.None);
        Assert.NotNull(directByIdForAlice);
        Assert.Equal(2, directByIdForAlice.UnreadCount);

        // Partial read up to bobMsg1 -> 1 remaining unread for Alice
        var markHandler = new MarkConversationReadCommandHandler(db);
        await markHandler.Handle(new MarkConversationReadCommand(directConv.Id, TenantId, "staff-alice", "Dr. Alice", bobMsg1.MessageId), CancellationToken.None);

        var aliceAfterPartial = await byIdHandler.Handle(new GetConversationByIdQuery(directConv.Id, TenantId, "staff-alice"), CancellationToken.None);
        Assert.NotNull(aliceAfterPartial);
        Assert.Equal(1, aliceAfterPartial.UnreadCount);
    }

    [Fact]
    public async Task GetConversations_FallsBackToLastReadAtUtc_WhenLastReadMessageIdMissing()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var convId = Guid.NewGuid();
        var baseTime = new DateTime(2026, 11, 17, 10, 0, 0, DateTimeKind.Utc);

        var conv = new Conversation
        {
            Id = convId,
            TenantId = TenantId,
            FacilityId = FacilityId,
            Scope = ConversationScope.Facility,
            Kind = ConversationKind.General,
            Title = "Fallback Watermark",
            Status = RequestStatus.Routed,
            LastSeq = 3,
            MessageCount = 3,
            CreatedBy = "staff-bob",
            Participants = new List<Participant>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    ConversationId = convId,
                    TenantId = TenantId,
                    ParticipantType = "Staff",
                    ParticipantId = "staff-alice",
                    DisplayName = "Dr. Alice",
                    Role = "Member",
                    LastReadMessageId = Guid.NewGuid(), // Missing / purged message ID
                    LastReadAtUtc = baseTime.AddMinutes(5)
                }
            }
        };

        db.Conversations.Add(conv);
        db.Messages.AddRange(
            new Message
            {
                Id = Guid.NewGuid(),
                ConversationId = convId,
                TenantId = TenantId,
                FacilityId = FacilityId,
                Seq = 1,
                SenderId = "staff-bob",
                SenderDisplayName = "Bob",
                ContentText = "Before read",
                ServerReceivedAtUtc = baseTime
            },
            new Message
            {
                Id = Guid.NewGuid(),
                ConversationId = convId,
                TenantId = TenantId,
                FacilityId = FacilityId,
                Seq = 2,
                SenderId = "staff-bob",
                SenderDisplayName = "Bob",
                ContentText = "After read from Bob",
                ServerReceivedAtUtc = baseTime.AddMinutes(10)
            },
            new Message
            {
                Id = Guid.NewGuid(),
                ConversationId = convId,
                TenantId = TenantId,
                FacilityId = FacilityId,
                Seq = 3,
                SenderId = "staff-alice",
                SenderDisplayName = "Dr. Alice",
                ContentText = "After read from self",
                ServerReceivedAtUtc = baseTime.AddMinutes(11)
            });
        await db.SaveChangesAsync();

        var queryHandler = new GetConversationsQueryHandler(db);
        var result = await queryHandler.Handle(new GetConversationsQuery(TenantId, FacilityId, StaffId: "staff-alice"), CancellationToken.None);

        var dto = Assert.Single(result);
        Assert.Equal(1, dto.UnreadCount);
    }

    [Fact]
    public async Task MarkConversationReadCommand_ResetsUnreadCountToZeroAcrossReloads_AndEnrollsNonDirectParticipant()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var createHandler = new CreateConversationCommandHandler(db);
        var sendHandler = new SendMessageCommandHandler(db, _notifierMock.Object);
        var markReadHandler = new MarkConversationReadCommandHandler(db);
        var queryHandler = new GetConversationsQueryHandler(db);
        var byIdHandler = new GetConversationByIdQueryHandler(db);

        // Bob creates a Facility channel; Alice is NOT initially in Participants
        var conv = await createHandler.Handle(new CreateConversationCommand(
            TenantId: TenantId,
            FacilityId: FacilityId,
            BranchId: null,
            Scope: ConversationScope.Facility,
            Kind: ConversationKind.General,
            Title: "Triage Broadcast",
            ContextType: "Department",
            ContextId: "Triage",
            Category: null,
            IsEmergencyConfirmed: false,
            IsLocalOnly: false,
            CreatedBy: "staff-bob",
            Participants: null,
            CreatedByDisplayName: "Nurse Bob"), CancellationToken.None);

        var msg1 = await sendHandler.Handle(new SendMessageCommand(
            conv.Id, TenantId, FacilityId, "Staff", "staff-bob", "Nurse Bob",
            "Patient arriving", MessageVisibility.Public, false), CancellationToken.None);

        // Before mark read -> Alice sees UnreadCount = 1
        var beforeReload = await queryHandler.Handle(new GetConversationsQuery(TenantId, FacilityId, StaffId: "staff-alice"), CancellationToken.None);
        Assert.Equal(1, Assert.Single(beforeReload).UnreadCount);

        // Mark read with LastReadMessageId = null -> defaults to latest message (msg1)
        var readResult = await markReadHandler.Handle(new MarkConversationReadCommand(
            conv.Id, TenantId, "staff-alice", "Dr. Alice", null), CancellationToken.None);

        Assert.Equal(conv.Id, readResult.ConversationId);
        Assert.Equal(0, readResult.UnreadCount);
        Assert.Equal(msg1.MessageId, readResult.LastReadMessageId);

        // Reload -> UnreadCount is 0 and Alice's Participant row was persisted cleanly
        var afterReloadList = await queryHandler.Handle(new GetConversationsQuery(TenantId, FacilityId, StaffId: "staff-alice"), CancellationToken.None);
        var reloadedDto = Assert.Single(afterReloadList);
        Assert.Equal(0, reloadedDto.UnreadCount);
        var aliceParticipant = reloadedDto.Participants.FirstOrDefault(p => p.ParticipantId == "staff-alice");
        Assert.NotNull(aliceParticipant);
        Assert.Equal(msg1.MessageId, aliceParticipant.LastReadMessageId);
        Assert.NotNull(aliceParticipant.LastReadAtUtc);

        var afterReloadById = await byIdHandler.Handle(new GetConversationByIdQuery(conv.Id, TenantId, "staff-alice"), CancellationToken.None);
        Assert.NotNull(afterReloadById);
        Assert.Equal(0, afterReloadById.UnreadCount);

        // New message arrives from Bob -> UnreadCount increments to 1
        await sendHandler.Handle(new SendMessageCommand(
            conv.Id, TenantId, FacilityId, "Staff", "staff-bob", "Nurse Bob",
            "Vitals uploaded", MessageVisibility.Public, false), CancellationToken.None);

        var afterNewMsg = await queryHandler.Handle(new GetConversationsQuery(TenantId, FacilityId, StaffId: "staff-alice"), CancellationToken.None);
        Assert.Equal(1, Assert.Single(afterNewMsg).UnreadCount);
    }

    [Fact]
    public async Task SetConversationMuteCommand_PersistsIsMuted_WithoutClobberingReadWatermark()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var createHandler = new CreateConversationCommandHandler(db);
        var sendHandler = new SendMessageCommandHandler(db, _notifierMock.Object);
        var markReadHandler = new MarkConversationReadCommandHandler(db);
        var muteHandler = new SetConversationMuteCommandHandler(db);
        var queryHandler = new GetConversationsQueryHandler(db);

        var conv = await createHandler.Handle(new CreateConversationCommand(
            TenantId: TenantId,
            FacilityId: FacilityId,
            BranchId: null,
            Scope: ConversationScope.StaffContext,
            Kind: ConversationKind.General,
            Title: "Care Team: Maria",
            ContextType: "Patient",
            ContextId: "pat-123",
            Category: null,
            IsEmergencyConfirmed: false,
            IsLocalOnly: false,
            CreatedBy: "staff-bob",
            Participants: null,
            CreatedByDisplayName: "Nurse Bob"), CancellationToken.None);

        var msg = await sendHandler.Handle(new SendMessageCommand(
            conv.Id, TenantId, FacilityId, "Staff", "staff-bob", "Nurse Bob",
            "Lab result ready", MessageVisibility.Public, false), CancellationToken.None);

        // Alice mutes before reading -> creates Participant row with IsMuted = true, UnreadCount remains 1
        var mutedDto = await muteHandler.Handle(new SetConversationMuteCommand(
            conv.Id, TenantId, "staff-alice", "Dr. Alice", true), CancellationToken.None);

        Assert.True(mutedDto.IsMuted);
        Assert.Equal("staff-alice", mutedDto.ParticipantId);

        var listWhileMutedUnread = await queryHandler.Handle(new GetConversationsQuery(TenantId, FacilityId, StaffId: "staff-alice"), CancellationToken.None);
        var dto1 = Assert.Single(listWhileMutedUnread);
        Assert.Equal(1, dto1.UnreadCount);
        Assert.True(dto1.Participants.Single(p => p.ParticipantId == "staff-alice").IsMuted);

        // Alice marks read -> preserves IsMuted = true while setting LastReadMessageId
        await markReadHandler.Handle(new MarkConversationReadCommand(
            conv.Id, TenantId, "staff-alice", "Dr. Alice", null), CancellationToken.None);

        var listAfterRead = await queryHandler.Handle(new GetConversationsQuery(TenantId, FacilityId, StaffId: "staff-alice"), CancellationToken.None);
        var dto2 = Assert.Single(listAfterRead);
        Assert.Equal(0, dto2.UnreadCount);
        var aliceP = dto2.Participants.Single(p => p.ParticipantId == "staff-alice");
        Assert.True(aliceP.IsMuted);
        Assert.Equal(msg.MessageId, aliceP.LastReadMessageId);

        // Alice unmutes -> IsMuted = false, LastReadMessageId preserved
        var unmutedDto = await muteHandler.Handle(new SetConversationMuteCommand(
            conv.Id, TenantId, "staff-alice", "Dr. Alice", false), CancellationToken.None);

        Assert.False(unmutedDto.IsMuted);
        Assert.Equal(msg.MessageId, unmutedDto.LastReadMessageId);
        Assert.Equal(1, await db.Participants.CountAsync(p => p.ConversationId == conv.Id && p.ParticipantId == "staff-alice"));
    }

    [Fact]
    public async Task MarkReadAndMute_CrossTenantAndDirectOutsider_AreRejected()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var createHandler = new CreateConversationCommandHandler(db);
        var markReadHandler = new MarkConversationReadCommandHandler(db);
        var muteHandler = new SetConversationMuteCommandHandler(db);

        var directConv = await createHandler.Handle(new CreateConversationCommand(
            TenantId: "tenant-alpha",
            FacilityId: "fac-alpha",
            BranchId: null,
            Scope: ConversationScope.Direct,
            Kind: ConversationKind.Direct,
            Title: null,
            ContextType: null,
            ContextId: null,
            Category: null,
            IsEmergencyConfirmed: false,
            IsLocalOnly: false,
            CreatedBy: "staff-alice",
            Participants: new List<ParticipantInput>
            {
                new("Staff", "staff-bob", "Bob", "Member")
            },
            CreatedByDisplayName: "Alice"), CancellationToken.None);

        // Cross-tenant attempts throw NotFoundException
        await Assert.ThrowsAsync<NotFoundException>(() =>
            markReadHandler.Handle(new MarkConversationReadCommand(
                directConv.Id, "tenant-beta", "staff-alice", "Alice", null), CancellationToken.None));

        await Assert.ThrowsAsync<NotFoundException>(() =>
            muteHandler.Handle(new SetConversationMuteCommand(
                directConv.Id, "tenant-beta", "staff-alice", "Alice", true), CancellationToken.None));

        // Direct conversation outsider attempts throw ValidationException and do NOT enroll outsider
        await Assert.ThrowsAsync<ValidationException>(() =>
            markReadHandler.Handle(new MarkConversationReadCommand(
                directConv.Id, "tenant-alpha", "staff-eve", "Eve", null), CancellationToken.None));

        await Assert.ThrowsAsync<ValidationException>(() =>
            muteHandler.Handle(new SetConversationMuteCommand(
                directConv.Id, "tenant-alpha", "staff-eve", "Eve", true), CancellationToken.None));

        Assert.False(await db.Participants.AnyAsync(p => p.ConversationId == directConv.Id && p.ParticipantId == "staff-eve"));
    }

    [Fact]
    public async Task ConversationsController_MarkReadAndSetMuted_DispatchesCommandsWithAuthenticatedClaims()
    {
        var convId = Guid.NewGuid();
        var msgId = Guid.NewGuid();
        var mediatorMock = new Mock<IMediator>();

        mediatorMock
            .Setup(m => m.Send(It.IsAny<MarkConversationReadCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new MarkConversationReadResult(convId, 0, DateTime.UtcNow, msgId));

        mediatorMock
            .Setup(m => m.Send(It.IsAny<SetConversationMuteCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ParticipantDto(
                Guid.NewGuid(), convId, "tenant-1", "Staff", "staff-42", "Dr. House",
                "Member", DateTime.UtcNow, null, null, null, true));

        var controller = new ConversationsController(mediatorMock.Object)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                    [
                        new Claim("tenant_id", "tenant-1"),
                        new Claim("sub", "staff-42"),
                        new Claim("name", "Dr. House")
                    ], "TestAuth"))
                }
            }
        };

        var readAction = await controller.MarkRead(convId, null, CancellationToken.None);
        var readOk = Assert.IsType<OkObjectResult>(readAction.Result);
        var readPayload = Assert.IsType<MarkConversationReadResult>(readOk.Value);
        Assert.Equal(0, readPayload.UnreadCount);

        mediatorMock.Verify(m => m.Send(
            It.Is<MarkConversationReadCommand>(c =>
                c.ConversationId == convId &&
                c.TenantId == "tenant-1" &&
                c.StaffId == "staff-42" &&
                c.StaffDisplayName == "Dr. House" &&
                c.LastReadMessageId == null),
            It.IsAny<CancellationToken>()), Times.Once);

        var muteAction = await controller.SetMuted(convId, new SetConversationMuteApiRequest(true), CancellationToken.None);
        var muteOk = Assert.IsType<OkObjectResult>(muteAction.Result);
        var mutePayload = Assert.IsType<ParticipantDto>(muteOk.Value);
        Assert.True(mutePayload.IsMuted);

        mediatorMock.Verify(m => m.Send(
            It.Is<SetConversationMuteCommand>(c =>
                c.ConversationId == convId &&
                c.TenantId == "tenant-1" &&
                c.StaffId == "staff-42" &&
                c.StaffDisplayName == "Dr. House" &&
                c.IsMuted),
            It.IsAny<CancellationToken>()), Times.Once);

        // Verify HTTP route attributes
        var markReadMethod = typeof(ConversationsController).GetMethod(nameof(ConversationsController.MarkRead));
        var postAttr = markReadMethod?.GetCustomAttributes(typeof(HttpPostAttribute), false).OfType<HttpPostAttribute>().SingleOrDefault();
        Assert.NotNull(postAttr);
        Assert.Equal("{id:guid}/read", postAttr.Template);

        var setMutedMethod = typeof(ConversationsController).GetMethod(nameof(ConversationsController.SetMuted));
        var patchAttr = setMutedMethod?.GetCustomAttributes(typeof(HttpPatchAttribute), false).OfType<HttpPatchAttribute>().SingleOrDefault();
        Assert.NotNull(patchAttr);
        Assert.Equal("{id:guid}/mute", patchAttr.Template);
    }

    [Fact]
    public async Task GetConversations_BatchesAllWatermarkModesSimultaneously_IncludingNullSenderId()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var baseTime = new DateTime(2026, 11, 17, 12, 0, 0, DateTimeKind.Utc);

        var noWatermarkConvId = Guid.NewGuid();
        var seqWatermarkConvId = Guid.NewGuid();
        var timeWatermarkConvId = Guid.NewGuid();
        var seqWatermarkMsgId = Guid.NewGuid();

        db.Conversations.AddRange(
            new Conversation
            {
                Id = noWatermarkConvId,
                TenantId = TenantId,
                FacilityId = FacilityId,
                Scope = ConversationScope.Facility,
                Kind = ConversationKind.General,
                Title = "No Watermark",
                Status = RequestStatus.Routed,
                CreatedBy = "staff-bob"
            },
            new Conversation
            {
                Id = seqWatermarkConvId,
                TenantId = TenantId,
                FacilityId = FacilityId,
                Scope = ConversationScope.Facility,
                Kind = ConversationKind.General,
                Title = "Seq Watermark",
                Status = RequestStatus.Routed,
                CreatedBy = "staff-bob",
                Participants = new List<Participant>
                {
                    new()
                    {
                        Id = Guid.NewGuid(),
                        ConversationId = seqWatermarkConvId,
                        TenantId = TenantId,
                        ParticipantType = "Staff",
                        ParticipantId = "staff-alice",
                        DisplayName = "Dr. Alice",
                        Role = "Member",
                        LastReadMessageId = seqWatermarkMsgId,
                        LastReadAtUtc = baseTime
                    }
                }
            },
            new Conversation
            {
                Id = timeWatermarkConvId,
                TenantId = TenantId,
                FacilityId = FacilityId,
                Scope = ConversationScope.Facility,
                Kind = ConversationKind.General,
                Title = "Time Watermark",
                Status = RequestStatus.Routed,
                CreatedBy = "staff-bob",
                Participants = new List<Participant>
                {
                    new()
                    {
                        Id = Guid.NewGuid(),
                        ConversationId = timeWatermarkConvId,
                        TenantId = TenantId,
                        ParticipantType = "Staff",
                        ParticipantId = "staff-alice",
                        DisplayName = "Dr. Alice",
                        Role = "Member",
                        LastReadMessageId = null,
                        LastReadAtUtc = baseTime
                    }
                }
            });

        db.Messages.AddRange(
            // No-watermark: 1 system message (SenderId == null), 1 from Bob, 1 from Alice (excluded) -> 2 unread
            new Message { Id = Guid.NewGuid(), ConversationId = noWatermarkConvId, TenantId = TenantId, FacilityId = FacilityId, Seq = 1, SenderType = "System", SenderId = null, ContentText = "System notice", ServerReceivedAtUtc = baseTime },
            new Message { Id = Guid.NewGuid(), ConversationId = noWatermarkConvId, TenantId = TenantId, FacilityId = FacilityId, Seq = 2, SenderId = "staff-bob", ContentText = "Bob msg", ServerReceivedAtUtc = baseTime.AddMinutes(1) },
            new Message { Id = Guid.NewGuid(), ConversationId = noWatermarkConvId, TenantId = TenantId, FacilityId = FacilityId, Seq = 3, SenderId = "staff-alice", ContentText = "Alice msg", ServerReceivedAtUtc = baseTime.AddMinutes(2) },

            // Seq-watermark: Seq 1 is read, Seq 2 from Alice (excluded), Seq 3 from Bob (unread) -> 1 unread
            new Message { Id = seqWatermarkMsgId, ConversationId = seqWatermarkConvId, TenantId = TenantId, FacilityId = FacilityId, Seq = 1, SenderId = "staff-bob", ContentText = "Read msg", ServerReceivedAtUtc = baseTime },
            new Message { Id = Guid.NewGuid(), ConversationId = seqWatermarkConvId, TenantId = TenantId, FacilityId = FacilityId, Seq = 2, SenderId = "staff-alice", ContentText = "Self msg", ServerReceivedAtUtc = baseTime.AddMinutes(1) },
            new Message { Id = Guid.NewGuid(), ConversationId = seqWatermarkConvId, TenantId = TenantId, FacilityId = FacilityId, Seq = 3, SenderId = "staff-bob", ContentText = "New unread msg", ServerReceivedAtUtc = baseTime.AddMinutes(2) },

            // Time-watermark: <= baseTime excluded, > baseTime from Bob counted (1), > baseTime from Alice excluded -> 1 unread
            new Message { Id = Guid.NewGuid(), ConversationId = timeWatermarkConvId, TenantId = TenantId, FacilityId = FacilityId, Seq = 1, SenderId = "staff-bob", ContentText = "Before", ServerReceivedAtUtc = baseTime.AddMinutes(-1) },
            new Message { Id = Guid.NewGuid(), ConversationId = timeWatermarkConvId, TenantId = TenantId, FacilityId = FacilityId, Seq = 2, SenderId = "staff-bob", ContentText = "After Bob", ServerReceivedAtUtc = baseTime.AddMinutes(1) },
            new Message { Id = Guid.NewGuid(), ConversationId = timeWatermarkConvId, TenantId = TenantId, FacilityId = FacilityId, Seq = 3, SenderId = "staff-alice", ContentText = "After Alice", ServerReceivedAtUtc = baseTime.AddMinutes(2) });

        await db.SaveChangesAsync();

        var handler = new GetConversationsQueryHandler(db);
        var results = await handler.Handle(new GetConversationsQuery(TenantId, FacilityId, StaffId: "staff-alice"), CancellationToken.None);

        Assert.Equal(3, results.Count);
        Assert.Equal(2, results.Single(c => c.Id == noWatermarkConvId).UnreadCount);
        Assert.Equal(1, results.Single(c => c.Id == seqWatermarkConvId).UnreadCount);
        Assert.Equal(1, results.Single(c => c.Id == timeWatermarkConvId).UnreadCount);
    }
}
