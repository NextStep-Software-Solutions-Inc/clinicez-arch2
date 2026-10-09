using ClinicEz.Portal.Application.Common;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Features.Links;
using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Tests.Links;

public class FacilityLinkTests : IDisposable
{
    private static readonly WorkspaceActor Admin = new("admin-1", "Admin One", "Admin");

    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly Tenant _requester = NewTenant("requester");
    private readonly Tenant _owner = NewTenant("owner-ws");

    public FacilityLinkTests()
    {
        _context.Tenants.AddRange(_requester, _owner);
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private static Tenant NewTenant(string slug) =>
        new() { Id = Guid.NewGuid(), TenantSlug = slug, Name = slug, OwnerId = $"o-{slug}", Email = $"{slug}@ws.ph" };

    private IEntitlementGuard Guard() => new EntitlementGuard(_context, TestSupport.Entitlements(_context));

    private Task Subscribe(Tenant tenant, string plan) => TestSupport.SeedSubscriptionAsync(_context, tenant.Id, SubscriptionStatus.Active, plan);

    private async Task<Facility> AddFacilityAsync(
        Tenant tenant,
        FacilityType type = FacilityType.Clinic,
        FacilityVisibility visibility = FacilityVisibility.Private,
        bool acceptsRequests = false,
        FacilityStatus status = FacilityStatus.Active)
    {
        var facility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            Name = $"{tenant.TenantSlug} {type}",
            FacilityType = type,
            Visibility = visibility,
            AcceptsExternalRequests = acceptsRequests,
            Status = status
        };
        _context.Facilities.Add(facility);
        await _context.SaveChangesAsync();
        return facility;
    }

    private async Task<(Facility Source, Facility Target)> SetUpAsync(bool acceptsRequests, string requesterPlan = "pro", string ownerPlan = "pro")
    {
        await Subscribe(_requester, requesterPlan);
        await Subscribe(_owner, ownerPlan);
        var source = await AddFacilityAsync(_requester, FacilityType.Clinic);
        var target = await AddFacilityAsync(_owner, FacilityType.Laboratory, FacilityVisibility.Public, acceptsRequests);
        return (source, target);
    }

    private Task<FacilityLinkDto> RequestAsync(Facility source, Facility target, LinkScopes scopes = LinkScopes.None) =>
        new RequestFacilityLinkCommandHandler(_context, Guard())
            .Handle(new RequestFacilityLinkCommand(_requester.TenantSlug, Admin, source.Id, target.Id, scopes), CancellationToken.None);

    private Task<FacilityLinkDto> ApproveAsync(Guid linkId, LinkScopes? scopes = null) =>
        new ApproveFacilityLinkCommandHandler(_context, Guard())
            .Handle(new ApproveFacilityLinkCommand(_owner.TenantSlug, Admin, linkId, scopes), CancellationToken.None);

    private Task<FacilityLinkDto> RejectAsync(Guid linkId) =>
        new RejectFacilityLinkCommandHandler(_context)
            .Handle(new RejectFacilityLinkCommand(_owner.TenantSlug, Admin, linkId), CancellationToken.None);

    private Task<FacilityLinkDto> RevokeAsync(Tenant side, Guid linkId) =>
        new RevokeFacilityLinkCommandHandler(_context)
            .Handle(new RevokeFacilityLinkCommand(side.TenantSlug, Admin, linkId), CancellationToken.None);

    private List<DirectoryLinkUpsertedPayload> StagedLinks(int skip = 0) =>
        TestSupport.Outbox(_context, InteropTypes.DirectoryLinkUpserted)
            .Skip(skip)
            .Select(e => e.GetPayload<DirectoryLinkUpsertedPayload>())
            .ToList();

    [Fact]
    public async Task Request_ToAFacilityThatAcceptsExternalRequests_IsActiveAtOnce_ApprovedByAutoAccept()
    {
        var (source, target) = await SetUpAsync(acceptsRequests: true);

        var link = await RequestAsync(source, target);

        Assert.Equal("Active", link.Status);
        Assert.Equal("outgoing", link.Direction);
        var stored = await _context.FacilityLinks.SingleAsync();
        Assert.Equal(FacilityLinkApprovers.AutoAccept, stored.ApprovedBy);
        Assert.Equal(Admin.UserId, stored.RequestedBy);
        Assert.Equal(DirectoryPayloads.LinkId(source.Id, target.Id), stored.Id);
        Assert.Equal(_requester.Id, stored.SourceTenantId);
        Assert.Equal(_owner.Id, stored.TargetTenantId);
    }

