using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Infrastructure.Consumers;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using FluentAssertions;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Consumers;

public class FacilityCreatedConsumerTests : IDisposable
{
    private readonly ApplicationDbContext _dbContext;
    private readonly FacilityCreatedConsumer _consumer;

    public FacilityCreatedConsumerTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        _dbContext = new ApplicationDbContext(options);
        _consumer = new FacilityCreatedConsumer(_dbContext, NullLogger<FacilityCreatedConsumer>.Instance);
    }

    public void Dispose()
    {
        _dbContext.Database.EnsureDeleted();
        _dbContext.Dispose();
    }

    [Fact]
    public async Task Consume_ClinicFacility_CreatesClinicAndPublishesProvisionedEvent()
    {
        // Arrange
        var resourceId = Guid.NewGuid();
        var message = new FacilityCreatedEvent
        {
            ResourceId = resourceId,
            TenantId = "tenant-metro-1",
            FacilityType = FacilityType.Clinic,
            Name = "Metro General Clinic"
        };

        var context = Substitute.For<ConsumeContext<FacilityCreatedEvent>>();
        context.Message.Returns(message);
        context.CancellationToken.Returns(CancellationToken.None);

        // Act
        await _consumer.Consume(context);

        // Assert
        var clinic = await _dbContext.Clinics.FirstOrDefaultAsync(c => c.Id == resourceId);
        clinic.Should().NotBeNull();
        clinic!.Name.Should().Be("Metro General Clinic");
        clinic.BaseUrl.Should().Be("https://metro-general-clinic.clinicez.net/api/v1");
        clinic.IsPublic.Should().BeTrue();
        clinic.SupportsAppointments.Should().BeTrue();

        await context.Received(1).Publish(
            Arg.Is<FacilityProvisionedEvent>(e =>
                e.ResourceId == resourceId &&
                e.TenantId == "tenant-metro-1" &&
                e.Success == true),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Consume_ExistingClinic_UpdatesNameAndPublishesProvisionedEvent()
    {
        // Arrange
        var resourceId = Guid.NewGuid();
        var existingClinic = new Clinic
        {
            Id = resourceId,
            Name = "Old Clinic Name",
            BaseUrl = "https://old-clinic.clinicez.net/api/v1"
        };
        await _dbContext.Clinics.AddAsync(existingClinic);
        await _dbContext.SaveChangesAsync();

        var message = new FacilityCreatedEvent
        {
            ResourceId = resourceId,
            TenantId = "tenant-metro-1",
            FacilityType = FacilityType.Clinic,
            Name = "Updated Clinic Name"
        };

        var context = Substitute.For<ConsumeContext<FacilityCreatedEvent>>();
        context.Message.Returns(message);
        context.CancellationToken.Returns(CancellationToken.None);

        // Act
        await _consumer.Consume(context);

        // Assert
        var clinic = await _dbContext.Clinics.FirstOrDefaultAsync(c => c.Id == resourceId);
        clinic.Should().NotBeNull();
        clinic!.Name.Should().Be("Updated Clinic Name");

        await context.Received(1).Publish(
            Arg.Is<FacilityProvisionedEvent>(e => e.ResourceId == resourceId && e.Success == true),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Consume_OrganizationFacility_CreatesOrganizationAndPublishesProvisionedEvent()
    {
        // Arrange
        var resourceId = Guid.NewGuid();
        var message = new FacilityCreatedEvent
        {
            ResourceId = resourceId,
            TenantId = "tenant-org-1",
            FacilityType = FacilityType.Organization,
            Name = "North Health Alliance"
        };

        var context = Substitute.For<ConsumeContext<FacilityCreatedEvent>>();
        context.Message.Returns(message);
        context.CancellationToken.Returns(CancellationToken.None);

        // Act
        await _consumer.Consume(context);

        // Assert
        var org = await _dbContext.Organizations.FirstOrDefaultAsync(o => o.Id == resourceId);
        org.Should().NotBeNull();
        org!.Name.Should().Be("North Health Alliance");
        org.Slug.Should().Be("north-health-alliance");
        org.IsPublic.Should().BeTrue();

        await context.Received(1).Publish(
            Arg.Is<FacilityProvisionedEvent>(e => e.ResourceId == resourceId && e.Success == true),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Consume_PharmacyFacility_DoesNotCreateClinicOrOrganization()
    {
        // Arrange
        var resourceId = Guid.NewGuid();
        var message = new FacilityCreatedEvent
        {
            ResourceId = resourceId,
            TenantId = "tenant-pharmacy-1",
            FacilityType = FacilityType.Pharmacy,
            Name = "Central Rx"
        };

        var context = Substitute.For<ConsumeContext<FacilityCreatedEvent>>();
        context.Message.Returns(message);
        context.CancellationToken.Returns(CancellationToken.None);

        // Act
        await _consumer.Consume(context);

        // Assert
        var clinic = await _dbContext.Clinics.FirstOrDefaultAsync(c => c.Id == resourceId);
        var org = await _dbContext.Organizations.FirstOrDefaultAsync(o => o.Id == resourceId);
        clinic.Should().BeNull();
        org.Should().BeNull();
        await context.DidNotReceive().Publish(Arg.Any<FacilityProvisionedEvent>(), Arg.Any<CancellationToken>());
    }
}
