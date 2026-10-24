using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Application.Features.Admin.Consumers;
using ClinicEz.Portal.Application.Features.Admin.Queries;
using ClinicEz.Portal.Application.Features.Integrations;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Xunit;

namespace ClinicEz.Portal.Tests.Facilities;

public class FacilityConsoleTests : IDisposable
{
    private readonly ApplicationDbContext _context;
    private readonly Guid _tenantId = Guid.NewGuid();
    private const string TenantSlug = "metro-health";

    public FacilityConsoleTests()
    {
        _context = TestSupport.NewContext();

        _context.Tenants.Add(new Tenant
        {
            Id = _tenantId,
            TenantSlug = TenantSlug,
            Name = "Metro Health System",
            OwnerId = "owner_123",
            Email = "admin@metrohealth.ph"
        });
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    [Fact]
    public async Task GetFacilities_InDevelopment_ResolvesTenantSubdomainDevConsoleUrl()
    {
        var facility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Name = "Downtown Family Clinic",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active,
            CreatedAt = DateTime.UtcNow
        };
        _context.Facilities.Add(facility);
        await _context.SaveChangesAsync();

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                { "ASPNETCORE_ENVIRONMENT", "Development" },
                { "Facility:BaseDomain", "custom-dev.example.net" }
            })
            .Build();

        var handler = new GetFacilitiesQueryHandler(_context, config);
        var result = await handler.Handle(new GetFacilitiesQuery(TenantSlug), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Single(result);
        var dto = result[0];
        Assert.Equal("downtown-family-clinic", dto.Slug);
        Assert.Equal($"https://{dto.Slug}.clinic.custom-dev.example.net", dto.ConsoleUrl);
    }



    [Fact]
    public async Task GetFacilities_InProduction_ResolvesAppSubdomainConsoleUrl()
    {
        var facility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Name = "Metro St. Jude Diagnostic Lab",
            FacilityType = FacilityType.Laboratory,
            Status = FacilityStatus.Active,
            CreatedAt = DateTime.UtcNow
        };
        _context.Facilities.Add(facility);
        await _context.SaveChangesAsync();

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                { "ASPNETCORE_ENVIRONMENT", "Production" },
                { "Facility:BaseDomain", "enterprise-group.org" }
            })
            .Build();

        var handler = new GetFacilitiesQueryHandler(_context, config);
        var result = await handler.Handle(new GetFacilitiesQuery(TenantSlug), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Single(result);
        var dto = result[0];
        Assert.Equal("metro-st-jude-diagnostic-lab", dto.Slug);
        Assert.Equal($"https://{dto.Slug}.lab.enterprise-group.org", dto.ConsoleUrl);
    }

    [Fact]
    public async Task GetFacilities_WhenNoBaseDomainConfigured_ReturnsNullConsoleUrl()
    {
        var facility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Name = "Downtown Family Clinic",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active,
            CreatedAt = DateTime.UtcNow
        };
        _context.Facilities.Add(facility);
        await _context.SaveChangesAsync();

        var config = new ConfigurationBuilder().Build();

        var handler = new GetFacilitiesQueryHandler(_context, config);
        var result = await handler.Handle(new GetFacilitiesQuery(TenantSlug), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Single(result);
        Assert.Null(result[0].ConsoleUrl);
    }

    [Fact]
    public async Task GetFacilities_WhenProvisioning_ConsoleUrlIsNull()
    {
        var facility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Name = "Pending Diagnostic Lab",
            FacilityType = FacilityType.Laboratory,
            Status = FacilityStatus.Provisioning,
            CreatedAt = DateTime.UtcNow
        };
        _context.Facilities.Add(facility);
        await _context.SaveChangesAsync();

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                { "ASPNETCORE_ENVIRONMENT", "Production" },
                { "Facility:BaseDomain", "example.com" }
            })
            .Build();

        var handler = new GetFacilitiesQueryHandler(_context, config);
        var result = await handler.Handle(new GetFacilitiesQuery(TenantSlug), CancellationToken.None);

        Assert.NotNull(result);
        var dto = result.First(f => f.Id == facility.Id);
        Assert.Null(dto.ConsoleUrl);
    }


    [Fact]
    public async Task CreateFacilityCommand_LicenseMessageCarriesConsoleUrl_AndGoesToTheFacilityMailbox()
    {
        var mockGuard = new Mock<IEntitlementGuard>();

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                { "Facility:BaseDomain", "customdomain.net" },
                { "Facility:Subdomains:Clinic", "clinic" }
            })
            .Build();

        var handler = TestSupport.CreateFacilityHandler(_context, mockGuard.Object, config);
        var command = new CreateFacilityCommand(_tenantId.ToString(), FacilityType.Clinic, "Metro Urgent Care", Slug: "metro-urgent");

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.True(result.Success);
        var facility = await _context.Facilities.SingleAsync(f => f.Slug == "metro-urgent");

        var licenses = TestSupport.Outbox(_context, InteropTypes.FacilityLicenseIssued);
        Assert.Equal(2, licenses.Count);
        var license = licenses.Single(m => m.To.Service is null);
        var billingLicense = licenses.Single(m => m.To.Service == InteropServices.Billing);
        Assert.Equal(license.To with { Service = InteropServices.Billing }, billingLicense.To);
        Assert.Equal(license.CorrelationId, billingLicense.CorrelationId);
        Assert.Equal(license.GetPayload<FacilityCreatedEvent>(), billingLicense.GetPayload<FacilityCreatedEvent>());
        Assert.Equal(PartyKind.Facility, license.To.Kind);
        Assert.Equal(facility.Id.ToString(), license.To.FacilityId);
        Assert.Equal(_tenantId.ToString(), license.To.TenantId);
        Assert.Equal(facility.Id, license.CorrelationId);
        var payload = license.GetPayload<FacilityCreatedEvent>();
        Assert.Equal("metro-urgent", payload.Slug);
        Assert.Equal("https://metro-urgent.clinic.customdomain.net", payload.ConsoleUrl);
        Assert.False(string.IsNullOrEmpty(payload.LicenseToken));
    }

    [Fact]
    public async Task CreateFacilityCommand_PatientCatalogCopyNeverCarriesTheLicense()
    {
        var handler = TestSupport.CreateFacilityHandler(_context, new Mock<IEntitlementGuard>().Object);

        await handler.Handle(new CreateFacilityCommand(_tenantId.ToString(), FacilityType.Clinic, "Catalog Clinic"), CancellationToken.None);

        var directory = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated)
            .Single(m => m.To.Kind == PartyKind.ControlPlane && m.To.Service == InteropServices.Patient);
        Assert.Equal(InteropServices.Patient, directory.To.Service);
        var payload = directory.GetPayload<FacilityCreatedEvent>();
        Assert.Equal("Catalog Clinic", payload.Name);
        Assert.Null(payload.LicenseToken);
        Assert.Null(payload.Limits);
    }

    [Fact]
    public async Task CreateFacilityCommand_StagesFacilityMessagesAtomicallyWithTheFacility()
    {
        var handler = TestSupport.CreateFacilityHandler(_context, new Mock<IEntitlementGuard>().Object);

        await handler.Handle(new CreateFacilityCommand(_tenantId.ToString(), FacilityType.Clinic, "Atomic Clinic"), CancellationToken.None);

        // One SaveChanges produced the facility and every message about it (licence, catalogue copy, directory feed).
        Assert.Single(_context.Facilities);
        Assert.NotEmpty(_context.InteropOutbox);
        Assert.All(_context.InteropOutbox, m => Assert.Null(m.DispatchedAtUtc));
    }

    [Fact]
    public async Task CreateFacilityCommand_InitialStatusIsProvisioning()
    {
        await TestSupport.SeedSubscriptionAsync(_context, _tenantId, planSlug: "starter");
        var handler = TestSupport.CreateFacilityHandler(_context, new Mock<IEntitlementGuard>().Object);
        var command = new CreateFacilityCommand(_tenantId.ToString(), FacilityType.Clinic, "Brand New Clinic");

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.True(result.Success);
        var facility = await _context.Facilities.FirstOrDefaultAsync(f => f.Name == "Brand New Clinic");
        Assert.NotNull(facility);
        Assert.Equal(FacilityStatus.Provisioning, facility.Status);
        Assert.Equal("brand-new-clinic", facility.Slug);
        Assert.NotNull(facility.LicenseToken);
        Assert.Equal(10, facility.MaxStaffLimit);
        Assert.Equal(FacilityVisibility.Private, facility.Visibility);
    }

    [Theory]
    [InlineData("starter")]
    [InlineData("pro")]
    public async Task CreateFacilityCommand_DerivesPlanTierFromTheWorkspaceSubscription(string planSlug)
    {
        await TestSupport.SeedSubscriptionAsync(_context, _tenantId, planSlug: planSlug);

        var handler = TestSupport.CreateFacilityHandler(_context, new Mock<IEntitlementGuard>().Object);
        await handler.Handle(new CreateFacilityCommand(_tenantId.ToString(), FacilityType.Clinic, "Tiered Clinic"), CancellationToken.None);

        var facility = await _context.Facilities.SingleAsync();
        Assert.Equal(planSlug, facility.PlanTier);
        var license = TestSupport.Outbox(_context, InteropTypes.FacilityLicenseIssued).Single(m => m.To.Service is null).GetPayload<FacilityCreatedEvent>();
        Assert.Equal(planSlug, license.PlanTier);
    }

    [Fact]
    public void CreateFacilityCommand_HasNoCallerSuppliedPlanTier()
    {
        Assert.DoesNotContain(typeof(CreateFacilityCommand).GetProperties(), p => p.Name == "PlanTier");
    }

    [Fact]
    public async Task CreateFacilityCommand_StagesFacilityCreatedWebhookWithoutTheLicense()
    {
        _context.WebhookEndpoints.Add(new WebhookEndpoint
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Url = "https://hooks.metro.ph/clinicez",
            SigningSecret = "signing-secret",
            Events = IntegrationCatalog.EventFacilityCreated,
            IsActive = true
        });
        await _context.SaveChangesAsync();

        var handler = TestSupport.CreateFacilityHandler(_context, new Mock<IEntitlementGuard>().Object);
        await handler.Handle(new CreateFacilityCommand(_tenantId.ToString(), FacilityType.Clinic, "Hooked Clinic"), CancellationToken.None);

        var delivery = await _context.WebhookDeliveries.SingleAsync();
        Assert.Equal(IntegrationCatalog.EventFacilityCreated, delivery.EventType);
        Assert.Contains("Hooked Clinic", delivery.Payload);
        Assert.DoesNotContain("licenseToken", delivery.Payload, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task CreateFacilityCommand_WithCustomSlug_AssignsCustomSlug()
    {
        var handler = TestSupport.CreateFacilityHandler(_context, new Mock<IEntitlementGuard>().Object);
        var command = new CreateFacilityCommand(
            _tenantId.ToString(),
            FacilityType.Clinic,
            "Apex Health Manila",
            Slug: "apex-mnl");

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.True(result.Success);
        var facility = await _context.Facilities.FirstOrDefaultAsync(f => f.Name == "Apex Health Manila");
        Assert.NotNull(facility);
        Assert.Equal("apex-mnl", facility.Slug);
    }

    [Fact]
    public async Task CreateFacilityCommand_WithDuplicateSlug_ThrowsInvalidOperationException()
    {
        var facility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Name = "Existing Facility",
            Slug = "taken-subdomain",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active,
            CreatedAt = DateTime.UtcNow
        };
        _context.Facilities.Add(facility);
        await _context.SaveChangesAsync();

        var handler = TestSupport.CreateFacilityHandler(_context, new Mock<IEntitlementGuard>().Object);
        var command = new CreateFacilityCommand(
            _tenantId.ToString(),
            FacilityType.Clinic,
            "Another Clinic",
            Slug: "taken-subdomain");

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() => handler.Handle(command, CancellationToken.None));
        Assert.Contains("already taken", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task FacilityProvisionedHandler_SuccessEvent_TransitionsStatusToActive()
    {
        var facility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Name = "Pending Pharmacy Branch",
            FacilityType = FacilityType.Pharmacy,
            Status = FacilityStatus.Provisioning,
            CreatedAt = DateTime.UtcNow
        };
        _context.Facilities.Add(facility);
        await _context.SaveChangesAsync();

        var handler = new FacilityProvisionedHandler(_context, NullLogger<FacilityProvisionedHandler>.Instance);

        await handler.HandleAsync(
            new FacilityProvisionedEvent
            {
                ResourceId = facility.Id,
                TenantId = _tenantId.ToString(),
                Success = true,
                Message = "Pharmacy successfully provisioned"
            },
            Report(facility),
            CancellationToken.None);

        var updatedFacility = await _context.Facilities.FirstOrDefaultAsync(f => f.Id == facility.Id);
        Assert.NotNull(updatedFacility);
        Assert.Equal(FacilityStatus.Active, updatedFacility.Status);
    }

    [Fact]
    public async Task FacilityProvisionedHandler_FailureEvent_MarksFacilityFailed()
    {
        var facility = await AddFacilityAsync(FacilityStatus.Provisioning);
        var handler = new FacilityProvisionedHandler(_context, NullLogger<FacilityProvisionedHandler>.Instance);

        await handler.HandleAsync(new FacilityProvisionedEvent { ResourceId = facility.Id, TenantId = _tenantId.ToString(), Success = false },
            Report(facility), CancellationToken.None);

        Assert.Equal(FacilityStatus.Failed, (await _context.Facilities.SingleAsync()).Status);
    }

    [Fact]
    public async Task FacilityProvisionedHandler_IsIdempotent_AndDoesNotRevertASettledFacility()
    {
        var facility = await AddFacilityAsync(FacilityStatus.Suspended);
        var handler = new FacilityProvisionedHandler(_context, NullLogger<FacilityProvisionedHandler>.Instance);
        var message = new FacilityProvisionedEvent { ResourceId = facility.Id, TenantId = _tenantId.ToString(), Success = true };

        await handler.HandleAsync(message, Report(facility), CancellationToken.None);
        await handler.HandleAsync(message, Report(facility), CancellationToken.None);

        Assert.Equal(FacilityStatus.Suspended, (await _context.Facilities.SingleAsync()).Status);
    }

    [Fact]
    public async Task FacilityProvisionedHandler_IgnoresReportsFromAnotherFacility()
    {
        var facility = await AddFacilityAsync(FacilityStatus.Provisioning);
        var handler = new FacilityProvisionedHandler(_context, NullLogger<FacilityProvisionedHandler>.Instance);
        var message = new FacilityProvisionedEvent { ResourceId = facility.Id, TenantId = _tenantId.ToString(), Success = true };

        var foreignSender = Party.ForFacility(Guid.NewGuid().ToString(), Guid.NewGuid().ToString(), FacilityType.Clinic);
        await handler.HandleAsync(message, ContextFrom(foreignSender), CancellationToken.None);

        Assert.Equal(FacilityStatus.Provisioning, (await _context.Facilities.SingleAsync()).Status);
    }

    [Fact]
    public async Task FacilityProvisionedHandler_IgnoresReportsFromTheSameTenantsOtherFacility()
    {
        var facility = await AddFacilityAsync(FacilityStatus.Provisioning);
        var handler = new FacilityProvisionedHandler(_context, NullLogger<FacilityProvisionedHandler>.Instance);
        var message = new FacilityProvisionedEvent { ResourceId = facility.Id, TenantId = _tenantId.ToString(), Success = true };

        var sibling = Party.ForFacility(_tenantId.ToString(), Guid.NewGuid().ToString(), FacilityType.Clinic);
        await handler.HandleAsync(message, ContextFrom(sibling), CancellationToken.None);

        Assert.Equal(FacilityStatus.Provisioning, (await _context.Facilities.SingleAsync()).Status);
    }

    private async Task<Facility> AddFacilityAsync(FacilityStatus status)
    {
        var facility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Name = "Subject Clinic",
            FacilityType = FacilityType.Clinic,
            Status = status,
            CreatedAt = DateTime.UtcNow
        };
        _context.Facilities.Add(facility);
        await _context.SaveChangesAsync();
        return facility;
    }

    private InteropMessageContext Report(Facility facility) =>
        ContextFrom(Party.ForFacility(facility.TenantId.ToString(), facility.Id.ToString(), facility.FacilityType));

    private static InteropMessageContext ContextFrom(Party from) =>
        new(InteropEnvelope.Create(InteropTypes.FacilityProvisioned, from, Party.Portal, Guid.NewGuid(), new FacilityProvisionedEvent()));
}