    [Fact]
    public async Task Request_ToAPublicFacilityThatDoesNotAutoAccept_IsPendingUntilApproved()
    {
        var (source, target) = await SetUpAsync(acceptsRequests: false);

        var link = await RequestAsync(source, target);

        Assert.Equal("Pending", link.Status);
        Assert.Null((await _context.FacilityLinks.SingleAsync()).ApprovedBy);
    }

    [Fact]
    public async Task Request_WithoutExplicitScopes_GrantsAllScopes_AndKeepsRequestedScopes()
    {
        var (source, target) = await SetUpAsync(acceptsRequests: false);

        var all = await RequestAsync(source, target);
        await RevokeAsync(_requester, all.Id);
        var narrowed = await RequestAsync(source, target, LinkScopes.LabOrder | LinkScopes.Result);

        Assert.Equal(["LabOrder", "Prescription", "Referral", "Result"], all.Scopes);
        Assert.Equal(["LabOrder", "Result"], narrowed.Scopes);
    }

    [Fact]
    public async Task Request_OnAPlanWithoutCrossTenantInterop_IsRefusedWithFeatureUnavailable()
    {
        var (source, target) = await SetUpAsync(acceptsRequests: true, requesterPlan: "starter");

        var ex = await Assert.ThrowsAsync<EntitlementException>(() => RequestAsync(source, target));

        Assert.Equal(EntitlementGuard.FeatureUnavailableCode, ex.Code);
        Assert.Empty(_context.FacilityLinks);
    }

    [Fact]
    public async Task Request_ToAPrivateOrInactiveOrUnknownFacility_LooksLikeNotFound()
    {
        await Subscribe(_requester, "pro");
        var source = await AddFacilityAsync(_requester);
        var privateTarget = await AddFacilityAsync(_owner, FacilityType.Laboratory, FacilityVisibility.Private);
        var suspendedTarget = await AddFacilityAsync(_owner, FacilityType.Pharmacy, FacilityVisibility.Public, true, FacilityStatus.Suspended);

        await Assert.ThrowsAsync<NotFoundException>(() => RequestAsync(source, privateTarget));
        await Assert.ThrowsAsync<NotFoundException>(() => RequestAsync(source, suspendedTarget));
        await Assert.ThrowsAsync<NotFoundException>(() => RequestAsync(source, new Facility { Id = Guid.NewGuid() }));
        Assert.Empty(_context.FacilityLinks);
    }

    [Fact]
    public async Task Request_BetweenFacilitiesOfOneWorkspace_IsRejected()
    {
        await Subscribe(_requester, "pro");
        var source = await AddFacilityAsync(_requester);
        var sibling = await AddFacilityAsync(_requester, FacilityType.Laboratory, FacilityVisibility.Public, true);

        await Assert.ThrowsAsync<BadRequestException>(() => RequestAsync(source, sibling));
    }

    [Fact]
    public async Task Request_FromAFacilityOfAnotherWorkspace_IsNotFound()
    {
        var (_, target) = await SetUpAsync(acceptsRequests: true);
        var foreign = await AddFacilityAsync(_owner, FacilityType.Pharmacy);

        await Assert.ThrowsAsync<NotFoundException>(() => RequestAsync(foreign, target));
    }

    [Fact]
    public async Task Request_FromAnInactiveFacility_IsAConflict()
    {
        var (_, target) = await SetUpAsync(acceptsRequests: true);
        var suspended = await AddFacilityAsync(_requester, FacilityType.Pharmacy, status: FacilityStatus.Suspended);

        await Assert.ThrowsAsync<ConflictException>(() => RequestAsync(suspended, target));
    }

    [Fact]
    public async Task Request_WhileOnePendingOrActive_IsAConflictWithTheLinkAlreadyExistsCode()
    {
        var (source, target) = await SetUpAsync(acceptsRequests: false);
        await RequestAsync(source, target);

        var ex = await Assert.ThrowsAsync<CodedConflictException>(() => RequestAsync(source, target));

        Assert.Equal(ConflictCodes.LinkAlreadyExists, ex.Code);
        Assert.Single(_context.FacilityLinks);
    }

