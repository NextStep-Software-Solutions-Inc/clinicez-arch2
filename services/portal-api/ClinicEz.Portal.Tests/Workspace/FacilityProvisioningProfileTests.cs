using ClinicEz.Portal.Application.Features.Admin.Services;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using Microsoft.EntityFrameworkCore;
using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Xunit;

namespace ClinicEz.Portal.Tests.Workspace;

public class FacilityProvisioningProfileTests : IDisposable
{
    private const string Slug = "metro-clinic";

    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly IFacilityProvisioningPublisher _publisher;
    private readonly Tenant _tenant;

    public FacilityProvisioningProfileTests()
    {
        _publisher = TestSupport.ProvisioningPublisher(_context);
        _tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = Slug,
            Name = "Metro Clinic",
            OwnerId = "clerk_owner_111",
            Email = "owner@metro.ph"
        };
        _context.Tenants.Add(_tenant);
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private Task StageAsync(Guid facilityId, FacilityType type = FacilityType.Laboratory) =>
        _publisher.StageProvisionedAsync(_tenant, new FacilityCreatedEvent
        {
            TenantId = _tenant.Id.ToString(),
            TenantSlug = Slug,
            ResourceId = facilityId,
            FacilityType = type,
            LicenseToken = "token"
        }, CancellationToken.None);

    [Fact]
    public async Task Provisioning_SendsTheCurrentProfileToTheNewFacility_RightAfterItsLicense()
    {
        _context.WorkspaceSettings.Add(new WorkspaceSettings
        {
            TenantId = _tenant.Id,
            BrandName = "Metro Health",
            ProfileVersion = 3
        });
        var facilityId = Guid.NewGuid();

        await StageAsync(facilityId);
        await _context.SaveChangesAsync();

        var messages = TestSupport.Outbox(_context);
        var types = messages.Select(m => m.Type).ToList();
        Assert.True(types.IndexOf(InteropTypes.FacilityLicenseIssued) < types.IndexOf(InteropTypes.WorkspaceProfileUpdated));

        var message = Assert.Single(TestSupport.Outbox(_context, InteropTypes.WorkspaceProfileUpdated));
        Assert.Equal(Party.Portal, message.From);
        Assert.Equal(PartyKind.Facility, message.To.Kind);
        Assert.Equal(facilityId.ToString(), message.To.FacilityId);
        Assert.Equal(FacilityType.Laboratory, message.To.FacilityType);
        Assert.Equal(_tenant.Id.ToString(), message.To.TenantId);

        var payload = message.GetPayload<WorkspaceProfileUpdatedEvent>();
        Assert.Equal(_tenant.Id.ToString(), payload.TenantId);
        Assert.Equal(3, payload.Version);
        Assert.NotNull(payload.Profile);
        Assert.Equal(3, payload.Profile.Version);
        Assert.Equal(Slug, payload.Profile.TenantSlug);
        Assert.Equal("Metro Health", payload.Profile.DisplayName);
    }

    [Fact]
    public async Task Provisioning_SendsTheSameLicenseToTheBillingServiceOfTheFacility()
    {
        var facilityId = Guid.NewGuid();

        await StageAsync(facilityId);
        await _context.SaveChangesAsync();

        var licenses = TestSupport.Outbox(_context, InteropTypes.FacilityLicenseIssued);
        var own = licenses.Single(m => m.To.Service is null);
        var billing = licenses.Single(m => m.To.Service == InteropServices.Billing);
        Assert.Equal(own.To with { Service = InteropServices.Billing }, billing.To);
        Assert.Equal(own.CorrelationId, billing.CorrelationId);
        Assert.Equal(facilityId, billing.CorrelationId);
        Assert.Equal("token", billing.GetPayload<FacilityCreatedEvent>().LicenseToken);
    }

