using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Features.Conversations.Queries;
using ClinicEz.Comms.Application.Features.Messages.Commands;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Tests.Support;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using Moq;
using Xunit;

namespace ClinicEz.Comms.Tests;

public class ScopingAndCrossTenantTests
{
    private readonly Mock<ICommsRealtimeNotifier> _notifierMock = new();

    [Fact]
    public async Task GetConversations_FiltersOut_CrossTenantConversations()
    {
        var db = TestDbContextFactory.CreateInMemory();

        var convTenant1 = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-alpha",
            FacilityId = "fac-1",
            Title = "Alpha Channel"
        };

        var convTenant2 = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-beta",
            FacilityId = "fac-2",
            Title = "Beta Channel"
        };

        db.Conversations.AddRange(convTenant1, convTenant2);
        await db.SaveChangesAsync();

        var handler = new GetConversationsQueryHandler(db);
        var query = new GetConversationsQuery("tenant-alpha");

        var result = await handler.Handle(query, CancellationToken.None);

        Assert.Single(result);
        Assert.Equal("Alpha Channel", result[0].Title);
        Assert.Equal("tenant-alpha", result[0].TenantId);
    }

    [Fact]
    public async Task SendMessage_CrossTenantConversation_ThrowsNotFoundException()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var convBeta = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-beta",
            FacilityId = "fac-2",
            Title = "Beta Channel"
        };
        db.Conversations.Add(convBeta);
        await db.SaveChangesAsync();

        var handler = new SendMessageCommandHandler(db, _notifierMock.Object);
        // Caller belongs to tenant-alpha, attempting to post to tenant-beta's conversation
        var command = new SendMessageCommand(
            convBeta.Id,
            "tenant-alpha",
            "fac-1",
            "Staff",
            "staff-1",
            "Attacker",
            "Sneaky message",
            MessageVisibility.Public,
            RequiresAcknowledgement: false);

        await Assert.ThrowsAsync<NotFoundException>(() => handler.Handle(command, CancellationToken.None));
    }

    [Fact]
    public async Task SiteLocalChannel_DoesNotEmit_OutboxReplicationMessage()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var localConversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-alpha",
            FacilityId = "fac-1",
            Title = "Local Edge Only Station",
            IsLocalOnly = true,
            Scope = ConversationScope.Facility
        };
        db.Conversations.Add(localConversation);
        await db.SaveChangesAsync();

        var publisherMock = new Mock<IInteropPublisher>();
        var handler = new SendMessageCommandHandler(db, _notifierMock.Object, publisherMock.Object);

        var command = new SendMessageCommand(
            localConversation.Id,
            "tenant-alpha",
            "fac-1",
            "Staff",
            "staff-1",
            "Nurse Joy",
            "Offline station update",
            MessageVisibility.Public,
            RequiresAcknowledgement: false);

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.NotNull(result);
        // Zero outbox enqueues because conversation is site-local
        publisherMock.Verify(p => p.Enqueue(It.IsAny<InteropEnvelope>()), Times.Never);
        publisherMock.Verify(p => p.Enqueue(
            It.IsAny<string>(),
            It.IsAny<Party>(),
            It.IsAny<Party>(),
            It.IsAny<Guid>(),
            It.IsAny<object>(),
            It.IsAny<int>(),
            It.IsAny<TimeSpan?>()), Times.Never);
    }

    [Fact]
    public async Task CloudReplicatedChannel_Emits_OutboxReplicationMessage()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var cloudConversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-alpha",
            FacilityId = "fac-1",
            Title = "Clinic Wide Chat",
            IsLocalOnly = false,
            Scope = ConversationScope.Facility
        };
        db.Conversations.Add(cloudConversation);
        await db.SaveChangesAsync();

        var publisherMock = new Mock<IInteropPublisher>();
        var handler = new SendMessageCommandHandler(db, _notifierMock.Object, publisherMock.Object);

        var command = new SendMessageCommand(
            cloudConversation.Id,
            "tenant-alpha",
            "fac-1",
            "Staff",
            "staff-1",
            "Nurse Joy",
            "Replicated message",
            MessageVisibility.Public,
            RequiresAcknowledgement: false);

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.NotNull(result);
        publisherMock.Verify(p => p.Enqueue(
            InteropTypes.CommsMessageReplicate,
            It.IsAny<Party>(),
            It.IsAny<Party>(),
            cloudConversation.Id,
            It.IsAny<CommsMessageReplicatePayload>(),
            1,
            It.IsAny<TimeSpan?>()), Times.Once);
    }
}
