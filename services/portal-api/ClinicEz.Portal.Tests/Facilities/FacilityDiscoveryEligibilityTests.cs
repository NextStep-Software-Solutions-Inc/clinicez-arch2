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

        // Verify dual outbox dispatch
        var outboxMessages = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated);
        Assert.Equal(2, outboxMessages.Count);

        var patientMsg = outboxMessages.Single(m => m.To.Kind == PartyKind.ControlPlane && m.To.Service == InteropServices.Patient);
        var patientPayload = patientMsg.GetPayload<FacilityCreatedEvent>();
        Assert.True(patientPayload.IsPublic);
        Assert.True(patientPayload.IsWorkspaceEligible);

        var facilityMsg = outboxMessages.Single(m => m.To.Kind == PartyKind.Facility && m.To.FacilityId == _facilityId.ToString());
        Assert.Equal(_tenantId.ToString(), facilityMsg.To.TenantId);
        Assert.Equal(FacilityType.Clinic, facilityMsg.To.FacilityType);
        var facilityPayload = facilityMsg.GetPayload<FacilityCreatedEvent>();
        Assert.True(facilityPayload.IsPublic);
        Assert.True(facilityPayload.IsWorkspaceEligible);
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

        // Verify dual outbox dispatch on disable
        var outboxMessages = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated);
        Assert.Equal(2, outboxMessages.Count);

        var patientMsg = outboxMessages.Single(m => m.To.Kind == PartyKind.ControlPlane && m.To.Service == InteropServices.Patient);
        var patientPayload = patientMsg.GetPayload<FacilityCreatedEvent>();
        Assert.False(patientPayload.IsPublic);
        Assert.False(patientPayload.IsWorkspaceEligible ?? true);

        var facilityMsg = outboxMessages.Single(m => m.To.Kind == PartyKind.Facility && m.To.FacilityId == _facilityId.ToString());
        var facilityPayload = facilityMsg.GetPayload<FacilityCreatedEvent>();
        Assert.False(facilityPayload.IsPublic);
        Assert.False(facilityPayload.IsWorkspaceEligible ?? true);
    }

    [Fact]
    public async Task SetDiscoveryEligibility_NonExistentFacility_ThrowsKeyNotFoundException()
    {
        var publisher = TestSupport.ProvisioningPublisher(_context);
        var handler = new SetFacilityDiscoveryEligibilityCommandHandler(_context, publisher);
        var command = new SetFacilityDiscoveryEligibilityCommand(Guid.NewGuid(), TenantSlug, true);

        await Assert.ThrowsAsync<KeyNotFoundException>(() => handler.Handle(command, CancellationToken.None));
    }

    [Fact]
    public async Task SetDiscoveryEligibility_NonClinicFacility_DispatchesOnlyToPatientControlPlane()
    {
        var labId = Guid.NewGuid();
        _context.Facilities.Add(new Facility
        {
            Id = labId,
            TenantId = _tenantId,
            Name = "Metro Reference Lab",
            Slug = "metro-ref-lab",
            FacilityType = FacilityType.Laboratory,
            Status = FacilityStatus.Active,
            IsPatientDiscoveryEligible = false
        });
        await _context.SaveChangesAsync();

        var publisher = TestSupport.ProvisioningPublisher(_context);
        var handler = new SetFacilityDiscoveryEligibilityCommandHandler(_context, publisher);

        var result = await handler.Handle(new SetFacilityDiscoveryEligibilityCommand(labId, TenantSlug, true), CancellationToken.None);

        Assert.True(result.IsEligible);
        var outboxMessages = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated)
            .Where(m => m.CorrelationId == labId)
            .ToList();

        var onlyPatientMsg = Assert.Single(outboxMessages);
        Assert.Equal(PartyKind.ControlPlane, onlyPatientMsg.To.Kind);
        Assert.Equal(InteropServices.Patient, onlyPatientMsg.To.Service);
        Assert.True(onlyPatientMsg.GetPayload<FacilityCreatedEvent>().IsWorkspaceEligible);
    }
}
