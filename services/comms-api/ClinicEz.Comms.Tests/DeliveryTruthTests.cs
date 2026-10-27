using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Features.Messages.Commands;
using ClinicEz.Comms.Application.Models;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Infrastructure.BackgroundServices;
using ClinicEz.Comms.Tests.Support;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace ClinicEz.Comms.Tests;

public class DeliveryTruthTests
{
    private readonly Mock<ICommsRealtimeNotifier> _notifierMock = new();

    [Fact]
    public async Task Message_StartsInWaitingState_WhenSubmitted()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            Title = "General Chat",
            Scope = ConversationScope.Facility,
            Status = RequestStatus.Routed
        };
        db.Conversations.Add(conversation);
        await db.SaveChangesAsync();

        var handler = new SendMessageCommandHandler(db, _notifierMock.Object);
        var command = new SendMessageCommand(
            conversation.Id,
            "tenant-1",
            "fac-1",
            "Staff",
            "staff-1",
            "Dr. Cruz",
            "Hello team",
            MessageVisibility.Public,
            RequiresAcknowledgement: false);

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.Equal(DeliveryState.Waiting, result.DeliveryState);
        Assert.Equal(1, result.Seq);
        Assert.True(result.RetentionDeadlineUtc > DateTime.UtcNow.AddDays(6));

        _notifierMock.Verify(n => n.NotifyMessageReceivedAsync(conversation.Id, It.IsAny<MessageDto>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Recipient_StorageAck_TransitionsStateToReceived()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            Title = "General Chat"
        };
        db.Conversations.Add(conversation);

        var message = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            Seq = 1,
            ContentText = "Vitals recorded",
            State = DeliveryState.Waiting,
            RetentionDeadlineUtc = DateTime.UtcNow.AddDays(7)
        };
        db.Messages.Add(message);
        await db.SaveChangesAsync();

        var handler = new ConfirmDeliveryCommandHandler(db, _notifierMock.Object);
        var ackTime = DateTime.UtcNow;
        var command = new ConfirmDeliveryCommand(message.Id, "cloud:clinic", ackTime);

        var success = await handler.Handle(command, CancellationToken.None);

        Assert.True(success);
        var updated = await db.Messages.FindAsync(message.Id);
        Assert.NotNull(updated);
        Assert.Equal(DeliveryState.Received, updated.State);
        Assert.Equal(ackTime, updated.UpdatedAtUtc);

        _notifierMock.Verify(n => n.NotifyMessageStateChangedAsync(conversation.Id, message.Id, DeliveryState.Received, ackTime, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task RetentionSweeper_MarksExpiredMessagesAsNotReceived()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            Title = "Urgent Request"
        };
        db.Conversations.Add(conversation);

        // Expired message: retention deadline was 1 hour ago
        var expiredMessage = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            Seq = 1,
            ContentText = "Please confirm appointment",
            State = DeliveryState.Waiting,
            RetentionDeadlineUtc = DateTime.UtcNow.AddHours(-1)
        };

        // Active message: retention deadline is 5 days in future
        var activeMessage = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            Seq = 2,
            ContentText = "Active message",
            State = DeliveryState.Waiting,
            RetentionDeadlineUtc = DateTime.UtcNow.AddDays(5)
        };

        db.Messages.AddRange(expiredMessage, activeMessage);
        await db.SaveChangesAsync();

        // Setup service provider for sweeper
        var services = new ServiceCollection();
        services.AddSingleton<ICommsDbContext>(db);
        services.AddSingleton(_notifierMock.Object);
        var sp = services.BuildServiceProvider();

        var sweeper = new DeliveryRetentionSweeper(sp, NullLogger<DeliveryRetentionSweeper>.Instance);
        var sweptCount = await sweeper.SweepOnceAsync(CancellationToken.None);

        Assert.Equal(1, sweptCount);

        var sweptRow = await db.Messages.FindAsync(expiredMessage.Id);
        Assert.NotNull(sweptRow);
        Assert.Equal(DeliveryState.NotReceived, sweptRow.State);

        var activeRow = await db.Messages.FindAsync(activeMessage.Id);
        Assert.NotNull(activeRow);
        Assert.Equal(DeliveryState.Waiting, activeRow.State);

        _notifierMock.Verify(n => n.NotifyMessageStateChangedAsync(conversation.Id, expiredMessage.Id, DeliveryState.NotReceived, It.IsAny<DateTime>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task LateConfirmation_OverwritesNotReceivedWithReceived()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            Title = "Triage Inbound"
        };
        db.Conversations.Add(conversation);

        // Message that previously timed out
        var message = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            Seq = 1,
            ContentText = "Follow up test",
            State = DeliveryState.NotReceived,
            RetentionDeadlineUtc = DateTime.UtcNow.AddHours(-2)
        };
        db.Messages.Add(message);
        await db.SaveChangesAsync();

        var handler = new ConfirmDeliveryCommandHandler(db, _notifierMock.Object);
        var realReceivedAt = DateTime.UtcNow.AddMinutes(-5);
        var command = new ConfirmDeliveryCommand(message.Id, "cloud:clinic", realReceivedAt);

        var success = await handler.Handle(command, CancellationToken.None);

        Assert.True(success);
        var updated = await db.Messages.FindAsync(message.Id);
        Assert.NotNull(updated);
        Assert.Equal(DeliveryState.Received, updated.State);
        Assert.Equal(realReceivedAt, updated.UpdatedAtUtc);
    }

    [Fact]
    public async Task ResendMessage_ResetsStateToWaiting_WithNewRetentionDeadline()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            Title = "Lab Notice"
        };
        db.Conversations.Add(conversation);

        var message = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            Seq = 1,
            ContentText = "Lab result ready",
            State = DeliveryState.NotReceived,
            RetentionDeadlineUtc = DateTime.UtcNow.AddHours(-1)
        };
        db.Messages.Add(message);
        await db.SaveChangesAsync();

        var handler = new ResendMessageCommandHandler(db, _notifierMock.Object);
        var command = new ResendMessageCommand(message.Id, "tenant-1");

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.Equal(DeliveryState.Waiting, result.DeliveryState);
        Assert.True(result.RetentionDeadlineUtc > DateTime.UtcNow.AddDays(6));

        var updated = await db.Messages.FindAsync(message.Id);
        Assert.NotNull(updated);
        Assert.Equal(DeliveryState.Waiting, updated.State);
    }

    [Fact]
    public async Task SendMessage_DuplicateClientMessageId_ReturnsExistingMessageIdempotently()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            Title = "General Chat",
            LastSeq = 5
        };
        db.Conversations.Add(conversation);

        var clientMsgId = Guid.NewGuid();
        var existingMessage = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            Seq = 5,
            ContentText = "Original submission",
            ClientMessageId = clientMsgId,
            State = DeliveryState.Waiting,
            RetentionDeadlineUtc = DateTime.UtcNow.AddDays(7)
        };
        db.Messages.Add(existingMessage);
        await db.SaveChangesAsync();

        var handler = new SendMessageCommandHandler(db, _notifierMock.Object);
        var command = new SendMessageCommand(
            conversation.Id,
            "tenant-1",
            "fac-1",
            "Staff",
            "staff-1",
            "Dr. Cruz",
            "Original submission retry",
            MessageVisibility.Public,
            RequiresAcknowledgement: false,
            ClientMessageId: clientMsgId);

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.Equal(existingMessage.Id, result.MessageId);
        Assert.Equal(5, result.Seq);
        Assert.Equal(existingMessage.ContentText, result.ContentText);

        // Sequence must NOT increment
        Assert.Equal(5, conversation.LastSeq);
    }
}
