using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Features.Conversations.Commands;
using ClinicEz.Comms.Application.Features.Conversations.Queries;
using ClinicEz.Comms.Application.Features.Messages.Commands;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Infrastructure.Hubs;
using ClinicEz.Comms.Infrastructure.Persistence;
using ClinicEz.Comms.Tests.Support;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop.Contracts;
using MediatR;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace ClinicEz.Comms.Tests;

public class DirectConversationAdversarialAndLifecycleTests
{
    private const string TenantId = "tenant-direct-test";
    private const string FacilityId = "fac-direct-test";

    [Fact]
    public async Task CreateDirectConversation_OnlyRecipientPassed_AutoEnrollsCreatorAsOwnerWithRealDisplayName()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var handler = new CreateConversationCommandHandler(db);

        var cmd = new CreateConversationCommand(
            TenantId: TenantId,
            FacilityId: FacilityId,
            BranchId: null,
            Scope: ConversationScope.Direct,
            Kind: ConversationKind.Direct,
            Title: "Chat with Nurse Bob",
            ContextType: null,
            ContextId: null,
            Category: null,
            IsEmergencyConfirmed: false,
            IsLocalOnly: false,
            CreatedBy: "staff-creator-alice",
            Participants: new List<ParticipantInput>
            {
                new("Staff", "staff-recipient-bob", "Nurse Bob", "Member")
            },
            CreatedByDisplayName: "Dr. Alice");

        var result = await handler.Handle(cmd, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(2, result.Participants.Count);

        var creator = result.Participants.FirstOrDefault(p => p.ParticipantId == "staff-creator-alice");
        Assert.NotNull(creator);
        Assert.Equal("Dr. Alice", creator.DisplayName);
        Assert.Equal("Owner", creator.Role);

        var recipient = result.Participants.FirstOrDefault(p => p.ParticipantId == "staff-recipient-bob");
        Assert.NotNull(recipient);
        Assert.Equal("Nurse Bob", recipient.DisplayName);
        Assert.Equal("Member", recipient.Role);
    }

    [Fact]
    public async Task DirectConversation_BothCreatorAndRecipientCanSendMessages_OutsiderIsRejected()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var createHandler = new CreateConversationCommandHandler(db);

        var createCmd = new CreateConversationCommand(
            TenantId: TenantId,
            FacilityId: FacilityId,
            BranchId: null,
            Scope: ConversationScope.Direct,
            Kind: ConversationKind.Direct,
            Title: "Chat with Wave Ambray",
            ContextType: null,
            ContextId: null,
            Category: null,
            IsEmergencyConfirmed: false,
            IsLocalOnly: false,
            CreatedBy: "staff-alice",
            Participants: new List<ParticipantInput>
            {
                new("Staff", "staff-wave", "Wave Ambray", "Member")
            },
            CreatedByDisplayName: "Dr. Alice");

        var conversation = await createHandler.Handle(createCmd, CancellationToken.None);

        var notifierMock = new Mock<ICommsRealtimeNotifier>();
        var sendHandler = new SendMessageCommandHandler(db, notifierMock.Object);

        // 1. Creator sends message -> MUST succeed
        var creatorMsgCmd = new SendMessageCommand(
            conversation.Id,
            TenantId,
            FacilityId,
            "Staff",
            "staff-alice",
            "Dr. Alice",
            "Hello Wave, let's review the chart.",
            MessageVisibility.Public,
            RequiresAcknowledgement: false);

        var creatorMsg = await sendHandler.Handle(creatorMsgCmd, CancellationToken.None);
        Assert.NotNull(creatorMsg);
        Assert.Equal("staff-alice", creatorMsg.SenderId);
        Assert.Equal(1, creatorMsg.Seq);

        // 2. Recipient sends message -> MUST succeed
        var recipientMsgCmd = new SendMessageCommand(
            conversation.Id,
            TenantId,
            FacilityId,
            "Staff",
            "staff-wave",
            "Wave Ambray",
            "Got it, looking at it now.",
            MessageVisibility.Public,
            RequiresAcknowledgement: false);

        var recipientMsg = await sendHandler.Handle(recipientMsgCmd, CancellationToken.None);
        Assert.NotNull(recipientMsg);
        Assert.Equal("staff-wave", recipientMsg.SenderId);
        Assert.Equal(2, recipientMsg.Seq);

