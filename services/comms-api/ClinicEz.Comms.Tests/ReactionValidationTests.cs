using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Features.Reactions.Commands;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Tests.Support;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop.Contracts;
using Moq;
using Xunit;

namespace ClinicEz.Comms.Tests;

public class ReactionValidationTests
{
    private readonly Mock<ICommsRealtimeNotifier> _notifierMock = new();

    [Theory]
    [InlineData("thumbs_up")]
    [InlineData("thumbs_down")]
    [InlineData("heart")]
    [InlineData("laugh")]
    [InlineData("surprised")]
    [InlineData("sad")]
    public async Task AllowedReactions_Succeed_OnStaffConversation(string reaction)
    {
        var db = TestDbContextFactory.CreateInMemory();
        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            Title = "Doctors Lounge",
            Scope = ConversationScope.Facility
        };
        var message = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            Conversation = conversation,
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            ContentText = "Meeting at 3pm"
        };
        db.Conversations.Add(conversation);
        db.Messages.Add(message);
        await db.SaveChangesAsync();

        var handler = new SendReactionCommandHandler(db, _notifierMock.Object);
        var command = new SendReactionCommand(message.Id, "staff-1", "Dr. Reyes", reaction);

        var isAdded = await handler.Handle(command, CancellationToken.None);

        Assert.True(isAdded);
        var inDb = await db.MessageReactions.FindAsync(message.Id, "staff-1", reaction);
        Assert.NotNull(inDb);

        _notifierMock.Verify(n => n.NotifyReactionUpdatedAsync(
            conversation.Id,
            message.Id,
            reaction,
            "staff-1",
            "Dr. Reyes",
            true,
            1,
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task UnsupportedReaction_ThrowsValidationException()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            Title = "Staff Channel",
            Scope = ConversationScope.Facility
        };
        var message = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            Conversation = conversation,
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            ContentText = "Staff meeting"
        };
        db.Conversations.Add(conversation);
        db.Messages.Add(message);
        await db.SaveChangesAsync();

        var handler = new SendReactionCommandHandler(db, _notifierMock.Object);
        var command = new SendReactionCommand(message.Id, "staff-1", "Dr. Reyes", "party_popper");

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(command, CancellationToken.None));
        Assert.Contains("Only standard 6 reactions permitted", ex.Message);
    }

    [Fact]
    public async Task Reactions_OnPatientFacilityConversation_AreForbidden()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            Title = "Patient Inbound Thread",
            Scope = ConversationScope.PatientFacility
        };
        var message = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            Conversation = conversation,
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            ContentText = "My prescription needs refill"
        };
        db.Conversations.Add(conversation);
        db.Messages.Add(message);
        await db.SaveChangesAsync();

        var handler = new SendReactionCommandHandler(db, _notifierMock.Object);
        var command = new SendReactionCommand(message.Id, "staff-1", "Dr. Reyes", "thumbs_up");

        var ex = await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(command, CancellationToken.None));
        Assert.Contains("Reactions are forbidden on patient-facing conversations", ex.Message);
    }

    [Fact]
    public async Task SendReaction_Toggles_RemovesIfAlreadyPresent()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            Title = "Nurse Station",
            Scope = ConversationScope.Facility
        };
        var message = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            Conversation = conversation,
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            ContentText = "Shift change"
        };
        db.Conversations.Add(conversation);
        db.Messages.Add(message);
        await db.SaveChangesAsync();

        var handler = new SendReactionCommandHandler(db, _notifierMock.Object);
        var command = new SendReactionCommand(message.Id, "staff-1", "Nurse Kelly", "heart");

        // First tap: adds reaction
        var added = await handler.Handle(command, CancellationToken.None);
        Assert.True(added);
        Assert.NotNull(await db.MessageReactions.FindAsync(message.Id, "staff-1", "heart"));

        // Second tap: removes reaction
        var removed = await handler.Handle(command, CancellationToken.None);
        Assert.False(removed);
        Assert.Null(await db.MessageReactions.FindAsync(message.Id, "staff-1", "heart"));
    }
}
