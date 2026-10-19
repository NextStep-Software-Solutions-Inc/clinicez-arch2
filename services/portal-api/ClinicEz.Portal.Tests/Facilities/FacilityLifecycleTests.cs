using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using Microsoft.EntityFrameworkCore;
using Moq;
using System;
using System.Threading;
using System.Threading.Tasks;
using Xunit;

namespace ClinicEz.Portal.Tests.Facilities;

public class FacilityLifecycleTests : IDisposable
{
    private readonly ApplicationDbContext _context;
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _facilityId = Guid.NewGuid();
    private const string TenantSlug = "metro-care";

    public FacilityLifecycleTests()
    {
        _context = TestSupport.NewContext();

        var tenant = new Tenant
        {
            Id = _tenantId,
            TenantSlug = TenantSlug,
            Name = "Metro Care",
            OwnerId = "owner_care",
            FacilitiesCount = 1
        };
        _context.Tenants.Add(tenant);

        var facility = new Facility
        {
            Id = _facilityId,
            TenantId = _tenantId,
            Name = "Metro Care Makati",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active
        };
        _context.Facilities.Add(facility);

        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    [Fact]
    public async Task UpdateFacility_ValidRequest_UpdatesNameAndStatus()
    {
        var handler = new UpdateFacilityCommandHandler(_context, new Mock<IHubOnboardingService>().Object);
        var command = new UpdateFacilityCommand(_facilityId, TenantSlug, "Metro Care BGC", FacilityStatus.Suspended);

        var success = await handler.Handle(command, CancellationToken.None);

        Assert.True(success);

        var facilityInDb = await _context.Facilities.FindAsync(_facilityId);
        Assert.NotNull(facilityInDb);
        Assert.Equal("Metro Care BGC", facilityInDb.Name);
        Assert.Equal(FacilityStatus.Suspended, facilityInDb.Status);
    }

    [Fact]
    public async Task UpdateFacility_DuplicateNameInSameTenant_ThrowsInvalidOperationException()
    {
        // Add a second facility in the same tenant
        var secondFacilityId = Guid.NewGuid();
        _context.Facilities.Add(new Facility
        {
            Id = secondFacilityId,
            TenantId = _tenantId,
            Name = "Metro Care Alabang",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active
        });
        await _context.SaveChangesAsync();

        var handler = new UpdateFacilityCommandHandler(_context, new Mock<IHubOnboardingService>().Object);
        // Try renaming second facility to first facility's name (case-insensitive)
        var command = new UpdateFacilityCommand(secondFacilityId, TenantSlug, "metro care makati");

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(command, CancellationToken.None));

        Assert.Contains("already exists", ex.Message);
    }

    [Fact]
    public async Task UpdateFacility_SameFacilitySameName_Succeeds()
    {
        var handler = new UpdateFacilityCommandHandler(_context, new Mock<IHubOnboardingService>().Object);
        var command = new UpdateFacilityCommand(_facilityId, TenantSlug, "Metro Care Makati");

        var success = await handler.Handle(command, CancellationToken.None);

        Assert.True(success);
    }

    [Fact]
    public async Task CreateFacility_DuplicateNameInSameTenant_ThrowsInvalidOperationException()
    {
        var mockGuard = new Mock<IEntitlementGuard>();

        var handler = TestSupport.CreateFacilityHandler(_context, mockGuard.Object);
        // Try creating facility with exact existing name
        var command = new CreateFacilityCommand(TenantSlug, FacilityType.Laboratory, "Metro Care Makati");

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(command, CancellationToken.None));

        Assert.Contains("already exists in this workspace", ex.Message);
    }

    [Fact]
    public async Task CreateFacility_DuplicateNameCaseInsensitive_ThrowsInvalidOperationException()
    {
        var mockGuard = new Mock<IEntitlementGuard>();

        var handler = TestSupport.CreateFacilityHandler(_context, mockGuard.Object);
        // Try creating facility with different casing and leading/trailing spaces
        var command = new CreateFacilityCommand(TenantSlug, FacilityType.Pharmacy, "   metro care makati   ");

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(command, CancellationToken.None));

        Assert.Contains("already exists in this workspace", ex.Message);
    }

    [Fact]
    public async Task CreateFacility_SameNameInDifferentTenant_Succeeds()
    {
        var otherTenantId = Guid.NewGuid();
        _context.Tenants.Add(new Tenant
        {
            Id = otherTenantId,
            TenantSlug = "other-tenant",
            Name = "Other Tenant",
            OwnerId = "other_owner"
        });
        await _context.SaveChangesAsync();

        var mockGuard = new Mock<IEntitlementGuard>();

        var handler = TestSupport.CreateFacilityHandler(_context, mockGuard.Object);
        // Create facility with "Metro Care Makati" in other-tenant
        var command = new CreateFacilityCommand("other-tenant", FacilityType.Clinic, "Metro Care Makati");

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.True(result.Success);
    }

    [Fact]
    public async Task DeleteFacility_ValidRequest_RemovesFacilityAndDecrementsCount()
    {
        var handler = new DeleteFacilityCommandHandler(_context, new Mock<IHubOnboardingService>().Object);
        var command = new DeleteFacilityCommand(_facilityId, TenantSlug);

        var success = await handler.Handle(command, CancellationToken.None);

        Assert.True(success);

        var facilityInDb = await _context.Facilities.FindAsync(_facilityId);
        Assert.Null(facilityInDb);

        var tenantInDb = await _context.Tenants.FindAsync(_tenantId);
        Assert.NotNull(tenantInDb);
        Assert.Equal(0, tenantInDb.FacilitiesCount);
    }
}
