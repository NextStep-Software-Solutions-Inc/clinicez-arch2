using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using Microsoft.EntityFrameworkCore;
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
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _context = new ApplicationDbContext(options);

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
        var handler = new UpdateFacilityCommandHandler(_context);
        var command = new UpdateFacilityCommand(_facilityId, TenantSlug, "Metro Care BGC", FacilityStatus.Suspended);

        var success = await handler.Handle(command, CancellationToken.None);

        Assert.True(success);

        var facilityInDb = await _context.Facilities.FindAsync(_facilityId);
        Assert.NotNull(facilityInDb);
        Assert.Equal("Metro Care BGC", facilityInDb.Name);
        Assert.Equal(FacilityStatus.Suspended, facilityInDb.Status);
    }

    [Fact]
    public async Task DeleteFacility_ValidRequest_RemovesFacilityAndDecrementsCount()
    {
        var handler = new DeleteFacilityCommandHandler(_context);
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
