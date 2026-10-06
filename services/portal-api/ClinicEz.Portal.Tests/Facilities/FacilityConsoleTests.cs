using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Application.Features.Admin.Consumers;
using ClinicEz.Portal.Application.Features.Admin.Queries;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
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
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _context = new ApplicationDbContext(options);

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
                { "Console:BaseDomain", "custom-dev.example.net" }
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
    public async Task GetFacilities_WhenForceLocal_ResolvesLocalhostPort()
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
                { "Console:ForceLocal", "true" },
                { "Console:DevPorts:Clinic", "8081" }
            })
            .Build();

        var handler = new GetFacilitiesQueryHandler(_context, config);
        var result = await handler.Handle(new GetFacilitiesQuery(TenantSlug), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Single(result);
        var dto = result[0];
        Assert.Equal("downtown-family-clinic", dto.Slug);
        Assert.Equal($"http://localhost:8081?tenant={TenantSlug}", dto.ConsoleUrl);
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
                { "Console:BaseDomain", "enterprise-group.org" }
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
                { "Console:BaseDomain", "clinicez.net" }
            })
            .Build();

        var handler = new GetFacilitiesQueryHandler(_context, config);
        var result = await handler.Handle(new GetFacilitiesQuery(TenantSlug), CancellationToken.None);

        Assert.NotNull(result);
        var dto = result.First(f => f.Id == facility.Id);
        Assert.Null(dto.ConsoleUrl);
    }

    [Fact]
    public async Task CreateFacilityCommand_InitialStatusIsProvisioning()
    {
        var mockPublish = new Mock<IPublishEndpoint>();
        var mockGuard = new Mock<ITenantFeatureGuard>();
        var licenseSigner = new ClinicEz.Shared.Licensing.FacilityLicenseSigner();

        var handler = new CreateFacilityCommandHandler(_context, mockPublish.Object, mockGuard.Object, licenseSigner);
        var command = new CreateFacilityCommand(_tenantId.ToString(), FacilityType.Clinic, "Brand New Clinic");

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.True(result);
        var facility = await _context.Facilities.FirstOrDefaultAsync(f => f.Name == "Brand New Clinic");
        Assert.NotNull(facility);
        Assert.Equal(FacilityStatus.Provisioning, facility.Status);
        Assert.Equal("brand-new-clinic", facility.Slug);
        Assert.NotNull(facility.LicenseToken);
        Assert.Equal(5, facility.MaxStaffLimit);
    }

    [Fact]
    public async Task CreateFacilityCommand_WithCustomSlug_AssignsCustomSlug()
    {
        var mockPublish = new Mock<IPublishEndpoint>();
        var mockGuard = new Mock<ITenantFeatureGuard>();
        var licenseSigner = new ClinicEz.Shared.Licensing.FacilityLicenseSigner();

        var handler = new CreateFacilityCommandHandler(_context, mockPublish.Object, mockGuard.Object, licenseSigner);
        var command = new CreateFacilityCommand(
            _tenantId.ToString(), 
            FacilityType.Clinic, 
            "Apex Health Manila", 
            Slug: "apex-mnl");

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.True(result);
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

        var mockPublish = new Mock<IPublishEndpoint>();
        var mockGuard = new Mock<ITenantFeatureGuard>();
        var licenseSigner = new ClinicEz.Shared.Licensing.FacilityLicenseSigner();

        var handler = new CreateFacilityCommandHandler(_context, mockPublish.Object, mockGuard.Object, licenseSigner);
        var command = new CreateFacilityCommand(
            _tenantId.ToString(), 
            FacilityType.Clinic, 
            "Another Clinic", 
            Slug: "taken-subdomain");

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() => handler.Handle(command, CancellationToken.None));
        Assert.Contains("already taken", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task FacilityProvisionedEventConsumer_SuccessEvent_TransitionsStatusToActive()
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

        var consumer = new FacilityProvisionedEventConsumer(_context);

        var contextMock = new Mock<ConsumeContext<FacilityProvisionedEvent>>();
        contextMock.Setup(c => c.Message).Returns(new FacilityProvisionedEvent
        {
            ResourceId = facility.Id,
            TenantId = _tenantId.ToString(),
            Success = true,
            Message = "Pharmacy successfully provisioned"
        });
        contextMock.Setup(c => c.CancellationToken).Returns(CancellationToken.None);

        await consumer.Consume(contextMock.Object);

        var updatedFacility = await _context.Facilities.FirstOrDefaultAsync(f => f.Id == facility.Id);
        Assert.NotNull(updatedFacility);
        Assert.Equal(FacilityStatus.Active, updatedFacility.Status);
    }
}
