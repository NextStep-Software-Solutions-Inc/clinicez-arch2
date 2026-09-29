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
    public async Task GetFacilities_InDevelopment_ResolvesLocalhostPort()
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
                { "Console:DevPorts:Clinic", "8081" }
            })
            .Build();

        var handler = new GetFacilitiesQueryHandler(_context, config);
        var result = await handler.Handle(new GetFacilitiesQuery(TenantSlug), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Single(result);
        var dto = result[0];
        Assert.Equal("downtown-family-clinic", dto.Slug);
        Assert.Equal($"http://localhost:8081?tenant={TenantSlug}&facilityId={facility.Id}", dto.ConsoleUrl);
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
                { "Console:BaseDomain", "clinicez.ph" }
            })
            .Build();

        var handler = new GetFacilitiesQueryHandler(_context, config);
        var result = await handler.Handle(new GetFacilitiesQuery(TenantSlug), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Single(result);
        var dto = result[0];
        Assert.Equal("metro-st-jude-diagnostic-lab", dto.Slug);
        Assert.Equal($"https://lab.clinicez.ph?tenant={TenantSlug}&facilityId={facility.Id}", dto.ConsoleUrl);
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
                { "Console:BaseDomain", "clinicez.ph" }
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

        var handler = new CreateFacilityCommandHandler(_context, mockPublish.Object, mockGuard.Object);
        var command = new CreateFacilityCommand(_tenantId.ToString(), FacilityType.Clinic, "Brand New Clinic");

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.True(result);
        var facility = await _context.Facilities.FirstOrDefaultAsync(f => f.Name == "Brand New Clinic");
        Assert.NotNull(facility);
        Assert.Equal(FacilityStatus.Provisioning, facility.Status);
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
