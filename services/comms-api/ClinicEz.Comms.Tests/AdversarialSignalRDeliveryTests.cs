using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Features.Messages.Commands;
using ClinicEz.Comms.Application.Models;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Infrastructure.BackgroundServices;
using ClinicEz.Comms.Infrastructure.Hubs;
using ClinicEz.Comms.Infrastructure.Persistence;
using ClinicEz.Comms.Tests.Support;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Security;
using MediatR;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace ClinicEz.Comms.Tests;

/// <summary>
/// Empirical Challenger Adversarial Verification Suite:
/// 1. Delivery Truth Invariant: Prove that a message NEVER enters Received state upon send or hub broadcast alone.
/// 2. Retention Sweep Boundary: Verify unconfirmed messages past RetentionDeadlineUtc transition to NotReceived.
/// 3. Late Confirmation Resilience: Test what happens when recipient confirmation arrives AFTER retention sweep marked the message NotReceived.
/// 4. Resend Idempotency: Verify that resending a NotReceived message resets retention without creating duplicate records.
/// 5. Cross-Tenant Room Isolation: Attempt to connect or subscribe to another tenant's conversation room or user channel.
/// </summary>
public class AdversarialSignalRDeliveryTests
{
    private readonly Mock<ICommsRealtimeNotifier> _notifierMock = new();
    private readonly Mock<IMediator> _mediatorMock = new();
    private readonly Mock<IHubCallerClients<ICommsClient>> _clientsMock = new();
    private readonly Mock<ICommsClient> _clientProxyMock = new();
    private readonly Mock<IGroupManager> _groupManagerMock = new();
    private readonly Mock<HubCallerContext> _contextMock = new();

    private CommsHub CreateHub(CommsDbContext db, ClaimsPrincipal principal, string connectionId = "conn-adv-1")
    {
        _contextMock.Setup(c => c.User).Returns(principal);
        _contextMock.Setup(c => c.ConnectionId).Returns(connectionId);
        _clientsMock.Setup(c => c.Group(It.IsAny<string>())).Returns(_clientProxyMock.Object);

        return new CommsHub(db, _mediatorMock.Object, NullLogger<CommsHub>.Instance)
        {
            Context = _contextMock.Object,
            Groups = _groupManagerMock.Object,
            Clients = _clientsMock.Object
        };
    }

    #region Objective 1: Delivery Truth Invariant

    [Fact]
    public async Task DeliveryTruth_MessageNeverReceived_UponSendOrHubBroadcastAlone()
    {
        // ARRANGE
        var db = TestDbContextFactory.CreateInMemory();
        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-truth",
            FacilityId = "fac-truth",
            Title = "Clinical Communication",
            Scope = ConversationScope.Facility,
            Status = RequestStatus.Routed
        };
        db.Conversations.Add(conversation);
        await db.SaveChangesAsync();

        MessageDto? broadcastedDto = null;
        _notifierMock
            .Setup(n => n.NotifyMessageReceivedAsync(conversation.Id, It.IsAny<MessageDto>(), It.IsAny<CancellationToken>()))
            .Callback<Guid, MessageDto, CancellationToken>((_, dto, _) => broadcastedDto = dto)
            .Returns(Task.CompletedTask);

        var handler = new SendMessageCommandHandler(db, _notifierMock.Object);
        var sendCommand = new SendMessageCommand(
            conversation.Id,
            "tenant-truth",
            "fac-truth",
            "Staff",
            "dr-smith",
            "Dr. Smith",
            "Stat potassium level critical: 6.2 mEq/L",
            MessageVisibility.Public,
            RequiresAcknowledgement: true,
            ClientMessageId: Guid.NewGuid());

        // ACT
        var sendResult = await handler.Handle(sendCommand, CancellationToken.None);

        // ASSERT 1: Persisted DB state is strictly Waiting, NEVER Received
        var persistedMessage = await db.Messages.FindAsync(sendResult.MessageId);
        Assert.NotNull(persistedMessage);
        Assert.Equal(DeliveryState.Waiting, persistedMessage.State);
        Assert.NotEqual(DeliveryState.Received, persistedMessage.State);

        // ASSERT 2: Realtime broadcast payload is strictly Waiting, NEVER Received
        Assert.NotNull(broadcastedDto);
        Assert.Equal(DeliveryState.Waiting, broadcastedDto.DeliveryState);
        Assert.NotEqual(DeliveryState.Received, broadcastedDto.DeliveryState);

