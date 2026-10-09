using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.Portal.Tests.Hub;

/// <summary>The directory feed rides on every facility save (interceptor), so no code path can forget it.</summary>
public class DirectoryFeedTests : IDisposable
{
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly ApplicationDbContext _context;

    public DirectoryFeedTests()
    {
        _context = TestSupport.NewContext(new HubOptions { CloudCellId = "cloud-eu" });
        _context.Tenants.Add(new Tenant { Id = _tenantId, TenantSlug = "metro", Name = "Metro Health", OwnerId = "owner", Email = "a@metro.ph" });
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private Facility NewFacility(string name, FacilityType type = FacilityType.Clinic, Guid? branchId = null,
        FacilityStatus status = FacilityStatus.Active, FacilityDeploymentMode mode = FacilityDeploymentMode.SharedCloud) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = _tenantId,
        Name = name,
        FacilityType = type,
        Status = status,
        BranchId = branchId,
        DeploymentMode = mode
    };

    private List<DirectoryFacilityUpsertedPayload> FacilityFeed() =>
        TestSupport.OutboxPayloads<DirectoryFacilityUpsertedPayload>(_context, InteropTypes.DirectoryFacilityUpserted);

    [Fact]
    public async Task NewCloudFacility_StagesCellAndFacilityUpsertToTheHub_UsingTheConfiguredCloudCell()
    {
        var facility = NewFacility("Downtown Clinic");
        _context.Facilities.Add(facility);
        await _context.SaveChangesAsync();

        var cell = Assert.Single(TestSupport.OutboxPayloads<DirectoryCellUpsertedPayload>(_context, InteropTypes.DirectoryCellUpserted));
        Assert.Equal("cloud-eu", cell.CellId);
        Assert.Equal(CellKind.Cloud, cell.Kind);

        var feed = Assert.Single(FacilityFeed());
        Assert.Equal(facility.Id.ToString(), feed.FacilityId);
        Assert.Equal(_tenantId.ToString(), feed.TenantId);
        Assert.Equal("cloud-eu", feed.CellId);
        Assert.Equal("Downtown Clinic", feed.DisplayName);
        Assert.True(feed.Active);
        Assert.Equal(FacilityVisibility.Private, feed.Visibility);
        Assert.False(feed.AcceptsExternalRequests);

        var envelope = Assert.Single(TestSupport.Outbox(_context, InteropTypes.DirectoryFacilityUpserted));
        Assert.Equal(Party.Portal, envelope.From);
        Assert.Equal(Party.Hub, envelope.To);
        Assert.Equal("cloud-eu", (await _context.Facilities.SingleAsync()).CellId);
    }

    [Fact]
    public async Task NewOnPremiseFacility_UsesTheTenantEdgeCell()
    {
        _context.Facilities.Add(NewFacility("Site Clinic", mode: FacilityDeploymentMode.OnPremise));
        await _context.SaveChangesAsync();

        var cell = Assert.Single(TestSupport.OutboxPayloads<DirectoryCellUpsertedPayload>(_context, InteropTypes.DirectoryCellUpserted));
        Assert.Equal($"edge-{_tenantId}", cell.CellId);
        Assert.Equal(CellKind.Edge, cell.Kind);
        Assert.Equal(_tenantId.ToString(), cell.TenantId);
        Assert.Equal($"edge-{_tenantId}", Assert.Single(FacilityFeed()).CellId);
    }

    [Fact]
    public async Task ProvisioningFacility_IsAlreadyRoutable_SoItsLicenceCanReachIt()
    {
        _context.Facilities.Add(NewFacility("New Clinic", status: FacilityStatus.Provisioning));
        await _context.SaveChangesAsync();

        Assert.True(Assert.Single(FacilityFeed()).Active);
    }

