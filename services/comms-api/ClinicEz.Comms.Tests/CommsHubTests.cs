using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Comms.Application.Common.Interfaces;
using ClinicEz.Comms.Application.Models;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Infrastructure.Hubs;
using ClinicEz.Comms.Infrastructure.Persistence;
using ClinicEz.Comms.Tests.Support;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Security;
using MediatR;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace ClinicEz.Comms.Tests;

public class CommsHubTests
{
    private readonly Mock<IMediator> _mediatorMock = new();
    private readonly Mock<IHubCallerClients<ICommsClient>> _clientsMock = new();
    private readonly Mock<ICommsClient> _clientProxyMock = new();
    private readonly Mock<IGroupManager> _groupManagerMock = new();
    private readonly Mock<HubCallerContext> _contextMock = new();

    private CommsHub CreateHub(CommsDbContext db, ClaimsPrincipal principal)
    {
        _contextMock.Setup(c => c.User).Returns(principal);
        _contextMock.Setup(c => c.ConnectionId).Returns("conn-123");

        _clientsMock.Setup(c => c.Group(It.IsAny<string>())).Returns(_clientProxyMock.Object);

        var hub = new CommsHub(db, _mediatorMock.Object, NullLogger<CommsHub>.Instance)
        {
            Context = _contextMock.Object,
            Groups = _groupManagerMock.Object,
            Clients = _clientsMock.Object
        };

        return hub;
    }

    [Fact]
    public async Task JoinConversation_CrossTenant_ThrowsHubException()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-target",
            FacilityId = "fac-1",
            Title = "Target Channel",
            Scope = ConversationScope.Facility
        };
        db.Conversations.Add(conversation);
        await db.SaveChangesAsync();

        var callerClaims = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim("tenant_id", "tenant-attacker"),
            new Claim("facility_id", "fac-1"),
            new Claim("sub", "staff-bad")
        ], "TestAuth"));

        var hub = CreateHub(db, callerClaims);

        var ex = await Assert.ThrowsAsync<HubException>(() => hub.JoinConversation(conversation.Id));
        Assert.Contains("Cross-tenant access forbidden", ex.Message);
    }

    [Fact]
    public async Task JoinConversation_PendingTriage_WithoutPermission_ThrowsHubException()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            Title = "Patient Inbound",
            Scope = ConversationScope.PatientFacility,
            Status = RequestStatus.Submitted // Pending triage
        };
        db.Conversations.Add(conversation);
        await db.SaveChangesAsync();

        // Doctor without messaging:triage permission
        var callerClaims = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim("tenant_id", "tenant-1"),
            new Claim("facility_id", "fac-1"),
            new Claim("sub", "doctor-1"),
            new Claim("permission", CommsPermissions.MessagingRead),
            new Claim("permission", CommsPermissions.MessagingWrite)
        ], "TestAuth"));

        var hub = CreateHub(db, callerClaims);

        var ex = await Assert.ThrowsAsync<HubException>(() => hub.JoinConversation(conversation.Id));
        Assert.Contains("pending triage routing", ex.Message);
    }

    [Fact]
    public async Task JoinConversation_PendingTriage_WithTriagePermission_Succeeds()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-1",
            FacilityId = "fac-1",
            Title = "Patient Inbound",
            Scope = ConversationScope.PatientFacility,
            Status = RequestStatus.Submitted
        };
        db.Conversations.Add(conversation);
        await db.SaveChangesAsync();

        // Triage nurse with messaging:triage permission
        var callerClaims = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim("tenant_id", "tenant-1"),
            new Claim("facility_id", "fac-1"),
            new Claim("sub", "nurse-triage"),
            new Claim(ClaimTypes.Name, "Nurse Sarah"),
            new Claim("permission", CommsPermissions.MessagingTriage)
        ], "TestAuth"));

        var hub = CreateHub(db, callerClaims);

        await hub.JoinConversation(conversation.Id);

        _groupManagerMock.Verify(g => g.AddToGroupAsync("conn-123", $"conv:{conversation.Id}", default), Times.Once);
        _clientProxyMock.Verify(c => c.OnParticipantJoined(conversation.Id, "nurse-triage", "Nurse Sarah", "Member"), Times.Once);
    }

    [Fact]
    public async Task GetMessagesAfterSeq_ReturnsOrderedMissedMessages()
    {
        var db = TestDbContextFactory.CreateInMemory();
        var conversationId = Guid.NewGuid();

        for (int i = 1; i <= 5; i++)
        {
            db.Messages.Add(new Message
            {
                Id = Guid.NewGuid(),
                ConversationId = conversationId,
                Seq = i,
                ContentText = $"Message {i}",
                TenantId = "tenant-1",
                FacilityId = "fac-1",
                SenderType = "Staff",
                State = DeliveryState.Waiting
            });
        }
        await db.SaveChangesAsync();

        var callerClaims = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim("tenant_id", "tenant-1"),
            new Claim("facility_id", "fac-1"),
            new Claim("sub", "staff-1")
        ], "TestAuth"));

        var hub = CreateHub(db, callerClaims);

        // Request messages after seq 3 (expect 4 and 5)
        var missed = await hub.GetMessagesAfterSeq(conversationId, 3);

        Assert.Equal(2, missed.Count);
        Assert.Equal(4, missed[0].Seq);
        Assert.Equal("Message 4", missed[0].ContentText);
        Assert.Equal(5, missed[1].Seq);
        Assert.Equal("Message 5", missed[1].ContentText);
    }
}
