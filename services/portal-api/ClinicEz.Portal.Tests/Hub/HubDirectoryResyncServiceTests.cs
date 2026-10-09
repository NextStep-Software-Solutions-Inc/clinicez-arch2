using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Hub;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Xunit;

namespace ClinicEz.Portal.Tests.Hub;

public class HubDirectoryResyncServiceTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly Tenant _cloudTenant = new() { Id = Guid.NewGuid(), TenantSlug = "cloud-co", Name = "Cloud Co", OwnerId = "o1", Email = "a@cloud.ph" };
    private readonly Tenant _edgeTenant = new() { Id = Guid.NewGuid(), TenantSlug = "edge-co", Name = "Edge Co", OwnerId = "o2", Email = "a@edge.ph" };

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private HubDirectoryResyncService Service() =>
        new(_context, new SameBranchFacilityLinkService(), Options.Create(new HubOptions()));

    private Facility Add(Tenant tenant, string name, FacilityType type, Guid? branchId = null,
        FacilityDeploymentMode mode = FacilityDeploymentMode.SharedCloud, bool deleted = false)
    {
        var facility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            Name = name,
            FacilityType = type,
            Status = FacilityStatus.Active,
            BranchId = branchId,
            DeploymentMode = mode,
            IsDeleted = deleted
        };
        _context.Facilities.Add(facility);
        return facility;
    }

    private async Task SeedAsync()
    {
        _context.Tenants.AddRange(_cloudTenant, _edgeTenant);
        var branch = Guid.NewGuid();
        Add(_cloudTenant, "Clinic", FacilityType.Clinic, branch);
        Add(_cloudTenant, "Lab", FacilityType.Laboratory, branch);
        Add(_cloudTenant, "Gone", FacilityType.Pharmacy, deleted: true);
        Add(_edgeTenant, "Site", FacilityType.Clinic, mode: FacilityDeploymentMode.OnPremise);
        await _context.SaveChangesAsync();
    }

    [Fact]
    public async Task Resync_QueuesEveryCellFacilityAndLink_IncludingInactiveOnes()
    {
        await SeedAsync();
        _context.InteropOutbox.RemoveRange(_context.InteropOutbox);
        await _context.SaveChangesAsync();

        var result = await Service().ResyncAsync(CancellationToken.None);

        Assert.Equal(new HubResyncResult(Cells: 2, Facilities: 4, Links: 2), result);

        var facilities = TestSupport.OutboxPayloads<DirectoryFacilityUpsertedPayload>(_context, InteropTypes.DirectoryFacilityUpserted);
        Assert.Equal(4, facilities.Count);
        Assert.Single(facilities, f => !f.Active);

        var cells = TestSupport.OutboxPayloads<DirectoryCellUpsertedPayload>(_context, InteropTypes.DirectoryCellUpserted);
        Assert.Contains(cells, c => c.CellId == "cloud" && c.Kind == CellKind.Cloud);
        Assert.Contains(cells, c => c.CellId == $"edge-{_edgeTenant.Id}" && c.Kind == CellKind.Edge);

        Assert.Equal(2, TestSupport.OutboxPayloads<DirectoryLinkUpsertedPayload>(_context, InteropTypes.DirectoryLinkUpserted).Count);
    }

    [Fact]
    public async Task Resync_ShipsCellsBeforeFacilitiesAndFacilitiesBeforeLinks()
    {
        await SeedAsync();
        _context.InteropOutbox.RemoveRange(_context.InteropOutbox);
        await _context.SaveChangesAsync();

        await Service().ResyncAsync(CancellationToken.None);

        var order = TestSupport.Outbox(_context).Select(e => e.Type).ToList();
        Assert.True(order.LastIndexOf(InteropTypes.DirectoryCellUpserted) < order.IndexOf(InteropTypes.DirectoryFacilityUpserted));
        Assert.True(order.LastIndexOf(InteropTypes.DirectoryFacilityUpserted) < order.IndexOf(InteropTypes.DirectoryLinkUpserted));
    }

    [Fact]
    public async Task Resync_IsIdempotent_SameMessageIdentitiesEveryRun()
    {
        await SeedAsync();

        await Service().ResyncAsync(CancellationToken.None);
        var first = TestSupport.Outbox(_context, InteropTypes.DirectoryLinkUpserted)
            .Select(e => e.GetPayload<DirectoryLinkUpsertedPayload>().LinkId).ToHashSet();
        var firstFacilities = TestSupport.OutboxPayloads<DirectoryFacilityUpsertedPayload>(_context, InteropTypes.DirectoryFacilityUpserted)
            .Select(f => f.FacilityId).ToHashSet();

        var again = await Service().ResyncAsync(CancellationToken.None);

        Assert.Equal(new HubResyncResult(2, 4, 2), again);
        var all = TestSupport.Outbox(_context, InteropTypes.DirectoryLinkUpserted)
            .Select(e => e.GetPayload<DirectoryLinkUpsertedPayload>().LinkId).ToList();
        Assert.Equal(first, all.ToHashSet());
        Assert.Equal(firstFacilities, TestSupport.OutboxPayloads<DirectoryFacilityUpsertedPayload>(_context, InteropTypes.DirectoryFacilityUpserted)
            .Select(f => f.FacilityId).ToHashSet());
    }

    [Fact]
    public async Task Resync_DoesNotModifyFacilities()
    {
        await SeedAsync();
        var before = await _context.Facilities.IgnoreQueryFilters().AsNoTracking().OrderBy(f => f.Id).Select(f => new { f.Id, f.Name, f.CellId, f.Status }).ToListAsync();

        await Service().ResyncAsync(CancellationToken.None);

        var after = await _context.Facilities.IgnoreQueryFilters().AsNoTracking().OrderBy(f => f.Id).Select(f => new { f.Id, f.Name, f.CellId, f.Status }).ToListAsync();
        Assert.Equal(before, after);
    }

    [Fact]
    public async Task Resync_WithNoFacilities_StillAnnouncesTheCloudCell()
    {
        var result = await Service().ResyncAsync(CancellationToken.None);

        Assert.Equal(new HubResyncResult(1, 0, 0), result);
        Assert.Single(TestSupport.Outbox(_context, InteropTypes.DirectoryCellUpserted));
    }
}
