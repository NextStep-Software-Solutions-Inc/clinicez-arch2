using ClinicEz.Portal.Application.Common;
using ClinicEz.Portal.Application.Features.Ownership;
using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Exceptions;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace ClinicEz.Portal.Tests.Ownership;

public class OwnershipTransferTests : IDisposable
{
    private const string Slug = "metro-clinic";
    private const string OwnerId = "clerk_owner";
    private const string AdminId = "clerk_admin";

    private static readonly WorkspaceActor OwnerActor = new(OwnerId, "Juan", "Owner");
    private static readonly WorkspaceActor AdminActor = new(AdminId, "Maria", "Admin");

    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly TestClock _clock = new(new DateTimeOffset(2026, 10, 9, 8, 0, 0, TimeSpan.Zero));
    private readonly Mock<IClerkMetadataSync> _clerk = new();
    private readonly Tenant _tenant;

    public OwnershipTransferTests()
    {
        _tenant = new Tenant { Id = Guid.NewGuid(), TenantSlug = Slug, Name = "Metro", OwnerId = OwnerId, Email = "owner@metro.ph" };
        _context.Tenants.Add(_tenant);
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private WorkspaceMember Member(string? userId, string name, WorkspaceMemberRole role = WorkspaceMemberRole.Admin, MemberStatus status = MemberStatus.Active)
    {
        var member = new WorkspaceMember
        {
            TenantId = _tenant.Id,
            UserId = userId,
            Email = $"{name}@metro.ph".Replace(' ', '.'),
            FullName = name,
            Role = role,
            Status = status
        };
        _context.WorkspaceMembers.Add(member);
        _context.SaveChanges();
        return member;
    }

    private Task<OwnershipTransferDto> Offer(Guid targetId, string confirm = Slug, WorkspaceActor? actor = null) =>
        new OfferOwnershipTransferCommandHandler(_context, TestSupport.OwnershipPolicy(_context), _clock)
            .Handle(new OfferOwnershipTransferCommand(Slug, actor ?? OwnerActor, targetId, confirm), CancellationToken.None);

    private Task<OwnershipTransferResultDto> Accept(WorkspaceActor actor) =>
        new AcceptOwnershipTransferCommandHandler(_context, TestSupport.OwnershipPolicy(_context), _clerk.Object, _clock)
            .Handle(new AcceptOwnershipTransferCommand(Slug, actor), CancellationToken.None);

    private Task Decline(WorkspaceActor actor) =>
        new DeclineOwnershipTransferCommandHandler(_context, _clock).Handle(new DeclineOwnershipTransferCommand(Slug, actor), CancellationToken.None);

    private Task Cancel(WorkspaceActor actor) =>
        new CancelOwnershipTransferCommandHandler(_context, _clock).Handle(new CancelOwnershipTransferCommand(Slug, actor), CancellationToken.None);

    [Fact]
    public async Task Offer_CreatesPendingOffer_WithoutChangingOwnership()
    {
        var target = Member(AdminId, "Maria Santos");

        var offer = await Offer(target.Id);

        Assert.Equal("Pending", offer.Status);
        Assert.Equal(_clock.GetUtcNow().UtcDateTime.AddDays(7), offer.ExpiresAt);
        Assert.Equal(OwnerId, (await _context.Tenants.SingleAsync()).OwnerId);
        var audit = await _context.WorkspaceAuditEntries.SingleAsync();
        Assert.Equal("ownership", audit.Section);
        Assert.Equal("offered", audit.Action);
    }

    [Fact]
    public async Task Offer_RequiresOwner_ActiveTarget_AndSlugConfirmation()
    {
        var invited = Member(null, "Pending Pat", status: MemberStatus.Invited);
        var suspended = Member("clerk_s", "Sam", status: MemberStatus.Suspended);

        await Assert.ThrowsAsync<ForbiddenException>(() => Offer(invited.Id, actor: AdminActor));
        await Assert.ThrowsAsync<BadRequestException>(() => Offer(invited.Id));
        await Assert.ThrowsAsync<BadRequestException>(() => Offer(suspended.Id));
        await Assert.ThrowsAsync<NotFoundException>(() => Offer(Guid.NewGuid()));

        Assert.False(new OfferOwnershipTransferCommandValidator()
            .Validate(new OfferOwnershipTransferCommand(Slug, OwnerActor, Guid.NewGuid(), "wrong")).IsValid);
        Assert.True(new OfferOwnershipTransferCommandValidator()
            .Validate(new OfferOwnershipTransferCommand(Slug, OwnerActor, Guid.NewGuid(), " METRO-CLINIC ")).IsValid);
    }

    [Fact]
    public async Task Offer_RefusesTargetWhoAlreadyOwnsAWorkspace_With409Code()
    {
        var target = Member(AdminId, "Maria Santos");
        _context.Tenants.Add(new Tenant { Id = Guid.NewGuid(), TenantSlug = "other", Name = "Other", OwnerId = AdminId, Email = "m@other.ph" });
        await _context.SaveChangesAsync();

        var ex = await Assert.ThrowsAsync<CodedConflictException>(() => Offer(target.Id));

        Assert.Equal(ConflictCodes.TargetAlreadyOwnsWorkspace, ex.Code);
        Assert.Empty(_context.OwnershipTransfers);
    }

    [Fact]
    public async Task Offer_OnlyOneOpenOfferPerWorkspace()
    {
        var first = Member(AdminId, "Maria Santos");
        var second = Member("clerk_other", "Pedro Reyes");
        await Offer(first.Id);

        await Assert.ThrowsAsync<ConflictException>(() => Offer(second.Id));
    }

    [Fact]
    public async Task Accept_SwapsOwner_KeepsPreviousOwnerAsAdmin_AndMirrorsToClerk()
    {
        var oldOwner = Member(OwnerId, "Juan Dela Cruz", WorkspaceMemberRole.Owner);
        var target = Member(AdminId, "Maria Santos");
        await Offer(target.Id);

        var result = await Accept(AdminActor);

        Assert.Equal("Maria Santos", result.NewOwnerName);
        Assert.Equal(AdminId, (await _context.Tenants.SingleAsync()).OwnerId);
        Assert.Equal(WorkspaceMemberRole.Owner, (await _context.WorkspaceMembers.SingleAsync(m => m.Id == target.Id)).Role);
        Assert.Equal(WorkspaceMemberRole.Admin, (await _context.WorkspaceMembers.SingleAsync(m => m.Id == oldOwner.Id)).Role);
        Assert.Equal(OwnershipTransferStatus.Accepted, (await _context.OwnershipTransfers.SingleAsync()).Status);
        Assert.Contains(_context.WorkspaceAuditEntries, a => a.Action == "transferred");
        _clerk.Verify(c => c.SyncAsync(OwnerId, It.IsAny<CancellationToken>()), Times.Once);
        _clerk.Verify(c => c.SyncAsync(AdminId, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Accept_WhenOwnerHadNoMemberRow_CreatesAdminRowForThem()
    {
        var target = Member(AdminId, "Maria Santos");
        await Offer(target.Id);

        await Accept(AdminActor);

        var former = await _context.WorkspaceMembers.SingleAsync(m => m.UserId == OwnerId);
        Assert.Equal(WorkspaceMemberRole.Admin, former.Role);
        Assert.Equal(MemberStatus.Active, former.Status);
    }

    [Fact]
    public async Task Accept_AfterwardsAccessResolvesWithSwappedRoles()
    {
        var target = Member(AdminId, "Maria Santos");
        await Offer(target.Id);
        await Accept(AdminActor);

        var access = new WorkspaceAccessService(_context);
        Assert.Equal(WorkspaceRole.Owner, (await access.ResolveAsync(Slug, AdminId))!.Role);
        Assert.Equal(WorkspaceRole.Admin, (await access.ResolveAsync(Slug, OwnerId))!.Role);
    }

    [Fact]
    public async Task Accept_OnlyByTheAddressedMember_AndNeedsAnOpenOffer()
    {
        var target = Member(AdminId, "Maria Santos");

        await Assert.ThrowsAsync<NotFoundException>(() => Accept(AdminActor));

        await Offer(target.Id);
        await Assert.ThrowsAsync<ForbiddenException>(() => Accept(new WorkspaceActor("someone_else", "X", "Admin")));
        Assert.Equal(OwnerId, (await _context.Tenants.SingleAsync()).OwnerId);
    }

    [Fact]
    public async Task Accept_RefusedWhenTargetMeanwhileOwnsAnotherWorkspace()
    {
        var target = Member(AdminId, "Maria Santos");
        await Offer(target.Id);
        _context.Tenants.Add(new Tenant { Id = Guid.NewGuid(), TenantSlug = "maria-own", Name = "Maria's", OwnerId = AdminId, Email = "m@own.ph" });
        await _context.SaveChangesAsync();

        var ex = await Assert.ThrowsAsync<CodedConflictException>(() => Accept(AdminActor));

        Assert.Equal(ConflictCodes.TargetAlreadyOwnsWorkspace, ex.Code);
        Assert.Equal(OwnerId, (await _context.Tenants.SingleAsync(t => t.TenantSlug == Slug)).OwnerId);
    }

    [Fact]
    public async Task Offer_ExpiresAfterSevenDays_AndANewOfferCanBeMade()
    {
        var target = Member(AdminId, "Maria Santos");
        await Offer(target.Id);

        _clock.Advance(TimeSpan.FromDays(7) + TimeSpan.FromMinutes(1));

        await Assert.ThrowsAsync<NotFoundException>(() => Accept(AdminActor));
        Assert.Equal(OwnershipTransferStatus.Expired, (await _context.OwnershipTransfers.SingleAsync()).Status);
        Assert.Equal(OwnerId, (await _context.Tenants.SingleAsync()).OwnerId);

        var again = await Offer(target.Id);
        Assert.Equal("Pending", again.Status);
    }

    [Fact]
    public async Task Decline_ByTarget_ClosesTheOffer()
    {
        var target = Member(AdminId, "Maria Santos");
        await Offer(target.Id);

        await Assert.ThrowsAsync<ForbiddenException>(() => Decline(OwnerActor));
        await Decline(AdminActor);

        Assert.Equal(OwnershipTransferStatus.Declined, (await _context.OwnershipTransfers.SingleAsync()).Status);
        Assert.Equal(OwnerId, (await _context.Tenants.SingleAsync()).OwnerId);
        await Assert.ThrowsAsync<NotFoundException>(() => Accept(AdminActor));
    }

    [Fact]
    public async Task Cancel_ByOwnerOnly_ClosesTheOffer()
    {
        var target = Member(AdminId, "Maria Santos");
        await Offer(target.Id);

        await Assert.ThrowsAsync<ForbiddenException>(() => Cancel(AdminActor));
        await Cancel(OwnerActor);

        Assert.Equal(OwnershipTransferStatus.Cancelled, (await _context.OwnershipTransfers.SingleAsync()).Status);
        await Assert.ThrowsAsync<NotFoundException>(() => Accept(AdminActor));
    }

    [Fact]
    public async Task GetOffer_VisibleToOwnerAndTargetOnly()
    {
        var target = Member(AdminId, "Maria Santos");
        Member("clerk_other", "Pedro Reyes");
        await Offer(target.Id);
        var handler = new GetOwnershipTransferQueryHandler(_context, _clock);

        Assert.NotNull(await handler.Handle(new GetOwnershipTransferQuery(Slug, OwnerId), CancellationToken.None));
        Assert.NotNull(await handler.Handle(new GetOwnershipTransferQuery(Slug, AdminId), CancellationToken.None));
        Assert.Null(await handler.Handle(new GetOwnershipTransferQuery(Slug, "clerk_other"), CancellationToken.None));
    }

    [Fact]
    public async Task OwnershipPolicy_CountsArchivedWorkspaces_AndHonoursConfiguredLimit()
    {
        _tenant.ArchivedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        var single = TestSupport.OwnershipPolicy(_context);
        var ex = await Assert.ThrowsAsync<CodedConflictException>(() => single.EnsureCanOwnAsync(OwnerId, ConflictCodes.OwnerAlreadyHasWorkspace, CancellationToken.None));
        Assert.Equal(ConflictCodes.OwnerAlreadyHasWorkspace, ex.Code);

        await TestSupport.OwnershipPolicy(_context, maxOwned: 2).EnsureCanOwnAsync(OwnerId, ConflictCodes.OwnerAlreadyHasWorkspace, CancellationToken.None);
        await single.EnsureCanOwnAsync("someone_without_workspace", ConflictCodes.OwnerAlreadyHasWorkspace, CancellationToken.None);
    }
}