    [Fact]
    public async Task Request_AfterRevokeOrReject_ReusesTheSameLinkRow()
    {
        var (source, target) = await SetUpAsync(acceptsRequests: false);
        var first = await RequestAsync(source, target);
        await RejectAsync(first.Id);

        var again = await RequestAsync(source, target);

        Assert.Equal(first.Id, again.Id);
        Assert.Equal("Pending", again.Status);
        Assert.Single(_context.FacilityLinks);
    }

    [Fact]
    public async Task Approve_ActivatesAPendingLink_AndRecordsTheApprover()
    {
        var (source, target) = await SetUpAsync(acceptsRequests: false);
        var pending = await RequestAsync(source, target);

        var approved = await ApproveAsync(pending.Id);

        Assert.Equal("Active", approved.Status);
        Assert.Equal("incoming", approved.Direction);
        Assert.Equal(Admin.UserId, (await _context.FacilityLinks.SingleAsync()).ApprovedBy);
    }

    [Fact]
    public async Task Approve_CanOnlyNarrowTheRequestedScopes()
    {
        var (source, target) = await SetUpAsync(acceptsRequests: false);
        var pending = await RequestAsync(source, target, LinkScopes.LabOrder | LinkScopes.Result);

        await Assert.ThrowsAsync<BadRequestException>(() => ApproveAsync(pending.Id, LinkScopes.LabOrder | LinkScopes.Prescription));
        var approved = await ApproveAsync(pending.Id, LinkScopes.Result);

        Assert.Equal(["Result"], approved.Scopes);
    }

    [Fact]
    public async Task Approve_OnAPlanWithoutCrossTenantInterop_IsRefused()
    {
        var (source, target) = await SetUpAsync(acceptsRequests: false, ownerPlan: "starter");
        var pending = await RequestAsync(source, target);

        var ex = await Assert.ThrowsAsync<EntitlementException>(() => ApproveAsync(pending.Id));

        Assert.Equal(EntitlementGuard.FeatureUnavailableCode, ex.Code);
        Assert.Equal(LinkStatus.Pending, (await _context.FacilityLinks.SingleAsync()).Status);
    }

    [Fact]
    public async Task Approve_ByAnyoneButTheTargetWorkspace_IsNotFound()
    {
        var (source, target) = await SetUpAsync(acceptsRequests: false);
        var pending = await RequestAsync(source, target);

        await Assert.ThrowsAsync<NotFoundException>(() =>
            new ApproveFacilityLinkCommandHandler(_context, Guard())
                .Handle(new ApproveFacilityLinkCommand(_requester.TenantSlug, Admin, pending.Id, null), CancellationToken.None));
    }

    [Fact]
    public async Task Approve_IsIdempotentForAnActiveLink_AndRefusedOnceRejectedOrRevoked()
    {
        var (source, target) = await SetUpAsync(acceptsRequests: false);
        var pending = await RequestAsync(source, target);
        await ApproveAsync(pending.Id);
        Assert.Equal("Active", (await ApproveAsync(pending.Id)).Status);

        await RevokeAsync(_owner, pending.Id);
        var ex = await Assert.ThrowsAsync<CodedConflictException>(() => ApproveAsync(pending.Id));

        Assert.Equal(ConflictCodes.LinkNotPending, ex.Code);
    }

    [Fact]
    public async Task Reject_EndsAPendingRequest_AndCannotBeUndoneByApproving()
    {
        var (source, target) = await SetUpAsync(acceptsRequests: false);
        var pending = await RequestAsync(source, target);

        var rejected = await RejectAsync(pending.Id);

        Assert.Equal("Rejected", rejected.Status);
        var ex = await Assert.ThrowsAsync<CodedConflictException>(() => ApproveAsync(pending.Id));
        Assert.Equal(ConflictCodes.LinkNotPending, ex.Code);
    }

