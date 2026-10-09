using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Licensing;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.Portal.Tests.Licensing;

public class FacilityAllocationServiceTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly FacilityAllocationService _service;
    private readonly DateTime _start = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    public FacilityAllocationServiceTests()
    {
        _context.Tenants.Add(new Tenant { Id = _tenantId, TenantSlug = "metro", Name = "Metro", OwnerId = "owner", Email = "o@metro.ph" });
        _context.SaveChanges();
        _service = new FacilityAllocationService(_context);
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private async Task<EntitlementSnapshot> SnapshotAsync(string plan)
    {
        await TestSupport.SeedSubscriptionAsync(_context, _tenantId, SubscriptionStatus.Active, plan);
        return await TestSupport.Entitlements(_context).ResolveAsync(_tenantId, CancellationToken.None);
    }

    private async Task<List<Facility>> AddFacilitiesAsync(int count)
    {
        var facilities = Enumerable.Range(0, count)
            .Select(i => new Facility
            {
                Id = Guid.NewGuid(),
                TenantId = _tenantId,
                Name = $"Site {i}",
                FacilityType = FacilityType.Clinic,
                CreatedAt = _start.AddMinutes(i)
            })
            .ToList();
        _context.Facilities.AddRange(facilities);
        await _context.SaveChangesAsync();
        return facilities;
    }

    [Fact]
    public async Task Shares_SplitEachPoolEquallyAndAlwaysAddUpToThePool_RemaindersToTheOldest()
    {
        var snapshot = await SnapshotAsync("starter");
        var facilities = await AddFacilitiesAsync(3);

        var shares = await _service.ComputeSharesAsync(_tenantId, snapshot, null, CancellationToken.None);

        Assert.Equal([4, 3, 3], facilities.Select(f => shares[f.Id].MaxStaff));
        Assert.Equal(10, shares.Values.Sum(s => s.MaxStaff));
        Assert.Equal(2 * 1024, shares.Values.Sum(s => s.MaxStorageMb));
        Assert.Equal(3, shares.Values.Sum(s => s.ConcurrentTerminals));
    }

    [Fact]
    public async Task Shares_ExplicitAllocationsWin_AndTheRestIsSplitAmongTheOthers()
    {
        var snapshot = await SnapshotAsync("starter");
        var facilities = await AddFacilitiesAsync(3);
        await _service.SetAllocationAsync(_tenantId, facilities[0].Id, snapshot, 6, null, null, CancellationToken.None);
        await _context.SaveChangesAsync();

        var shares = await _service.ComputeSharesAsync(_tenantId, snapshot, null, CancellationToken.None);

        Assert.Equal(6, shares[facilities[0].Id].MaxStaff);
        Assert.Equal(2, shares[facilities[1].Id].MaxStaff);
        Assert.Equal(2, shares[facilities[2].Id].MaxStaff);
    }

    [Fact]
    public async Task Shares_IncludeAFacilityThatIsBeingCreatedAndNotSavedYet()
    {
        var snapshot = await SnapshotAsync("starter");
        var existing = await AddFacilitiesAsync(1);
        var incoming = Guid.NewGuid();

        var shares = await _service.ComputeSharesAsync(_tenantId, snapshot, incoming, CancellationToken.None);

        Assert.Equal(5, shares[existing[0].Id].MaxStaff);
        Assert.Equal(5, shares[incoming].MaxStaff);
    }

    [Fact]
    public async Task Shares_FailedFacilitiesDoNotTakeAShare()
    {
        var snapshot = await SnapshotAsync("starter");
        var facilities = await AddFacilitiesAsync(2);
        facilities[1].Status = FacilityStatus.Failed;
        await _context.SaveChangesAsync();

        var shares = await _service.ComputeSharesAsync(_tenantId, snapshot, null, CancellationToken.None);

        Assert.Equal(10, shares[facilities[0].Id].MaxStaff);
        Assert.DoesNotContain(facilities[1].Id, shares.Keys);
    }

    [Fact]
    public async Task Shares_OfAnExpiredWorkspace_AreZero()
    {
        await TestSupport.SeedSubscriptionAsync(_context, _tenantId, SubscriptionStatus.Trialing, "pro", trialEndsAt: DateTime.UtcNow.AddDays(-1));
        var snapshot = await TestSupport.Entitlements(_context).ResolveAsync(_tenantId, CancellationToken.None);
        var facilities = await AddFacilitiesAsync(2);

        var shares = await _service.ComputeSharesAsync(_tenantId, snapshot, null, CancellationToken.None);

        Assert.All(facilities, f => Assert.Equal(new FacilityShare(0, 0, 0), shares[f.Id]));
    }

    [Fact]
    public async Task SetAllocation_ExactlyTheWholePool_IsAccepted()
    {
        var snapshot = await SnapshotAsync("starter");
        var facilities = await AddFacilitiesAsync(2);

        await _service.SetAllocationAsync(_tenantId, facilities[0].Id, snapshot, 4, 1024, 1, CancellationToken.None);
        await _context.SaveChangesAsync();
        await _service.SetAllocationAsync(_tenantId, facilities[1].Id, snapshot, 6, 1024, 2, CancellationToken.None);
        await _context.SaveChangesAsync();

        Assert.Equal(2, await _context.FacilityAllocations.CountAsync());
    }

    [Fact]
    public async Task SetAllocation_SumAbovePool_IsRefusedWithAllocationExceedsPool_AndStoresNothing()
    {
        var snapshot = await SnapshotAsync("starter");
        var facilities = await AddFacilitiesAsync(2);
        await _service.SetAllocationAsync(_tenantId, facilities[0].Id, snapshot, 6, null, null, CancellationToken.None);
        await _context.SaveChangesAsync();

        var ex = await Assert.ThrowsAsync<EntitlementException>(
            () => _service.SetAllocationAsync(_tenantId, facilities[1].Id, snapshot, 5, null, null, CancellationToken.None));

        Assert.Equal(FacilityAllocationService.ExceedsPoolCode, ex.Code);
        Assert.Single(_context.FacilityAllocations);
    }

    [Theory]
    [InlineData(11, 0, 0)]
    [InlineData(0, 2049, 0)]
    [InlineData(0, 0, 4)]
    public async Task SetAllocation_ExceedingAnySinglePool_IsRefused(int staff, int storageMb, int terminals)
    {
        var snapshot = await SnapshotAsync("starter");
        var facility = (await AddFacilitiesAsync(1))[0];

        var ex = await Assert.ThrowsAsync<EntitlementException>(
            () => _service.SetAllocationAsync(_tenantId, facility.Id, snapshot, staff, storageMb, terminals, CancellationToken.None));

        Assert.Equal(FacilityAllocationService.ExceedsPoolCode, ex.Code);
    }

    [Fact]
    public async Task SetAllocation_NegativeValues_AreRefused()
    {
        var snapshot = await SnapshotAsync("starter");
        var facility = (await AddFacilitiesAsync(1))[0];

        var ex = await Assert.ThrowsAsync<EntitlementException>(
            () => _service.SetAllocationAsync(_tenantId, facility.Id, snapshot, -1, null, null, CancellationToken.None));

        Assert.Equal(FacilityAllocationService.ExceedsPoolCode, ex.Code);
    }

    [Fact]
    public async Task SetAllocation_ForAFacilityOfAnotherWorkspace_IsRejected()
    {
        var snapshot = await SnapshotAsync("starter");
        var foreign = new Facility { Id = Guid.NewGuid(), TenantId = Guid.NewGuid(), Name = "Other", FacilityType = FacilityType.Clinic };
        _context.Facilities.Add(foreign);
        await _context.SaveChangesAsync();

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _service.SetAllocationAsync(_tenantId, foreign.Id, snapshot, 1, null, null, CancellationToken.None));
    }

    [Fact]
    public async Task SetAllocation_NullsRestoreAutomaticSharing_AndReplaceTheEarlierValue()
    {
        var snapshot = await SnapshotAsync("starter");
        var facilities = await AddFacilitiesAsync(2);
        await _service.SetAllocationAsync(_tenantId, facilities[0].Id, snapshot, 8, null, null, CancellationToken.None);
        await _context.SaveChangesAsync();

        await _service.SetAllocationAsync(_tenantId, facilities[0].Id, snapshot, null, null, null, CancellationToken.None);
        await _context.SaveChangesAsync();

        var shares = await _service.ComputeSharesAsync(_tenantId, snapshot, null, CancellationToken.None);
        Assert.Equal(5, shares[facilities[0].Id].MaxStaff);
        Assert.Single(_context.FacilityAllocations);
    }
}