        // ASSERT 3: Querying messages via hub GetMessagesAfterSeq reflects Waiting
        var callerClaims = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim("tenant_id", "tenant-truth"),
            new Claim("facility_id", "fac-truth"),
            new Claim("sub", "nurse-john")
        ], "TestAuth"));
        var hub = CreateHub(db, callerClaims);

        var history = await hub.GetMessagesAfterSeq(conversation.Id, 0);
        Assert.Single(history);
        Assert.Equal(DeliveryState.Waiting, history[0].DeliveryState);
        Assert.NotEqual(DeliveryState.Received, history[0].DeliveryState);
    }

    [Fact]
    public async Task DeliveryTruth_ExplicitStorageConfirmation_RequiredForReceivedState()
    {
        // ARRANGE
        var db = TestDbContextFactory.CreateInMemory();
        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-truth",
            FacilityId = "fac-truth",
            Title = "Lab Requisition Thread"
        };
        db.Conversations.Add(conversation);

        var message = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            TenantId = "tenant-truth",
            FacilityId = "fac-truth",
            Seq = 1,
            ContentText = "Specimen collected",
            State = DeliveryState.Waiting,
            RetentionDeadlineUtc = DateTime.UtcNow.AddDays(7)
        };
        db.Messages.Add(message);
        await db.SaveChangesAsync();

        var confirmHandler = new ConfirmDeliveryCommandHandler(db, _notifierMock.Object);
        var storageTimestamp = DateTime.UtcNow;
        var confirmCommand = new ConfirmDeliveryCommand(message.Id, "cloud:facility", storageTimestamp);

        // ACT
        var result = await confirmHandler.Handle(confirmCommand, CancellationToken.None);

        // ASSERT
        Assert.True(result);
        var updated = await db.Messages.FindAsync(message.Id);
        Assert.NotNull(updated);
        Assert.Equal(DeliveryState.Received, updated.State);
        Assert.Equal(storageTimestamp, updated.UpdatedAtUtc);

        _notifierMock.Verify(n => n.NotifyMessageStateChangedAsync(
            conversation.Id,
            message.Id,
            DeliveryState.Received,
            storageTimestamp,
            It.IsAny<CancellationToken>()), Times.Once);
    }

    #endregion

    #region Objective 2: Retention Sweep Boundary

    [Theory]
    [InlineData(10, false)]   // 10 seconds in future: MUST NOT be swept (remains Waiting)
    [InlineData(0, true)]     // Exactly now (boundary): MUST be swept (transitions to NotReceived)
    [InlineData(-10, true)]   // 10 seconds in past: MUST be swept (transitions to NotReceived)
    [InlineData(-3600, true)] // 1 hour in past: MUST be swept (transitions to NotReceived)
    public async Task RetentionSweep_BoundaryConditions_CorrectlyEvaluated(int offsetSecondsFromNow, bool expectSwept)
    {
        // ARRANGE
        var db = TestDbContextFactory.CreateInMemory();
        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-sweep",
            FacilityId = "fac-sweep",
            Title = "Boundary Test"
        };
        db.Conversations.Add(conversation);

        var deadline = DateTime.UtcNow.AddSeconds(offsetSecondsFromNow);
        var message = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            TenantId = "tenant-sweep",
            FacilityId = "fac-sweep",
            Seq = 1,
            ContentText = $"Boundary test offset {offsetSecondsFromNow}s",
            State = DeliveryState.Waiting,
            RetentionDeadlineUtc = deadline
        };
        db.Messages.Add(message);
        await db.SaveChangesAsync();

        var services = new ServiceCollection();
        services.AddSingleton<ICommsDbContext>(db);
        services.AddSingleton(_notifierMock.Object);
        var sp = services.BuildServiceProvider();

        var sweeper = new DeliveryRetentionSweeper(sp, NullLogger<DeliveryRetentionSweeper>.Instance);

        // ACT
        var sweptCount = await sweeper.SweepOnceAsync(CancellationToken.None);

        // ASSERT
        var reloaded = await db.Messages.FindAsync(message.Id);
        Assert.NotNull(reloaded);

        if (expectSwept)
        {
            Assert.Equal(1, sweptCount);
            Assert.Equal(DeliveryState.NotReceived, reloaded.State);
            _notifierMock.Verify(n => n.NotifyMessageStateChangedAsync(
                conversation.Id,
                message.Id,
                DeliveryState.NotReceived,
                It.IsAny<DateTime>(),
                It.IsAny<CancellationToken>()), Times.Once);
        }
        else
        {
            Assert.Equal(0, sweptCount);
            Assert.Equal(DeliveryState.Waiting, reloaded.State);
        }
    }

    [Fact]
    public async Task RetentionSweep_AlreadyReceivedMessages_NeverDegradedToNotReceived()
    {
        // ARRANGE: A message that is already Received, but its RetentionDeadlineUtc is in the past
        var db = TestDbContextFactory.CreateInMemory();
        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-sweep",
            FacilityId = "fac-sweep",
            Title = "Confirmed Message Thread"
        };
        db.Conversations.Add(conversation);

        var receivedMessage = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            TenantId = "tenant-sweep",
            FacilityId = "fac-sweep",
            Seq = 1,
            ContentText = "Successfully received earlier",
            State = DeliveryState.Received,
            RetentionDeadlineUtc = DateTime.UtcNow.AddDays(-2) // Past deadline
        };
        db.Messages.Add(receivedMessage);
        await db.SaveChangesAsync();

        var services = new ServiceCollection();
        services.AddSingleton<ICommsDbContext>(db);
        services.AddSingleton(_notifierMock.Object);
        var sp = services.BuildServiceProvider();

        var sweeper = new DeliveryRetentionSweeper(sp, NullLogger<DeliveryRetentionSweeper>.Instance);

        // ACT
        var sweptCount = await sweeper.SweepOnceAsync(CancellationToken.None);

        // ASSERT: Sweeper must ignore messages that are already in Received state
        Assert.Equal(0, sweptCount);
        var messageAfterSweep = await db.Messages.FindAsync(receivedMessage.Id);
        Assert.NotNull(messageAfterSweep);
        Assert.Equal(DeliveryState.Received, messageAfterSweep.State);
    }

    #endregion

    #region Objective 3: Late Confirmation Resilience

    [Fact]
    public async Task LateConfirmation_Resilience_RestoresNotReceivedCleanlyToReceived()
    {
        // ARRANGE: A message that was unconfirmed past retention deadline and swept to NotReceived
        var db = TestDbContextFactory.CreateInMemory();
        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-late",
            FacilityId = "fac-late",
            Title = "In-flight Offline Client"
        };
        db.Conversations.Add(conversation);

        var message = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            TenantId = "tenant-late",
            FacilityId = "fac-late",
            Seq = 1,
            ContentText = "Late arriving delivery notice",
            State = DeliveryState.NotReceived,
            RetentionDeadlineUtc = DateTime.UtcNow.AddDays(-1),
            UpdatedAtUtc = DateTime.UtcNow.AddHours(-2)
        };
        db.Messages.Add(message);
        await db.SaveChangesAsync();

        var confirmHandler = new ConfirmDeliveryCommandHandler(db, _notifierMock.Object);
        var genuineStorageTime = DateTime.UtcNow.AddMinutes(-10);
        var confirmCommand = new ConfirmDeliveryCommand(message.Id, "cloud:recipient", genuineStorageTime);

        // ACT: Late confirmation arrives
        var success = await confirmHandler.Handle(confirmCommand, CancellationToken.None);

        // ASSERT: State cleanly restored to Received with genuine timestamp
        Assert.True(success);
        var restored = await db.Messages.FindAsync(message.Id);
        Assert.NotNull(restored);
        Assert.Equal(DeliveryState.Received, restored.State);
        Assert.Equal(genuineStorageTime, restored.UpdatedAtUtc);

        // Broadcasts state changed to Received
        _notifierMock.Verify(n => n.NotifyMessageStateChangedAsync(
            conversation.Id,
            message.Id,
            DeliveryState.Received,
            genuineStorageTime,
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task LateConfirmation_RedundantConfirmations_AreIdempotent()
    {
        // ARRANGE
        var db = TestDbContextFactory.CreateInMemory();
        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-late",
            FacilityId = "fac-late",
            Title = "Idempotency Thread"
        };
        db.Conversations.Add(conversation);

        var message = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            TenantId = "tenant-late",
            FacilityId = "fac-late",
            Seq = 1,
            ContentText = "Repeat confirm test",
            State = DeliveryState.Received,
            UpdatedAtUtc = DateTime.UtcNow.AddMinutes(-5)
        };
        db.Messages.Add(message);
        await db.SaveChangesAsync();

        var confirmHandler = new ConfirmDeliveryCommandHandler(db, _notifierMock.Object);
        var confirmCommand = new ConfirmDeliveryCommand(message.Id, "cloud:recipient");

        // ACT: Confirmation called again on an already Received message
        var success = await confirmHandler.Handle(confirmCommand, CancellationToken.None);

        // ASSERT: Returns true without re-broadcasting state change
        Assert.True(success);
        _notifierMock.Verify(n => n.NotifyMessageStateChangedAsync(
            It.IsAny<Guid>(),
            It.IsAny<Guid>(),
            It.IsAny<DeliveryState>(),
            It.IsAny<DateTime>(),
            It.IsAny<CancellationToken>()), Times.Never);
    }

    #endregion

    #region Objective 4: Resend Idempotency

    [Fact]
    public async Task ResendMessage_Command_ResetsWaitingAndExtendsRetention()
    {
        // ARRANGE
        var db = TestDbContextFactory.CreateInMemory();
        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-resend",
            FacilityId = "fac-resend",
            Title = "Resend Flow"
        };
        db.Conversations.Add(conversation);

        var originalClientMsgId = Guid.NewGuid();
        var expiredMessage = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            TenantId = "tenant-resend",
            FacilityId = "fac-resend",
            Seq = 7,
            ClientMessageId = originalClientMsgId,
            ContentText = "Critical triage alert",
            State = DeliveryState.NotReceived,
            RetentionDeadlineUtc = DateTime.UtcNow.AddHours(-1)
        };
        db.Messages.Add(expiredMessage);
        await db.SaveChangesAsync();

        var resendHandler = new ResendMessageCommandHandler(db, _notifierMock.Object);
        var resendCommand = new ResendMessageCommand(expiredMessage.Id, "tenant-resend");

        // ACT
        var result = await resendHandler.Handle(resendCommand, CancellationToken.None);

        // ASSERT
        Assert.Equal(DeliveryState.Waiting, result.DeliveryState);
        Assert.Equal(expiredMessage.Id, result.MessageId);
        Assert.Equal(7, result.Seq);
        Assert.Equal(originalClientMsgId, result.ClientMessageId);
        Assert.True(result.RetentionDeadlineUtc > DateTime.UtcNow.AddDays(6));

        var updated = await db.Messages.FindAsync(expiredMessage.Id);
        Assert.NotNull(updated);
        Assert.Equal(DeliveryState.Waiting, updated.State);
        Assert.True(updated.RetentionDeadlineUtc > DateTime.UtcNow.AddDays(6));

        // SignalR notifier broadcasts state transition back to Waiting
        _notifierMock.Verify(n => n.NotifyMessageStateChangedAsync(
            conversation.Id,
            expiredMessage.Id,
            DeliveryState.Waiting,
            It.IsAny<DateTime>(),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task SendMessage_DuplicateClientMessageId_NeverCreatesDuplicateRecords()
    {
        // ARRANGE: A client retries SendMessage with the identical ClientMessageId
        var db = TestDbContextFactory.CreateInMemory();
        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-resend",
            FacilityId = "fac-resend",
            Title = "Idempotency Test",
            LastSeq = 10,
            MessageCount = 10
        };
        db.Conversations.Add(conversation);

        var clientMsgId = Guid.NewGuid();
        var initialMessage = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            TenantId = "tenant-resend",
            FacilityId = "fac-resend",
            Seq = 10,
            ClientMessageId = clientMsgId,
            ContentText = "Original submission payload",
            State = DeliveryState.Waiting,
            RetentionDeadlineUtc = DateTime.UtcNow.AddDays(7)
        };
        db.Messages.Add(initialMessage);
        await db.SaveChangesAsync();

        var totalMessagesBefore = await db.Messages.CountAsync();
        Assert.Equal(1, totalMessagesBefore);

        var sendHandler = new SendMessageCommandHandler(db, _notifierMock.Object);
        var retryCommand = new SendMessageCommand(
            conversation.Id,
            "tenant-resend",
            "fac-resend",
            "Staff",
            "staff-1",
            "Nurse Joy",
            "Original submission payload retry attempt",
            MessageVisibility.Public,
            RequiresAcknowledgement: false,
            ClientMessageId: clientMsgId);

        // ACT: Re-submission with identical ClientMessageId
        var retryResult = await sendHandler.Handle(retryCommand, CancellationToken.None);

        // ASSERT: Idempotent return without duplicate row creation
        Assert.Equal(initialMessage.Id, retryResult.MessageId);
        Assert.Equal(10, retryResult.Seq);
        Assert.Equal("Original submission payload", retryResult.ContentText);

        var totalMessagesAfter = await db.Messages.CountAsync();
        Assert.Equal(1, totalMessagesAfter); // ZERO duplicate records created!

        // Conversation sequence must NOT advance
        var reloadedConv = await db.Conversations.FindAsync(conversation.Id);
        Assert.NotNull(reloadedConv);
        Assert.Equal(10, reloadedConv.LastSeq);
    }

    [Fact]
    public async Task ResendMessage_CrossTenantMessageId_ThrowsNotFoundException()
    {
        // ARRANGE: Attacker attempts to resend a message belonging to another tenant
        var db = TestDbContextFactory.CreateInMemory();
        var victimConversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-victim",
            FacilityId = "fac-v",
            Title = "Victim Thread"
        };
        db.Conversations.Add(victimConversation);

        var victimMessage = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = victimConversation.Id,
            TenantId = "tenant-victim",
            FacilityId = "fac-v",
            Seq = 1,
            ContentText = "Confidential victim message",
            State = DeliveryState.NotReceived,
            RetentionDeadlineUtc = DateTime.UtcNow.AddHours(-1)
        };
        db.Messages.Add(victimMessage);
        await db.SaveChangesAsync();

        var resendHandler = new ResendMessageCommandHandler(db, _notifierMock.Object);
        var attackerCommand = new ResendMessageCommand(victimMessage.Id, "tenant-attacker");

        // ACT & ASSERT: Must fail with NotFoundException due to tenant mismatch
        await Assert.ThrowsAsync<NotFoundException>(() => resendHandler.Handle(attackerCommand, CancellationToken.None));
    }

    #endregion

    #region Objective 5: Cross-Tenant Room Isolation & SignalR Group Scoping

    [Fact]
    public async Task CrossTenant_HubJoinConversation_ImmediatelyRejectedWithHubException()
    {
        // ARRANGE
        var db = TestDbContextFactory.CreateInMemory();
        var victimConversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-victim",
            FacilityId = "fac-victim",
            Title = "Internal Clinical Consultation",
            Scope = ConversationScope.Facility
        };
        db.Conversations.Add(victimConversation);
        await db.SaveChangesAsync();

        // Attacker presents valid ticket for tenant-attacker
        var attackerPrincipal = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim("tenant_id", "tenant-attacker"),
            new Claim("facility_id", "fac-attacker"),
            new Claim("sub", "malicious-actor"),
            new Claim(ClaimTypes.Name, "Attacker"),
            new Claim("permission", CommsPermissions.MessagingRead)
        ], "TestAuth"));

        var hub = CreateHub(db, attackerPrincipal, "conn-attacker-999");

        // ACT & ASSERT
        var ex = await Assert.ThrowsAsync<HubException>(() => hub.JoinConversation(victimConversation.Id));
        Assert.Contains("Cross-tenant access forbidden", ex.Message);

        // Verify attacker connection was NEVER added to victim conversation group
        _groupManagerMock.Verify(g => g.AddToGroupAsync("conn-attacker-999", $"conv:{victimConversation.Id}", It.IsAny<CancellationToken>()), Times.Never);
        _clientProxyMock.Verify(c => c.OnParticipantJoined(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task CrossTenant_HubOnConnected_StrictlyScopesGroupsToCallerTenant()
    {
        // ARRANGE: Attacker connects with valid credentials for tenant-attacker
        var db = TestDbContextFactory.CreateInMemory();
        var attackerPrincipal = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim("tenant_id", "tenant-attacker"),
            new Claim("facility_id", "fac-attacker-1"),
            new Claim("branch_id", "branch-attacker-north"),
            new Claim("sub", "attacker-user-01")
        ], "TestAuth"));

        var addedGroups = new List<string>();
        _groupManagerMock
            .Setup(g => g.AddToGroupAsync("conn-attacker-conn", It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Callback<string, string, CancellationToken>((_, group, _) => addedGroups.Add(group))
            .Returns(Task.CompletedTask);

        var hub = CreateHub(db, attackerPrincipal, "conn-attacker-conn");

        // ACT
        await hub.OnConnectedAsync();

        // ASSERT: Groups are strictly scoped to tenant-attacker
        Assert.Contains("user:tenant-attacker:attacker-user-01", addedGroups);
        Assert.Contains("facility:tenant-attacker:fac-attacker-1", addedGroups);
        Assert.Contains("branch:tenant-attacker:branch-attacker-north", addedGroups);
        Assert.Contains("tenant:tenant-attacker", addedGroups);

        // Verify NO group from any other tenant is ever registered
        Assert.DoesNotContain(addedGroups, g => g.Contains("tenant-victim"));
        Assert.DoesNotContain(addedGroups, g => !g.Contains("tenant-attacker"));
    }

    [Fact]
    public async Task Scoping_FacilityMismatch_WithinSameTenant_ThrowsHubException()
    {
        // ARRANGE: Conversation scoped to Facility 2
        var db = TestDbContextFactory.CreateInMemory();
        var fac2Conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-common",
            FacilityId = "fac-02",
            Title = "Pharmacy Private Dispatch",
            Scope = ConversationScope.Facility
        };
        db.Conversations.Add(fac2Conversation);
        await db.SaveChangesAsync();

        // User belongs to Facility 1 within the SAME tenant
        var fac1UserPrincipal = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim("tenant_id", "tenant-common"),
            new Claim("facility_id", "fac-01"),
            new Claim("sub", "clinic-nurse")
        ], "TestAuth"));

        var hub = CreateHub(db, fac1UserPrincipal);

        // ACT & ASSERT
        var ex = await Assert.ThrowsAsync<HubException>(() => hub.JoinConversation(fac2Conversation.Id));
        Assert.Contains("Facility mismatch", ex.Message);
    }

    [Fact]
    public async Task Scoping_BranchMismatch_WithinSameTenant_ThrowsHubException()
    {
        // ARRANGE: Conversation scoped to Branch B
        var db = TestDbContextFactory.CreateInMemory();
        var branchBConversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-common",
            FacilityId = "fac-01",
            BranchId = "branch-b",
            Title = "Downtown Branch Chat",
            Scope = ConversationScope.Branch
        };
        db.Conversations.Add(branchBConversation);
        await db.SaveChangesAsync();

        // User belongs to Branch A
        var branchAUserPrincipal = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim("tenant_id", "tenant-common"),
            new Claim("facility_id", "fac-01"),
            new Claim("branch_id", "branch-a"),
            new Claim("sub", "uptown-staff")
        ], "TestAuth"));

        var hub = CreateHub(db, branchAUserPrincipal);

        // ACT & ASSERT
        var ex = await Assert.ThrowsAsync<HubException>(() => hub.JoinConversation(branchBConversation.Id));
        Assert.Contains("Branch mismatch", ex.Message);
    }

    [Fact]
    public async Task Scoping_UnroutedPatientInquiry_BlockedWithoutTriagePermission()
    {
        // ARRANGE: Inbound patient inquiry pending triage (Status = Submitted)
        var db = TestDbContextFactory.CreateInMemory();
        var patientInquiry = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-clinic",
            FacilityId = "fac-main",
            Title = "Patient Message #4928",
            Scope = ConversationScope.PatientFacility,
            Status = RequestStatus.Submitted
        };
        db.Conversations.Add(patientInquiry);
        await db.SaveChangesAsync();

        // Physician without messaging:triage permission
        var physicianPrincipal = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim("tenant_id", "tenant-clinic"),
            new Claim("facility_id", "fac-main"),
            new Claim("sub", "dr-house"),
            new Claim("permission", CommsPermissions.MessagingRead),
            new Claim("permission", CommsPermissions.MessagingWrite)
        ], "TestAuth"));

        var hub = CreateHub(db, physicianPrincipal);

        // ACT & ASSERT: Access blocked before triage routing
        var ex = await Assert.ThrowsAsync<HubException>(() => hub.JoinConversation(patientInquiry.Id));
        Assert.Contains("pending triage routing", ex.Message);
    }

    #endregion
}
