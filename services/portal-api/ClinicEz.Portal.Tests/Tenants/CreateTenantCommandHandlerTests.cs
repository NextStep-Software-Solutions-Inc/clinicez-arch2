using ClinicEz.Portal.Application.Common;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Licensing;
using ClinicEz.Portal.Application.Features.Tenants.Commands.CreateTenant;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Moq;
using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Xunit;

namespace ClinicEz.Portal.Tests.Tenants;

public class CreateTenantCommandHandlerTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly Mock<IClerkMetadataSync> _clerk = new();
    private readonly CreateTenantCommandHandler _handler;

    public CreateTenantCommandHandlerTests()
    {
        TestSupport.Entitlements(_context);
        var subscriptions = new SubscriptionService(
            _context,
            Options.Create(TestSupport.Plans()),
            TimeProvider.System,
            new Mock<IEntitlementsPublisher>().Object);
        _handler = new CreateTenantCommandHandler(_context, TestSupport.OwnershipPolicy(_context), subscriptions, _clerk.Object, TimeProvider.System);
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private static CreateTenantCommand Command(string ownerId = "user_clerk_123", string slug = "metro-health") =>
        new(OwnerId: ownerId, Name: "Metro Health Practice", TenantSlug: slug, TenantType: "Workplace", FirstName: "Jane", LastName: "Doe", Email: "Jane@Metro.com");

    [Fact]
    public async Task Handle_ValidRequest_CreatesTenantOwnerMembershipAndTrial()
    {
        var result = await _handler.Handle(Command(), CancellationToken.None);

        Assert.Equal("metro-health", result.TenantSlug);
        Assert.Equal("Metro Health Practice", result.Name);
        Assert.Equal("Workplace", result.TenantType);

        var tenant = await _context.Tenants.SingleAsync();
        Assert.Equal("user_clerk_123", tenant.OwnerId);

        var owner = await _context.WorkspaceMembers.SingleAsync();
        Assert.Equal(WorkspaceMemberRole.Owner, owner.Role);
        Assert.Equal(MemberStatus.Active, owner.Status);
        Assert.Equal("user_clerk_123", owner.UserId);
        Assert.Equal("jane@metro.com", owner.Email);

        var subscription = await _context.Subscriptions.SingleAsync();
        Assert.Equal(tenant.Id, subscription.TenantId);
        Assert.Equal(SubscriptionStatus.Trialing, subscription.Status);
    }

    [Fact]
    public async Task Handle_ValidRequest_MirrorsTheOwnershipIntoClerkMetadata()
    {
        await _handler.Handle(Command(), CancellationToken.None);

        _clerk.Verify(c => c.SyncAsync("user_clerk_123", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_UserAlreadyOwnsAWorkspace_ThrowsCodedConflict_AndCreatesNothing()
    {
        await _handler.Handle(Command(), CancellationToken.None);

        var ex = await Assert.ThrowsAsync<CodedConflictException>(() => _handler.Handle(Command(slug: "second-workplace"), CancellationToken.None));

        Assert.Equal(ConflictCodes.OwnerAlreadyHasWorkspace, ex.Code);
        Assert.Single(_context.Tenants);
        Assert.Single(_context.Subscriptions);
    }

    [Fact]
    public async Task Handle_SlugAlreadyTaken_ThrowsValidationException()
    {
        await _handler.Handle(Command(ownerId: "different_user", slug: "taken-slug"), CancellationToken.None);

        var ex = await Assert.ThrowsAsync<ValidationException>(() => _handler.Handle(Command(ownerId: "user_clerk_456", slug: "TAKEN-slug"), CancellationToken.None));

        Assert.Contains("Workplace URL slug is already taken", ex.Message);
        Assert.Single(_context.Tenants);
    }
}