    [Fact]
    public async Task Suspending_And_SoftDeleting_MarkTheFacilityInactiveInTheDirectory()
    {
        var facility = NewFacility("Downtown Clinic");
        _context.Facilities.Add(facility);
        await _context.SaveChangesAsync();

        facility.Status = FacilityStatus.Suspended;
        await _context.SaveChangesAsync();
        Assert.False(FacilityFeed().Last().Active);

        facility.Status = FacilityStatus.Active;
        await _context.SaveChangesAsync();
        Assert.True(FacilityFeed().Last().Active);

        facility.IsDeleted = true;
        await _context.SaveChangesAsync();
        Assert.False(FacilityFeed().Last().Active);
        Assert.Equal(4, FacilityFeed().Count);
    }

    [Fact]
    public async Task HardDelete_IsSentAsInactive()
    {
        var facility = NewFacility("Downtown Clinic");
        _context.Facilities.Add(facility);
        await _context.SaveChangesAsync();

        _context.Facilities.Remove(facility);
        await _context.SaveChangesAsync();

        Assert.False(FacilityFeed().Last().Active);
    }

    [Fact]
    public async Task VisibilityAndExternalRequestChanges_AreFed()
    {
        var facility = NewFacility("Downtown Clinic");
        _context.Facilities.Add(facility);
        await _context.SaveChangesAsync();

        facility.Visibility = FacilityVisibility.Public;
        facility.AcceptsExternalRequests = true;
        await _context.SaveChangesAsync();

        var latest = FacilityFeed().Last();
        Assert.Equal(FacilityVisibility.Public, latest.Visibility);
        Assert.True(latest.AcceptsExternalRequests);
    }

    [Fact]
    public async Task SavingAFacilityWithoutDirectoryChanges_StagesNothing()
    {
        var facility = NewFacility("Downtown Clinic");
        _context.Facilities.Add(facility);
        await _context.SaveChangesAsync();
        var before = TestSupport.Outbox(_context).Count;

        facility.LicenseToOperate = "LTO-1";
        facility.MaxStaffLimit = 50;
        await _context.SaveChangesAsync();

        Assert.Equal(before, TestSupport.Outbox(_context).Count);
    }

    [Fact]
    public async Task Rename_IsFed()
    {
        var facility = NewFacility("Downtown Clinic");
        _context.Facilities.Add(facility);
        await _context.SaveChangesAsync();

        facility.Name = "Uptown Clinic";
        await _context.SaveChangesAsync();

        Assert.Equal("Uptown Clinic", FacilityFeed().Last().DisplayName);
    }

    [Fact]
    public async Task FacilitiesSharingABranch_AreLinkedActiveInBothDirections()
    {
        var branchId = Guid.NewGuid();
        var clinic = NewFacility("Clinic", FacilityType.Clinic, branchId);
        var lab = NewFacility("Lab", FacilityType.Laboratory, branchId);
        _context.Facilities.Add(clinic);
        await _context.SaveChangesAsync();
        Assert.Empty(TestSupport.Outbox(_context, InteropTypes.DirectoryLinkUpserted));

        _context.Facilities.Add(lab);
        await _context.SaveChangesAsync();

        var links = TestSupport.OutboxPayloads<DirectoryLinkUpsertedPayload>(_context, InteropTypes.DirectoryLinkUpserted);
        Assert.Equal(2, links.Count);
        Assert.All(links, l => Assert.Equal(LinkStatus.Active, l.Status));
        Assert.Contains(links, l => l.SourceFacilityId == clinic.Id.ToString() && l.TargetFacilityId == lab.Id.ToString());
        Assert.Contains(links, l => l.SourceFacilityId == lab.Id.ToString() && l.TargetFacilityId == clinic.Id.ToString());
        Assert.Equal(DirectoryPayloads.LinkId(clinic.Id, lab.Id), links.Single(l => l.SourceFacilityId == clinic.Id.ToString()).LinkId);
    }