        // 3. Outsider attempts to send message -> MUST be rejected with ValidationException
        var outsiderMsgCmd = new SendMessageCommand(
            conversation.Id,
            TenantId,
            FacilityId,
            "Staff",
            "staff-outsider-eve",
            "Eve Intruder",
            "Eavesdropping message",
            MessageVisibility.Public,
            RequiresAcknowledgement: false);

        var ex = await Assert.ThrowsAsync<ValidationException>(() =>
            sendHandler.Handle(outsiderMsgCmd, CancellationToken.None));
        Assert.Contains("Unauthorized", ex.Message);
        Assert.Contains("direct conversation", ex.Message);
    }

    [Fact]
    public async Task DirectConversation_CreatorAndRecipientCanJoinHub_OutsiderThrowsHubException()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var createHandler = new CreateConversationCommandHandler(db);

        var createCmd = new CreateConversationCommand(
            TenantId: TenantId,
            FacilityId: FacilityId,
            BranchId: null,
            Scope: ConversationScope.Direct,
            Kind: ConversationKind.Direct,
            Title: "Chat with Wave Ambray",
            ContextType: null,
            ContextId: null,
            Category: null,
            IsEmergencyConfirmed: false,
            IsLocalOnly: false,
            CreatedBy: "staff-alice",
            Participants: new List<ParticipantInput>
            {
                new("Staff", "staff-wave", "Wave Ambray", "Member")
            },
            CreatedByDisplayName: "Dr. Alice");

        var conversation = await createHandler.Handle(createCmd, CancellationToken.None);

        CommsHub CreateHubFor(string staffId, string staffName)
        {
            var principal = new ClaimsPrincipal(new ClaimsIdentity(new[]
            {
                new Claim(ClaimTypes.NameIdentifier, staffId),
                new Claim("sub", staffId),
                new Claim(ClaimTypes.Name, staffName),
                new Claim("tenant_id", TenantId),
                new Claim("facility_id", FacilityId)
            }, "TestAuth"));

            var contextMock = new Mock<HubCallerContext>();
            contextMock.Setup(c => c.User).Returns(principal);
            contextMock.Setup(c => c.ConnectionId).Returns($"conn-{staffId}");

            var clientProxyMock = new Mock<ICommsClient>();
            var clientsMock = new Mock<IHubCallerClients<ICommsClient>>();
            clientsMock.Setup(c => c.Group(It.IsAny<string>())).Returns(clientProxyMock.Object);

            var groupManagerMock = new Mock<IGroupManager>();

            return new CommsHub(db, new Mock<IMediator>().Object, NullLogger<CommsHub>.Instance)
            {
                Context = contextMock.Object,
                Groups = groupManagerMock.Object,
                Clients = clientsMock.Object
            };
        }

        // Creator joins -> succeeds
        var creatorHub = CreateHubFor("staff-alice", "Dr. Alice");
        await creatorHub.JoinConversation(conversation.Id);

        // Recipient joins -> succeeds
        var recipientHub = CreateHubFor("staff-wave", "Wave Ambray");
        await recipientHub.JoinConversation(conversation.Id);

        // Outsider joins -> throws HubException
        var outsiderHub = CreateHubFor("staff-outsider-eve", "Eve Intruder");
        var hubEx = await Assert.ThrowsAsync<HubException>(() => outsiderHub.JoinConversation(conversation.Id));
        Assert.Contains("Unauthorized", hubEx.Message);
        Assert.Contains("not a participant in this direct conversation", hubEx.Message);
    }

    [Fact]
    public async Task DirectConversation_GetConversationsQuery_OnlyVisibleToCreatorAndRecipient()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var createHandler = new CreateConversationCommandHandler(db);

        var createCmd = new CreateConversationCommand(
            TenantId: TenantId,
            FacilityId: FacilityId,
            BranchId: null,
            Scope: ConversationScope.Direct,
            Kind: ConversationKind.Direct,
            Title: "Confidential Direct Chat",
            ContextType: null,
            ContextId: null,
            Category: null,
            IsEmergencyConfirmed: false,
            IsLocalOnly: false,
            CreatedBy: "staff-alice",
            Participants: new List<ParticipantInput>
            {
                new("Staff", "staff-wave", "Wave Ambray", "Member")
            },
            CreatedByDisplayName: "Dr. Alice");

        var conversation = await createHandler.Handle(createCmd, CancellationToken.None);
        var queryHandler = new GetConversationsQueryHandler(db);

        // 1. Creator queries conversations -> sees it
        var creatorQuery = new GetConversationsQuery(TenantId, FacilityId, StaffId: "staff-alice");
        var creatorResult = await queryHandler.Handle(creatorQuery, CancellationToken.None);
        Assert.Contains(creatorResult, c => c.Id == conversation.Id);

        // 2. Recipient queries conversations -> sees it
        var recipientQuery = new GetConversationsQuery(TenantId, FacilityId, StaffId: "staff-wave");
        var recipientResult = await queryHandler.Handle(recipientQuery, CancellationToken.None);
        Assert.Contains(recipientResult, c => c.Id == conversation.Id);

        // 3. Outsider queries conversations -> does NOT see it
        var outsiderQuery = new GetConversationsQuery(TenantId, FacilityId, StaffId: "staff-outsider-eve");
        var outsiderResult = await queryHandler.Handle(outsiderQuery, CancellationToken.None);
        Assert.DoesNotContain(outsiderResult, c => c.Id == conversation.Id);
    }

    [Fact]
    public async Task DirectConversation_PerspectiveTitleResolution_NullDefault_ReflectsOppositeParticipant()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var createHandler = new CreateConversationCommandHandler(db);
        var queryHandler = new GetConversationsQueryHandler(db);

        // 1. Direct conversation created with null/empty title (default)
        var createCmd = new CreateConversationCommand(
            TenantId: TenantId,
            FacilityId: FacilityId,
            BranchId: null,
            Scope: ConversationScope.Direct,
            Kind: ConversationKind.Direct,
            Title: null, // User did not enter custom title
            ContextType: null,
            ContextId: null,
            Category: null,
            IsEmergencyConfirmed: false,
            IsLocalOnly: false,
            CreatedBy: "staff-alice",
            Participants: new List<ParticipantInput>
            {
                new("Staff", "staff-wave", "Wave Ambray", "Member")
            },
            CreatedByDisplayName: "Dr. Alice");

        var conversation = await createHandler.Handle(createCmd, CancellationToken.None);

        // Underlying stored title is null (no hardcoded fallback)
        var storedConv = await db.Conversations.FindAsync(conversation.Id);
        Assert.NotNull(storedConv);
        Assert.Null(storedConv.Title);

        // From Alice's perspective -> displays "Wave Ambray"
        var aliceResult = await queryHandler.Handle(new GetConversationsQuery(TenantId, FacilityId, StaffId: "staff-alice"), CancellationToken.None);
        var convForAlice = aliceResult.First(c => c.Id == conversation.Id);
        Assert.Equal("Wave Ambray", convForAlice.Title);

        // From Wave's perspective -> displays "Dr. Alice" (NOT "Wave Ambray", NOT "Chat with...")
        var waveResult = await queryHandler.Handle(new GetConversationsQuery(TenantId, FacilityId, StaffId: "staff-wave"), CancellationToken.None);
        var convForWave = waveResult.First(c => c.Id == conversation.Id);
        Assert.Equal("Dr. Alice", convForWave.Title);

        // 2. Direct conversation with explicit custom title shared by all
        var customCmd = new CreateConversationCommand(
            TenantId: TenantId,
            FacilityId: FacilityId,
            BranchId: null,
            Scope: ConversationScope.Direct,
            Kind: ConversationKind.Direct,
            Title: "Weekend Clinical Rotation",
            ContextType: null,
            ContextId: null,
            Category: null,
            IsEmergencyConfirmed: false,
            IsLocalOnly: false,
            CreatedBy: "staff-alice",
            Participants: new List<ParticipantInput>
            {
                new("Staff", "staff-wave", "Wave Ambray", "Member")
            },
            CreatedByDisplayName: "Dr. Alice");

        var customConv = await createHandler.Handle(customCmd, CancellationToken.None);
        var aliceCustom = (await queryHandler.Handle(new GetConversationsQuery(TenantId, FacilityId, StaffId: "staff-alice"), CancellationToken.None)).First(c => c.Id == customConv.Id);
        var waveCustom = (await queryHandler.Handle(new GetConversationsQuery(TenantId, FacilityId, StaffId: "staff-wave"), CancellationToken.None)).First(c => c.Id == customConv.Id);

        Assert.Equal("Weekend Clinical Rotation", aliceCustom.Title);
        Assert.Equal("Weekend Clinical Rotation", waveCustom.Title);
    }
}