    [Fact]
    public async Task Provisioning_CreatesDefaultSettings_WhenTheWorkspaceHasNone()
    {
        await StageAsync(Guid.NewGuid());
        await _context.SaveChangesAsync();

        var settings = await _context.WorkspaceSettings.SingleAsync();
        Assert.Equal(1, settings.ProfileVersion);

        var payload = Assert.Single(TestSupport.Outbox(_context, InteropTypes.WorkspaceProfileUpdated))
            .GetPayload<WorkspaceProfileUpdatedEvent>();
        Assert.Equal(1, payload.Version);
        Assert.Equal(1, payload.Profile!.Version);
        Assert.Equal("Metro Clinic", payload.Profile.DisplayName);
    }

    [Fact]
    public async Task Provisioning_SeveralFacilitiesInOneUnitOfWork_ShareOneSettingsRow()
    {
        await StageAsync(Guid.NewGuid(), FacilityType.Pharmacy);
        await StageAsync(Guid.NewGuid(), FacilityType.Organization);
        await _context.SaveChangesAsync();

        Assert.Single(_context.WorkspaceSettings);
        Assert.Equal(2, TestSupport.Outbox(_context, InteropTypes.WorkspaceProfileUpdated).Count);
    }

    [Fact]
    public async Task Provisioning_DefaultsIsPublicToFalse_WhenNewlyProvisioned()
    {
        var facilityId = Guid.NewGuid();
        var facility = new Facility
        {
            Id = facilityId,
            TenantId = _tenant.Id,
            Name = "Draft Clinic",
            Slug = "draft-clinic",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Provisioning,
            IsPatientDiscoveryEligible = false
        };
        _context.Facilities.Add(facility);

        await StageAsync(facilityId, FacilityType.Clinic);
        await _context.SaveChangesAsync();

        var directoryMessages = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated);
        Assert.Equal(2, directoryMessages.Count);
        Assert.Contains(directoryMessages, m => m.To.Kind == PartyKind.ControlPlane && m.To.Service == InteropServices.Patient);
        Assert.Contains(directoryMessages, m => m.To.Kind == PartyKind.Facility && m.To.FacilityId == facilityId.ToString());
        var directoryEvent = directoryMessages.First(m => m.To.Service == InteropServices.Patient).GetPayload<FacilityCreatedEvent>();
        Assert.False(directoryEvent.IsPublic ?? true, "Newly provisioned facility MUST default to IsPublic = false (Draft/Private).");
        Assert.False(directoryEvent.IsWorkspaceEligible ?? true);
    }

    [Fact]
    public async Task Provisioning_EmitsIsPublicFalse_WhenEligibleButUnverified()
    {
        var facilityId = Guid.NewGuid();
        var facility = new Facility
        {
            Id = facilityId,
            TenantId = _tenant.Id,
            Name = "Eligible Unverified Clinic",
            Slug = "eligible-unverified-clinic",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active,
            IsPatientDiscoveryEligible = true,
            PlatformVerificationStatus = PlatformVerificationStatus.Unverified
        };
        _context.Facilities.Add(facility);

        await StageAsync(facilityId, FacilityType.Clinic);
        await _context.SaveChangesAsync();

        var directoryMessages = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated);
        Assert.Equal(2, directoryMessages.Count);
        var directoryEvent = directoryMessages.First(m => m.To.Service == InteropServices.Patient).GetPayload<FacilityCreatedEvent>();
        Assert.False(directoryEvent.IsPublic ?? true, "Facility with IsPatientDiscoveryEligible = true MUST remain IsPublic = false until PlatformVerificationStatus == Verified.");
        Assert.True(directoryEvent.IsWorkspaceEligible);
        Assert.False(directoryEvent.IsPlatformVerified ?? true);
        Assert.Equal(PlatformVerificationStatus.Unverified, directoryEvent.PlatformVerificationStatus);
        Assert.Equal(DirectorySourceKind.PortalControlPlane, directoryEvent.DirectorySource);
        Assert.False(directoryEvent.ReplaceProvidersSnapshot);
    }

    [Fact]
    public async Task Provisioning_SetsIsPublicToTrue_WhenFacilityIsEligibleAndPlatformVerified_WithoutReadingStaffMembers()
    {
        var facilityId = Guid.NewGuid();
        var facility = new Facility
        {
            Id = facilityId,
            TenantId = _tenant.Id,
            Name = "Eligible Verified Clinic",
            Slug = "eligible-verified-clinic",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active,
            IsPatientDiscoveryEligible = true,
            PlatformVerificationStatus = PlatformVerificationStatus.Verified
        };
        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            Email = "doc@metro.ph",
            FullName = "Dr. Workspace Staff",
            Status = MemberStatus.Active
        };
        var staff = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            WorkspaceMemberId = member.Id,
            FacilityId = facilityId,
            Role = "Doctor"
        };
        _context.Facilities.Add(facility);
        _context.WorkspaceMembers.Add(member);
        _context.StaffMembers.Add(staff);

        await StageAsync(facilityId, FacilityType.Clinic);
        await _context.SaveChangesAsync();

        var directoryMessages = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated);
        Assert.Equal(2, directoryMessages.Count);
        Assert.Contains(directoryMessages, m => m.To.Kind == PartyKind.ControlPlane && m.To.Service == InteropServices.Patient);
        Assert.Contains(directoryMessages, m => m.To.Kind == PartyKind.Facility && m.To.FacilityId == facilityId.ToString());
        var directoryEvent = directoryMessages.First(m => m.To.Service == InteropServices.Patient).GetPayload<FacilityCreatedEvent>();
        Assert.True(directoryEvent.IsPublic, "Facility with IsPatientDiscoveryEligible = true and PlatformVerificationStatus = Verified MUST have IsPublic = true.");
        Assert.True(directoryEvent.IsWorkspaceEligible);
        Assert.True(directoryEvent.IsPlatformVerified);
        Assert.Equal(PlatformVerificationStatus.Verified, directoryEvent.PlatformVerificationStatus);
        Assert.Equal(DirectorySourceKind.PortalControlPlane, directoryEvent.DirectorySource);
        Assert.False(directoryEvent.ReplaceProvidersSnapshot);
        Assert.Null(directoryEvent.Providers);
    }

    [Fact]
    public async Task StageProvisionedAsync_PreservesEligibilityAndVerificationOnLicenseEvents_WhenCallerOmitsThem()
    {
        var facilityId = Guid.NewGuid();
        var facility = new Facility
        {
            Id = facilityId,
            TenantId = _tenant.Id,
            Name = "Reconciled Verified Clinic",
            Slug = "reconciled-verified-clinic",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active,
            IsPatientDiscoveryEligible = true,
            PlatformVerificationStatus = PlatformVerificationStatus.Verified
        };
        _context.Facilities.Add(facility);
        await _context.SaveChangesAsync();

        // Simulate ActivateFacility / FacilityProvisioningReconciliationJob passing minimal event with nulls
        await _publisher.StageProvisionedAsync(_tenant, new FacilityCreatedEvent
        {
            TenantId = _tenant.Id.ToString(),
            TenantSlug = Slug,
            FacilityType = FacilityType.Clinic,
            ResourceId = facilityId,
            Name = facility.Name,
            Slug = facility.Slug,
            LicenseToken = "reissued-token"
        }, CancellationToken.None);
        await _context.SaveChangesAsync();

        var licenseMessages = TestSupport.Outbox(_context, InteropTypes.FacilityLicenseIssued);
        Assert.Equal(3, licenseMessages.Count);
        Assert.All(licenseMessages, msg =>
        {
            var p = msg.GetPayload<FacilityCreatedEvent>();
            Assert.True(p.IsWorkspaceEligible);
            Assert.True(p.IsPlatformVerified);
            Assert.Equal(PlatformVerificationStatus.Verified, p.PlatformVerificationStatus);
        });
    }
}