    [Fact]
    public async Task TwoNewFacilitiesOfOneBranchInOneSave_AreLinkedOnceEachWay()
    {
        var branchId = Guid.NewGuid();
        _context.Facilities.AddRange(NewFacility("Clinic", FacilityType.Clinic, branchId), NewFacility("Lab", FacilityType.Laboratory, branchId));
        await _context.SaveChangesAsync();

        var links = TestSupport.OutboxPayloads<DirectoryLinkUpsertedPayload>(_context, InteropTypes.DirectoryLinkUpserted);
        Assert.Equal(2, links.Select(l => l.LinkId).Distinct().Count());
    }

    [Fact]
    public async Task MovingToAnotherBranch_ActivatesNewLinksAndRevokesTheOldOnes()
    {
        var oldBranch = Guid.NewGuid();
        var newBranch = Guid.NewGuid();
        var clinic = NewFacility("Clinic", FacilityType.Clinic, oldBranch);
        var lab = NewFacility("Lab", FacilityType.Laboratory, oldBranch);
        var pharmacy = NewFacility("Pharmacy", FacilityType.Pharmacy, newBranch);
        _context.Facilities.AddRange(clinic, lab, pharmacy);
        await _context.SaveChangesAsync();
        var linksBefore = TestSupport.Outbox(_context, InteropTypes.DirectoryLinkUpserted).Count;

        clinic.BranchId = newBranch;
        await _context.SaveChangesAsync();

        var moved = TestSupport.Outbox(_context, InteropTypes.DirectoryLinkUpserted)
            .Skip(linksBefore)
            .Select(e => e.GetPayload<DirectoryLinkUpsertedPayload>())
            .ToList();
        Assert.Equal(2, moved.Count(l => l.Status == LinkStatus.Active));
        Assert.Equal(2, moved.Count(l => l.Status == LinkStatus.Revoked));
        Assert.All(moved.Where(l => l.Status == LinkStatus.Active),
            l => Assert.Contains(pharmacy.Id.ToString(), new[] { l.SourceFacilityId, l.TargetFacilityId }));
        Assert.All(moved.Where(l => l.Status == LinkStatus.Revoked),
            l => Assert.Contains(lab.Id.ToString(), new[] { l.SourceFacilityId, l.TargetFacilityId }));
    }

    [Fact]
    public async Task FacilitiesOfOtherTenantsInTheSameBranchIdAreNeverLinked()
    {
        var branchId = Guid.NewGuid();
        _context.Facilities.Add(NewFacility("Clinic", FacilityType.Clinic, branchId));
        await _context.SaveChangesAsync();

        _context.Facilities.Add(new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = Guid.NewGuid(),
            Name = "Stranger Lab",
            FacilityType = FacilityType.Laboratory,
            Status = FacilityStatus.Active,
            BranchId = branchId
        });
        await _context.SaveChangesAsync();

        Assert.Empty(TestSupport.Outbox(_context, InteropTypes.DirectoryLinkUpserted));
    }

    [Fact]
    public async Task DirectoryMessages_AreShippedBeforeMessagesQueuedByTheSameSave()
    {
        var facility = NewFacility("Downtown Clinic", status: FacilityStatus.Provisioning);
        _context.Facilities.Add(facility);
        new Application.Features.Admin.Services.FacilityProvisioningPublisher(new InteropPublisher(_context))
            .EnqueueLicenseIssued(new FacilityCreatedEvent
            {
                TenantId = _tenantId.ToString(),
                ResourceId = facility.Id,
                FacilityType = facility.FacilityType,
                LicenseToken = "token"
            });
        await _context.SaveChangesAsync();

        var order = TestSupport.Outbox(_context).Select(e => e.Type).ToList();
        Assert.True(order.IndexOf(InteropTypes.DirectoryFacilityUpserted) < order.IndexOf(InteropTypes.FacilityLicenseIssued));
        Assert.True(order.IndexOf(InteropTypes.DirectoryCellUpserted) < order.IndexOf(InteropTypes.DirectoryFacilityUpserted));
    }
}