    [Fact]
    public async Task Reject_OfAnActiveLink_IsAConflict()
    {
        var (source, target) = await SetUpAsync(acceptsRequests: true);
        var active = await RequestAsync(source, target);

        var ex = await Assert.ThrowsAsync<CodedConflictException>(() => RejectAsync(active.Id));

        Assert.Equal(ConflictCodes.LinkNotPending, ex.Code);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Revoke_ByEitherSide_EndsTheLink_EvenOnAPlanWithoutTheFeature(bool byRequester)
    {
        var (source, target) = await SetUpAsync(acceptsRequests: true);
        var active = await RequestAsync(source, target);
        var downgraded = await _context.Subscriptions.Include(s => s.Plan).SingleAsync(s => s.TenantId == (byRequester ? _requester.Id : _owner.Id));
        downgraded.Plan = await _context.Plans.SingleAsync(p => p.Slug == "starter");
        downgraded.PlanId = downgraded.Plan.Id;
        await _context.SaveChangesAsync();

        var revoked = await RevokeAsync(byRequester ? _requester : _owner, active.Id);

        Assert.Equal("Revoked", revoked.Status);
        Assert.Equal(byRequester ? "outgoing" : "incoming", revoked.Direction);
    }

    [Fact]
    public async Task Revoke_ByAThirdWorkspace_IsNotFound()
    {
        var (source, target) = await SetUpAsync(acceptsRequests: true);
        var active = await RequestAsync(source, target);
        var stranger = NewTenant("stranger");
        _context.Tenants.Add(stranger);
        await _context.SaveChangesAsync();

        await Assert.ThrowsAsync<NotFoundException>(() => RevokeAsync(stranger, active.Id));
    }

    [Fact]
    public async Task Revoke_AlreadyRevoked_IsIdempotent_ButARejectedRequestHasNothingToRevoke()
    {
        var (source, target) = await SetUpAsync(acceptsRequests: false);
        var pending = await RequestAsync(source, target);
        await RevokeAsync(_requester, pending.Id);
        Assert.Equal("Revoked", (await RevokeAsync(_owner, pending.Id)).Status);

        await RequestAsync(source, target);
        await RejectAsync(pending.Id);
        var ex = await Assert.ThrowsAsync<CodedConflictException>(() => RevokeAsync(_requester, pending.Id));

        Assert.Equal(ConflictCodes.LinkNotPending, ex.Code);
    }

    [Fact]
    public async Task Links_AreStagedForTheHubDirectory_IncludingRevocations()
    {
        var (source, target) = await SetUpAsync(acceptsRequests: false);
        var before = StagedLinks().Count;

        var pending = await RequestAsync(source, target);
        await ApproveAsync(pending.Id);
        await RevokeAsync(_owner, pending.Id);

        var staged = StagedLinks(before);
        Assert.Equal([LinkStatus.Pending, LinkStatus.Active, LinkStatus.Revoked], staged.Select(l => l.Status));
        Assert.All(staged, l =>
        {
            Assert.Equal(pending.Id, l.LinkId);
            Assert.Equal(source.Id.ToString(), l.SourceFacilityId);
            Assert.Equal(target.Id.ToString(), l.TargetFacilityId);
        });
    }

    [Fact]
    public async Task DeletingAFacility_RevokesItsLinksSoTheHubStopsRouting()
    {
        var (source, target) = await SetUpAsync(acceptsRequests: true);
        var active = await RequestAsync(source, target);
        var before = StagedLinks().Count;

        await FacilityLinkLifecycle.RevokeAllForFacilityAsync(_context, target.Id, CancellationToken.None);
        await _context.SaveChangesAsync();

        Assert.Equal(LinkStatus.Revoked, (await _context.FacilityLinks.SingleAsync()).Status);
        var staged = Assert.Single(StagedLinks(before));
        Assert.Equal(active.Id, staged.LinkId);
        Assert.Equal(LinkStatus.Revoked, staged.Status);
    }

    [Fact]
    public async Task GetLinks_ListsBothDirections_ForTheWorkspaceOnly()
    {
        var (source, target) = await SetUpAsync(acceptsRequests: true);
        await RequestAsync(source, target);
        var stranger = NewTenant("stranger");
        _context.Tenants.Add(stranger);
        await _context.SaveChangesAsync();
        var handler = new GetFacilityLinksQueryHandler(_context);

        var outgoing = await handler.Handle(new GetFacilityLinksQuery(_requester.TenantSlug), CancellationToken.None);
        var incoming = await handler.Handle(new GetFacilityLinksQuery(_owner.TenantSlug), CancellationToken.None);
        var none = await handler.Handle(new GetFacilityLinksQuery(stranger.TenantSlug), CancellationToken.None);

        Assert.Equal("outgoing", Assert.Single(outgoing).Direction);
        Assert.Equal("incoming", Assert.Single(incoming).Direction);
        Assert.Empty(none);
    }

    private Task<FacilityVisibilityDto> SetVisibilityAsync(Tenant tenant, Facility facility, FacilityVisibility visibility, bool accepts = false) =>
        new SetFacilityVisibilityCommandHandler(_context, Guard())
            .Handle(new SetFacilityVisibilityCommand(tenant.TenantSlug, Admin, facility.Id, visibility, accepts), CancellationToken.None);

    [Fact]
    public async Task Visibility_AbovePrivate_NeedsTheCrossTenantInteropFeature()
    {
        await Subscribe(_requester, "starter");
        var facility = await AddFacilityAsync(_requester);

        var ex = await Assert.ThrowsAsync<EntitlementException>(() => SetVisibilityAsync(_requester, facility, FacilityVisibility.Public));

        Assert.Equal(EntitlementGuard.FeatureUnavailableCode, ex.Code);
        Assert.Equal(FacilityVisibility.Private, (await _context.Facilities.AsNoTracking().SingleAsync()).Visibility);
    }

    [Fact]
    public async Task Visibility_GoingBackToPrivate_IsAlwaysAllowed()
    {
        await Subscribe(_requester, "starter");
        var facility = await AddFacilityAsync(_requester, visibility: FacilityVisibility.Public, acceptsRequests: true);

        var result = await SetVisibilityAsync(_requester, facility, FacilityVisibility.Private);

        Assert.Equal("Private", result.Visibility);
        Assert.False(result.AcceptsExternalRequests);
    }

    [Fact]
    public async Task Visibility_OnAPlanWithTheFeature_PublishesTheFacility_AndStagesItForTheDirectory()
    {
        await Subscribe(_requester, "pro");
        var facility = await AddFacilityAsync(_requester);
        var before = TestSupport.Outbox(_context, InteropTypes.DirectoryFacilityUpserted).Count;

        var result = await SetVisibilityAsync(_requester, facility, FacilityVisibility.Public, accepts: true);

        Assert.Equal("Public", result.Visibility);
        Assert.True(result.AcceptsExternalRequests);
        var staged = TestSupport.OutboxPayloads<DirectoryFacilityUpsertedPayload>(_context, InteropTypes.DirectoryFacilityUpserted).Skip(before).Single();
        Assert.Equal(facility.Id.ToString(), staged.FacilityId);
        Assert.Equal(FacilityVisibility.Public, staged.Visibility);
        Assert.True(staged.AcceptsExternalRequests);
    }

    [Theory]
    [InlineData(FacilityVisibility.Private)]
    [InlineData(FacilityVisibility.Network)]
    public async Task Visibility_AcceptingExternalRequests_RequiresPublic(FacilityVisibility visibility)
    {
        await Subscribe(_requester, "pro");
        var facility = await AddFacilityAsync(_requester);

        await Assert.ThrowsAsync<BadRequestException>(() => SetVisibilityAsync(_requester, facility, visibility, accepts: true));
    }

    [Fact]
    public async Task Visibility_OfAFacilityInAnotherWorkspace_IsNotFound()
    {
        await Subscribe(_requester, "pro");
        var foreign = await AddFacilityAsync(_owner);

        await Assert.ThrowsAsync<NotFoundException>(() => SetVisibilityAsync(_requester, foreign, FacilityVisibility.Public));
    }

    [Fact]
    public async Task DirectorySearch_AsksTheHubAsTheWorkspace_WithTheCriteria()
    {
        var hub = new Mock<IHubDirectoryClient>();
        var found = new DirectoryFacilityDto(_owner.Id.ToString(), Guid.NewGuid().ToString(), FacilityType.Laboratory, "Lab", "Cebu", FacilityVisibility.Public, true, false, null);
        var criteria = new DirectorySearchCriteria(FacilityType.Laboratory, "lab", "Cebu");
        hub.Setup(h => h.SearchFacilitiesAsync(_requester.Id, criteria, It.IsAny<CancellationToken>())).ReturnsAsync([found]);

        var result = await new SearchDirectoryQueryHandler(_context, hub.Object)
            .Handle(new SearchDirectoryQuery(_requester.TenantSlug, criteria), CancellationToken.None);

        Assert.Equal([found], result);
        hub.Verify(h => h.SearchFacilitiesAsync(_requester.Id, criteria, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task DirectorySearch_ForAnUnknownWorkspace_IsNotFound_AndNeverCallsTheHub()
    {
        var hub = new Mock<IHubDirectoryClient>(MockBehavior.Strict);

        await Assert.ThrowsAsync<NotFoundException>(() =>
            new SearchDirectoryQueryHandler(_context, hub.Object)
                .Handle(new SearchDirectoryQuery("missing", new DirectorySearchCriteria(null, null, null)), CancellationToken.None));
    }
}
