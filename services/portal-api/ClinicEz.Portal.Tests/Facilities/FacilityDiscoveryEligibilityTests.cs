using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.Portal.Tests.Facilities;

public class FacilityDiscoveryEligibilityTests : IDisposable
{
    private readonly ApplicationDbContext _context;
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _facilityId = Guid.NewGuid();
    private const string TenantSlug = "metro-health";

    public FacilityDiscoveryEligibilityTests()
    {
        _context = TestSupport.NewContext();

        var tenant = new Tenant
        {
            Id = _tenantId,
            TenantSlug = TenantSlug,
            Name = "Metro Health",
            OwnerId = "owner_metro"
        };
        _context.Tenants.Add(tenant);

        var facility = new Facility
        {
            Id = _facilityId,
            TenantId = _tenantId,
            Name = "Metro Clinic North",
            Slug = "metro-clinic-north",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active,
            IsPatientDiscoveryEligible = false
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
    public async Task SetDiscoveryEligibility_Enable_UpdatesFacilityAndStagesDirectoryUpdate()
    {
        var publisher = TestSupport.ProvisioningPublisher(_context);
        var handler = new SetFacilityDiscoveryEligibilityCommandHandler(_context, publisher);
        var command = new SetFacilityDiscoveryEligibilityCommand(_facilityId, TenantSlug, true);

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.True(result.IsEligible);
        var facilityInDb = await _context.Facilities.FindAsync(_facilityId);
        Assert.NotNull(facilityInDb);
        Assert.True(facilityInDb.IsPatientDiscoveryEligible);

        // Verify outbox message
        var outboxMessages = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated);
        Assert.Single(outboxMessages);
        var payload = outboxMessages[0].GetPayload<FacilityCreatedEvent>();
        Assert.True(payload.IsPublic);
    }

    [Fact]
    public async Task SetDiscoveryEligibility_Disable_UpdatesFacilityAndStagesDirectoryUpdate()
    {
        var facilityInDb = await _context.Facilities.FindAsync(_facilityId);
        facilityInDb!.IsPatientDiscoveryEligible = true;
        await _context.SaveChangesAsync();

        var publisher = TestSupport.ProvisioningPublisher(_context);
        var handler = new SetFacilityDiscoveryEligibilityCommandHandler(_context, publisher);
        var command = new SetFacilityDiscoveryEligibilityCommand(_facilityId, TenantSlug, false);

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.False(result.IsEligible);
        var updated = await _context.Facilities.FindAsync(_facilityId);
        Assert.False(updated!.IsPatientDiscoveryEligible);

        var outboxMessages = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated);
        var payload = outboxMessages.Last().GetPayload<FacilityCreatedEvent>();
        Assert.False(payload.IsPublic);
    }

    [Fact]
    public async Task SetDiscoveryEligibility_NonExistentFacility_ThrowsKeyNotFoundException()
    {
        var publisher = TestSupport.ProvisioningPublisher(_context);
        var handler = new SetFacilityDiscoveryEligibilityCommandHandler(_context, publisher);
        var command = new SetFacilityDiscoveryEligibilityCommand(Guid.NewGuid(), TenantSlug, true);

        await Assert.ThrowsAsync<KeyNotFoundException>(() => handler.Handle(command, CancellationToken.None));
    }
}
